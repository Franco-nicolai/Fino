# Fino

Aplicación privada de finanzas personales para Vercel. `public/index.html` contiene la interfaz, `api/spaces.js` guarda los datos en Postgres y `schema.sql` crea la tabla.

## Activación

1. En Vercel, abre el proyecto **fino** → **Security → Deployment Protection** y activa **Vercel Authentication → All Deployments**. Confirma que tanto producción como vistas previas pidan inicio de sesión y que no existan excepciones públicas para este proyecto.
2. En **Storage / Marketplace**, conecta una base **Neon Postgres** a este proyecto. Verifica en **Settings → Environment Variables** que `DATABASE_URL` exista en Production y Preview. El servidor no guarda datos sin esa variable.
3. La API crea la tabla `spaces` al primer acceso; `schema.sql` documenta su estructura y sirve para restaurarla manualmente.
4. Solo después de comprobar que todos los enlaces piden inicio de sesión, agrega la variable `FINO_PRIVATE_READY=enabled` en Vercel y vuelve a desplegar. Sin esa variable la API responde 503 y no muestra ni guarda datos.
5. Abre Fino, crea un registro de prueba, recarga la página y comprueba que persista. Luego importa el respaldo JSON exportado desde tu versión local. Verifica saldos, movimientos e informes antes de dejar de usar el archivo local.

`npm install` se ejecuta en la infraestructura de Vercel al desplegar desde GitHub. No hace falta instalar Node ni crear un entorno virtual en tu Mac.

No pongas `DATABASE_URL`, respaldos JSON ni otros datos financieros en GitHub. La autenticación de Vercel protege la aplicación completa; `FINO_PRIVATE_READY` es una barrera de configuración y no sustituye la protección de despliegue.
