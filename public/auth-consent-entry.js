import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vccssdgdffbvvkfthgjd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ev5PsvPgeFE_JMYEOCAtbg_xWHWe9PU';
const AUTH_SESSION_KEY = 'fino-supabase-session-v1';
const ALLOWED_EMAIL = 'fncorvalan@uc.cl';
const status = document.getElementById('status');
const allow = document.getElementById('allow');
const deny = document.getElementById('deny');
let authorizationId = '';
let ready = false;

const storage = {
  getItem(key) { return key === 'sb-vccssdgdffbvvkfthgjd-auth-token' ? localStorage.getItem(AUTH_SESSION_KEY) : null; },
  setItem(key, value) { if (key === 'sb-vccssdgdffbvvkfthgjd-auth-token') localStorage.setItem(AUTH_SESSION_KEY, value); },
  removeItem(key) { if (key === 'sb-vccssdgdffbvvkfthgjd-auth-token') localStorage.removeItem(AUTH_SESSION_KEY); },
};
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

async function initialize() {
  authorizationId = new URLSearchParams(location.search).get('authorization_id') || '';
  if (!authorizationId) throw new Error('Falta el identificador de autorización. Vuelve a iniciar la conexión desde ChatGPT.');
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.email?.trim().toLowerCase() !== ALLOWED_EMAIL || !user.email_confirmed_at) {
    throw new Error('Abre Fino en otra pestaña, inicia sesión con tu correo autorizado, vuelve aquí y recarga esta página.');
  }
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) throw new Error(error?.message || 'No se pudo verificar la solicitud OAuth.');
  if (!('authorization_id' in data)) {
    location.replace(data.redirect_url);
    return;
  }
  const callback = new URL(data.redirect_uri);
  if (callback.hostname !== 'chatgpt.com') throw new Error('Se bloqueó la solicitud: la redirección no pertenece a ChatGPT.');
  document.getElementById('client-name').textContent = data.client?.name || 'ChatGPT';
  document.getElementById('client-host').textContent = `Redirección verificada: ${callback.host}`;
  const scopes = (data.scope || '').trim().split(/\s+/).filter(Boolean);
  document.getElementById('permissions').textContent = [
    'Solo lectura: resumen financiero, movimientos, cuentas, deudas, presupuestos y objetivos.',
    'No permite crear, editar ni eliminar datos.',
    scopes.length ? `Permisos OAuth solicitados: ${scopes.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  ready = true;
  allow.disabled = false;
  deny.disabled = false;
}

async function answer(accept) {
  if (!ready) return;
  allow.disabled = true;
  deny.disabled = true;
  status.textContent = accept ? 'Autorizando lectura…' : 'Denegando acceso…';
  const result = accept
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId);
  if (result.error) {
    status.textContent = result.error.message || 'No se pudo guardar la decisión.';
    allow.disabled = false;
    deny.disabled = false;
    return;
  }
  location.replace(result.data.redirect_url);
}

allow.addEventListener('click', () => answer(true).catch(error => { status.textContent = error.message; }));
deny.addEventListener('click', () => answer(false).catch(error => { status.textContent = error.message; }));
initialize().catch(error => { status.textContent = error.message || 'No se pudo preparar la autorización.'; });
