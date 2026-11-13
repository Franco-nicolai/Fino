import { neon } from '@neondatabase/serverless';

const reply = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

export default async function handler(request) {
  // The entire deployment must also be protected with Vercel Authentication.
  // A missing readiness flag or database keeps the financial API closed.
  if (process.env.FINO_PRIVATE_READY !== 'enabled' || !process.env.DATABASE_URL) {
    return reply({ error: 'Configuración privada pendiente' }, 503);
  }
  const url = new URL(request.url);
  const space = url.searchParams.get('space');
  if (!['personal', 'demo'].includes(space)) return reply({ error: 'Espacio inválido' }, 404);
  if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'Método no permitido' }, 405);
  if (request.method === 'PUT') {
    if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) {
      return reply({ error: 'Origen o formato inválido' }, 403);
    }
    if (Number(request.headers.get('content-length')) > 4_000_000) return reply({ error: 'Datos demasiado grandes' }, 413);
  }
  const sql = neon(process.env.DATABASE_URL);
  try {
    if (request.method === 'GET') {
      const rows = await sql`SELECT revision, state FROM spaces WHERE space = ${space}`;
      return reply({ revision: rows[0]?.revision ?? 0, state: rows[0]?.state ?? null });
    }
    const raw = await request.text();
    if (raw.length > 4_000_000) return reply({ error: 'Datos demasiado grandes' }, 413);
    let incoming;
    try { incoming = JSON.parse(raw); } catch { return reply({ error: 'JSON inválido' }, 400); }
    if (!incoming || typeof incoming.state !== 'object' || incoming.state === null || Array.isArray(incoming.state)
      || !Number.isSafeInteger(incoming.revision) || incoming.revision < 0) return reply({ error: 'Datos inválidos' }, 400);
    const state = JSON.stringify(incoming.state);
    const rows = incoming.revision === 0
      ? await sql`INSERT INTO spaces (space, revision, state) VALUES (${space}, 1, ${state}::jsonb)
          ON CONFLICT (space) DO NOTHING RETURNING revision`
      : await sql`UPDATE spaces SET state = ${state}::jsonb, revision = revision + 1
          WHERE space = ${space} AND revision = ${incoming.revision} RETURNING revision`;
    return rows.length ? reply({ revision: rows[0].revision }) : reply({ error: 'Revisión modificada' }, 409);
  } catch {
    return reply({ error: 'No se pudo acceder a la base de datos' }, 500);
  }
}
