# Fino

Aplicación privada de finanzas personales para Vercel. Los movimientos se guardan en Neon Postgres.

## Acceso

La app ya no exige una cuenta ni contraseña propia de Fino. El proyecto conserva **Vercel Authentication / SSO para todos los despliegues**, que protege la interfaz y las API. Entra con la cuenta de Vercel autorizada para este proyecto.

No desactives Deployment Protection: sin esa barrera, cualquier persona con el enlace podría ver y modificar los datos financieros. La API acepta solicitudes same-origin y depende de la protección de Vercel.

## Datos

Configura `DATABASE_URL` y `FINO_PRIVATE_READY=enabled` en Vercel. La API crea la tabla `spaces` al primer acceso; `schema.sql` documenta su estructura. No subas credenciales ni respaldos al repositorio.

## ChatGPT (MCP)

El servidor MCP de solo lectura permanece separado del acceso normal a Fino. Para conectarlo aún se requiere configurar el proveedor OAuth de Neon y mantener la identidad autorizada en `FINO_ALLOWED_EMAIL`. El flujo OAuth de Neon puede pedir autenticación durante la conexión; no afecta el uso normal de la aplicación.
