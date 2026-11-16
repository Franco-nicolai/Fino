export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const baseURL = process.env.NEON_AUTH_BASE_URL;
  const allowedEmail = process.env.FINO_ALLOWED_EMAIL?.trim().toLowerCase();
  if (!baseURL || !allowedEmail) return response.status(503).json({ error: 'Configuración de acceso pendiente' });
  return response.status(200).json({ baseURL, allowedEmail });
}
