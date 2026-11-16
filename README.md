# Fino

Aplicación privada de finanzas personales para Vercel. `public/index.html` contiene la interfaz, `api/spaces.js` guarda los datos en Postgres y `schema.sql` crea la tabla.

## Activación

1. En Vercel, abre el proyecto **fino** → **Security → Deployment Protection** y activa **Vercel Authentication → All Deployments**. Confirma que tanto producción como vistas previas pidan inicio de sesión y que no existan excepciones públicas para este proyecto.
2. En **Storage / Marketplace**, conecta una base **Neon Postgres** a este proyecto. Verifica en **Settings → Environment Variables** que `DATABASE_URL` exista en Production y Preview. El servidor no guarda datos sin esa variable.
3. La API crea la tabla `spaces` al primer acceso; `schema.sql` documenta su estructura y sirve para restaurarla manualmente.
4. Solo después de comprobar que todos los enlaces piden inicio de sesión, agrega la variable `FINO_PRIVATE_READY=enabled` en Vercel y vuelve a desplegar. Sin esa variable la API responde 503 y no muestra ni guarda datos.
5. Abre Fino, crea un registro de prueba, recarga la página y comprueba que persista. Luego importa el respaldo JSON exportado desde tu versión local. Verifica saldos, movimientos e informes antes de dejar de usar el archivo local.

## Acceso propio de Fino

Fino usa Neon Auth para el login independiente de Vercel. `NEON_AUTH_BASE_URL` debe estar disponible desde la integración de Neon y `FINO_ALLOWED_EMAIL` contiene el único correo autorizado. La aplicación verifica la firma del token, que la cuenta esté verificada y que el correo coincida antes de leer o guardar datos.

Mantén Vercel Authentication activo mientras configuras Neon Auth y creas tu cuenta. Habilita el acceso por correo y contraseña y la verificación por correo en Neon; el correo de verificación y recuperación debe poder enviarse. Entra a Fino, crea la cuenta para el correo autorizado, verifica el correo e inicia sesión. Cuando la pantalla y la persistencia funcionen, se puede quitar Vercel Authentication para compartir el enlace: los datos seguirán protegidos por el login propio y la API.

`npm install` se ejecuta en la infraestructura de Vercel al desplegar desde GitHub. No hace falta instalar Node ni crear un entorno virtual en tu Mac.

No pongas `DATABASE_URL`, respaldos JSON ni otros datos financieros en GitHub. `FINO_PRIVATE_READY` es una barrera de configuración y no sustituye la autenticación.
