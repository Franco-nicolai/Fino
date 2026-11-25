export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'public, max-age=300');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(200).json({
    resource: 'https://fino-nu.vercel.app/api/mcp',
    authorization_servers: ['https://vccssdgdffbvvkfthgjd.supabase.co/auth/v1'],
    scopes_supported: ['openid', 'email', 'offline_access'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://fino-nu.vercel.app/',
  });
}
