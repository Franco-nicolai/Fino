import { neon } from '@neondatabase/serverless';

const send = (response, body, status = 200) => {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
};

export default async function handler(request, response) {
  // Vercel's Node.js request uses a relative URL, plain headers and a parsed body.
  // Deployment Protection covers the whole project; this flag keeps the API closed until setup.
  if (process.env.FINO_PRIVATE_READY !== 'enabled' || !process.env.DATABASE_URL) {
    return send(response, { error: 'Configuración privada pendiente' }, 503);
  }
  const url = new URL(request.url, 'https://fino.invalid');
  const space = url.searchParams.get('space');
  if (!['personal', 'demo'].includes(space)) return send(response, { error: 'Espacio inválido' }, 404);
  if (!['GET', 'PUT'].includes(request.method)) return send(response, { error: 'Método no permitido' }, 405);
  if (request.method === 'PUT') {
    const host = request.headers.host;
    if (!host || request.headers.origin !== `https://${host}`
      || !request.headers['content-type']?.startsWith('application/json')) {
      return send(response, { error: 'Origen o formato inválido' }, 403);
    }
    if (Number(request.headers['content-length']) > 4_000_000) return send(response, { error: 'Datos demasiado grandes' }, 413);
  }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS spaces (
      space TEXT PRIMARY KEY CHECK (space IN ('personal', 'demo')),
      revision INTEGER NOT NULL CHECK (revision > 0),
      state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object')
    )`;
    if (request.method === 'GET') {
      const rows = await sql`SELECT revision, state FROM spaces WHERE space = ${space}`;
      return send(response, { revision: rows[0]?.revision ?? 0, state: rows[0]?.state ?? null });
    }
    let incoming;
    try { incoming = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; }
    catch { return send(response, { error: 'JSON inválido' }, 400); }
    if (!incoming || typeof incoming.state !== 'object' || incoming.state === null || Array.isArray(incoming.state)
      || !Number.isSafeInteger(incoming.revision) || incoming.revision < 0) return send(response, { error: 'Datos inválidos' }, 400);
    const state = JSON.stringify(incoming.state);
    if (state.length > 4_000_000) return send(response, { error: 'Datos demasiado grandes' }, 413);
    const rows = incoming.revision === 0
      ? await sql`INSERT INTO spaces (space, revision, state) VALUES (${space}, 1, ${state}::jsonb)
          ON CONFLICT (space) DO NOTHING RETURNING revision`
      : await sql`UPDATE spaces SET state = ${state}::jsonb, revision = revision + 1
          WHERE space = ${space} AND revision = ${incoming.revision} RETURNING revision`;
    return rows.length ? send(response, { revision: rows[0].revision }) : send(response, { error: 'Revisión modificada' }, 409);
  } catch {
    return send(response, { error: 'No se pudo acceder a la base de datos' }, 500);
  }
}
