import { createAuthClient } from '@neondatabase/auth';

const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const status = document.getElementById('status');
const allow = document.getElementById('allow');
const deny = document.getElementById('deny');
let auth;
let ready = false;

function fail(result, fallback) {
  if (result?.error) throw new Error(result.error.message || fallback);
}

async function initialize() {
  const params = new URLSearchParams(location.search);
  if (params.get('client_id') !== CHATGPT_CLIENT_ID) {
    throw new Error('Esta autorización solo acepta conexiones iniciadas por ChatGPT.');
  }
  const configResponse = await fetch('/api/auth-config', { cache: 'no-store' });
  if (!configResponse.ok) throw new Error('No se pudo verificar la cuenta de Fino.');
  const config = await configResponse.json();
  auth = createAuthClient(config.baseURL);
  const session = await auth.getSession();
  const user = session?.data?.user ?? session?.user;
  if (!user || user.email?.trim().toLowerCase() !== config.allowedEmail || user.emailVerified !== true) {
    throw new Error('Inicia sesión en Fino con tu correo autorizado y vuelve a conectar ChatGPT.');
  }
  const result = await auth.oauth2.publicClient({ query: { client_id: CHATGPT_CLIENT_ID } });
  fail(result, 'No se pudo verificar el cliente de ChatGPT.');
  const client = result?.data;
  if (!client) throw new Error('No se recibió la identidad del cliente.');
  document.getElementById('client-name').textContent = client.client_name || 'ChatGPT';
  const redirectHosts = (client.redirect_uris || []).map(value => {
    try { return new URL(value).host; } catch { return ''; }
  }).filter(Boolean);
  document.getElementById('client-host').textContent = redirectHosts.length
    ? `Cliente oficial de ChatGPT · redirección: ${[...new Set(redirectHosts)].join(', ')}`
    : 'Cliente oficial de ChatGPT';
  const scope = params.get('scope');
  const resource = params.get('resource');
  document.getElementById('permissions').textContent = [
    'Lectura de resumen, movimientos, cuentas, deudas y presupuestos. Sin operaciones para escribir o borrar.',
    scope ? `Alcance OAuth: ${scope}` : '',
    resource ? `Recurso: ${resource}` : '',
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
    fail(result, 'No se pudo guardar la decisión.');
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
