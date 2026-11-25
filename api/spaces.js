export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(410).json({ error: 'Este almacenamiento fue reemplazado por Supabase.' });
}
