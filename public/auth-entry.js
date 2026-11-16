import { createAuthClient } from '@neondatabase/auth';

const gate = document.getElementById('auth-gate');
const form = document.getElementById('auth-form');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const status = document.getElementById('auth-status');
const submit = document.getElementById('auth-submit');
const create = document.getElementById('auth-create');
const help = document.getElementById('auth-help');
let auth;
let allowedEmail;
let resetToken = new URLSearchParams(location.search).get('token');

function throwAuthError(result, fallback) {
  if (result?.error) throw new Error(result.error.message || fallback);
}

function showGate(message = '') {
  document.documentElement.classList.add('auth-required');
  gate.hidden = false;
  status.textContent = message;
}

function showApp() {
  gate.hidden = true;
  document.documentElement.classList.remove('auth-required');
  let logout = document.getElementById('auth-logout');
  if (!logout) {
    logout = document.createElement('button');
    logout.id = 'auth-logout';
    logout.className = 'auth-logout';
    logout.type = 'button';
    logout.textContent = 'Cerrar sesión';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        await auth.signOut();
      } finally {
        window.finoAuthToken = '';
        location.reload();
      }
    });
    document.body.append(logout);
  }
}

async function currentUser() {
  const result = await auth.getSession();
  return result?.data?.user ?? result?.user ?? null;
}

async function validSession() {
  const user = await currentUser();
  if (!user || user.email?.trim().toLowerCase() !== allowedEmail || user.emailVerified !== true) return false;
  const token = await auth.getJWTToken?.();
  if (!token) return false;
  window.finoAuthToken = token;
  return true;
}

async function loadAuth() {
  const response = await fetch('/api/auth-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('El acceso aún no está configurado.');
  const config = await response.json();
  allowedEmail = config.allowedEmail;
  emailInput.value = allowedEmail;
  auth = createAuthClient(config.baseURL);
  if (resetToken) {
    document.getElementById('auth-title').textContent = 'Crea una contraseña nueva';
    document.querySelector('.auth-card > p').textContent = 'Elige una contraseña nueva para tu cuenta de Fino.';
    emailInput.closest('label').hidden = true;
    create.hidden = true;
    help.hidden = true;
    submit.textContent = 'Guardar contraseña';
    passwordInput.autocomplete = 'new-password';
    showGate();
    return false;
  }
  if (await validSession()) {
    showApp();
    return true;
  }
  showGate();
  return false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  create.disabled = true;
  status.textContent = 'Validando acceso…';
  try {
    if (resetToken) {
      const result = await auth.resetPassword({ newPassword: passwordInput.value, token: resetToken });
      throwAuthError(result, 'No se pudo cambiar la contraseña.');
      history.replaceState({}, '', location.pathname);
      resetToken = null;
      emailInput.closest('label').hidden = false;
      document.getElementById('auth-title').textContent = 'Tus finanzas, protegidas';
      document.querySelector('.auth-card > p').textContent = 'Inicia sesión con el correo autorizado para acceder a tus cuentas y movimientos.';
      create.hidden = false;
      help.hidden = false;
      submit.textContent = 'Iniciar sesión';
      passwordInput.value = '';
      passwordInput.autocomplete = 'current-password';
      status.textContent = 'Contraseña actualizada. Ya puedes iniciar sesión.';
      return;
    }
    const result = await auth.signIn.email({ email: allowedEmail, password: passwordInput.value });
    throwAuthError(result, 'No se pudo iniciar sesión. Revisa tu correo y contraseña.');
    if (!await validSession()) {
      status.textContent = 'La sesión no está verificada. Revisa el correo asociado a la cuenta y confirma tu dirección.';
      return;
    }
    location.reload();
  } catch (error) {
    status.textContent = error?.message || 'No se pudo iniciar sesión. Revisa tu correo y contraseña.';
  } finally {
    submit.disabled = false;
    create.disabled = false;
  }
});

create.addEventListener('click', async () => {
  const password = passwordInput.value;
  if (password.length < 8) {
    status.textContent = 'Usa una contraseña de al menos 8 caracteres.';
    passwordInput.focus();
    return;
  }
  submit.disabled = true;
  create.disabled = true;
  status.textContent = 'Creando tu cuenta…';
  try {
    const result = await auth.signUp.email({ email: allowedEmail, password, name: 'Franco Nicolai' });
    throwAuthError(result, 'No se pudo crear la cuenta.');
    status.textContent = 'Cuenta creada. Revisa tu correo para verificarla y luego inicia sesión.';
  } catch (error) {
    status.textContent = error?.message || 'No se pudo crear la cuenta. Si ya existe, inicia sesión.';
  } finally {
    submit.disabled = false;
    create.disabled = false;
  }
});

help.addEventListener('click', async () => {
  if (!passwordInput.value) {
    status.textContent = 'Escribe tu correo y solicita un enlace de recuperación.';
    return;
  }
  try {
    const result = await auth.requestPasswordReset({ email: allowedEmail, redirectTo: location.origin });
    throwAuthError(result, 'No se pudo solicitar el cambio de contraseña.');
    status.textContent = 'Si la cuenta existe, recibirás un enlace para cambiar la contraseña.';
  } catch (error) {
    status.textContent = error?.message || 'No se pudo solicitar el cambio de contraseña.';
  }
});

window.finoAuthReady = loadAuth().catch(error => {
  showGate(error.message || 'No se pudo conectar el acceso.');
  return false;
});
