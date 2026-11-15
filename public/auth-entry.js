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
    await auth.signIn.email({ email: allowedEmail, password: passwordInput.value });
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
    await auth.signUp.email({ email: allowedEmail, password, name: 'Franco Nicolai' });
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
    await auth.requestPasswordReset({ email: allowedEmail, redirectTo: location.origin });
    status.textContent = 'Si la cuenta existe, recibirás un enlace para cambiar la contraseña.';
  } catch (error) {
    status.textContent = error?.message || 'No se pudo solicitar el cambio de contraseña.';
  }
});

window.finoAuthReady = loadAuth().catch(error => {
  showGate(error.message || 'No se pudo conectar el acceso.');
  return false;
});
