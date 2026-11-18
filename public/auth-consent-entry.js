import { createAuthClient } from '@neondatabase/auth';

const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const status = document.getElementById('status');
const allow = document.getElementById('allow');
const deny = document.getElementById('deny');
let auth;
let ready = false;

function throwAuthError(result, fallback) {
  if (result?.error) throw new Error(result.error.message || fallback);
}

async function initialize() {
  const params = new URLSearchParams(location.search);
  const clientId = params.get('client_id');
  if (clientId !== CHATGPT_CLIENT_ID) throw new Error('Esta autorización solo acepta conexiones iniciadas por ChatGPT.');

  const response = await fetch('/api/auth-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo verificar la cuenta de Fino.');
  const config = await response.json();
  auth = createAuthClient(config.baseURL);
  const session = await auth.getSession();
  const user = session?.data?.user ?? session?.user;
  if (!user) {
    location.replace('/' + location.search);
    return;
  }
  if (user.email?.trim().toLowerCase() !== config.allowedEmail || user.emailVerified !== true) {
    throw new Error('Esta cuenta de Fino no está autorizada para aprobar la conexión.');
  }

  const result = await auth.oauth2.publicClient({ query: { client_id: clientId } });
  throwAuthError(result, 'No se pudo validar la identidad de ChatGPT.');
  const client = result?.data;
  if (!client) throw new Error('No se recibió la identidad del cliente.');

  document.getElementById('client-name').textContent = client.client_name || 'ChatGPT';
  const hosts = (client.redirect_uris || []).map(uri => {
    try { return new URL(uri).host; } catch { return ''; }
  }).filter(Boolean);
  document.getElementById('client-host').textContent = hosts.length
    ? 'Cliente oficial · destinos de inicio de sesión: ' + [...new Set(hosts)].join(', ')
    : 'Cliente oficial de ChatGPT';

  const scope = params.get('scope');
  const resource = params.get('resource');
  document.getElementById('permissions').textContent = [
    'Lectura de resumen, movimientos, cuentas, deudas y presupuestos. Sin crear, modificar ni borrar datos.',
    scope ? 'Permisos OAuth: ' + scope : '',
    resource ? 'Recurso: ' + resource : '',
  ].filter(Boolean).join(' ');
  ready = true;
  allow.disabled = false;
}

async function answer(accept) {
  if (!ready) return;
  allow.disabled = true;
  deny.disabled = true;
  status.textContent = accept ? 'Autorizando…' : 'Denegando…';
  try {
    const result = await auth.oauth2.consent({ accept });
    throwAuthError(result, 'No se pudo guardar la decisión.');
  } catch (error) {
    status.textContent = error?.message || 'No se pudo guardar la decisión.';
    allow.disabled = false;
    deny.disabled = false;
  }
}

allow.addEventListener('click', () => answer(true));
deny.addEventListener('click', () => answer(false));
initialize().catch(error => {
  status.textContent = error?.message || 'No se pudo preparar la autorización.';
});
