import { createRemoteJWKSet, jwtVerify } from 'jose';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
let keys;

async function authorized(request, env) {
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD || !env.OWNER_EMAIL) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  try {
    const issuer = env.TEAM_DOMAIN.replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) return false;
    keys ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, keys, { issuer, audience: env.POLICY_AUD, algorithms: ['RS256'] });
    return typeof payload.email === 'string' && payload.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
  } catch { return false; }
}

export default {
  async fetch(request, env) {
    if (!await authorized(request, env)) return json({ error: 'Acceso privado requerido' }, 403);
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Método no permitido' }, 405);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'private, no-store');
      headers.set('x-content-type-options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    }
    const match = /^\/api\/spaces\/(personal|demo)$/.exec(url.pathname);
    if (!match) return json({ error: 'Ruta desconocida' }, 404);
    if (!env.DB) return json({ error: 'Base de datos no configurada' }, 503);
    const space = match[1];
    try {
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT state, revision FROM spaces WHERE space = ?').bind(space).first();
        return json({ state: row ? JSON.parse(row.state) : null, revision: row?.revision ?? 0 });
      }
      if (request.method !== 'PUT') return json({ error: 'Método no permitido' }, 405);
      if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) {
        return json({ error: 'Origen o formato inválido' }, 403);
      }
      if (Number(request.headers.get('content-length')) > 15_000_000) return json({ error: 'Archivo demasiado grande' }, 413);
      const raw = await request.text();
      if (raw.length > 15_000_000) return json({ error: 'Datos demasiado grandes' }, 413);
      const incoming = JSON.parse(raw);
      if (!incoming || typeof incoming.state !== 'object' || Array.isArray(incoming.state) || incoming.state === null ||
          !Number.isSafeInteger(incoming.revision) || incoming.revision < 0) return json({ error: 'Datos inválidos' }, 400);
      const serialized = JSON.stringify(incoming.state);
      // Optimistic revision update: concurrent tabs cannot silently overwrite each other.
      const result = incoming.revision === 0
        ? await env.DB.prepare('INSERT OR IGNORE INTO spaces (space, revision, state) VALUES (?, 1, ?)').bind(space, serialized).run()
        : await env.DB.prepare('UPDATE spaces SET state = ?, revision = revision + 1 WHERE space = ? AND revision = ?')
          .bind(serialized, space, incoming.revision).run();
      if (!result.meta.changes) return json({ error: 'Revisión modificada' }, 409);
      return json({ revision: incoming.revision + 1 });
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: 'JSON inválido' }, 400);
      return json({ error: 'Error de almacenamiento' }, 500);
    }
  },
};
