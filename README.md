# Fino

Aplicación privada de finanzas personales desplegada en Vercel. El acceso de Fino usa Supabase Auth y los datos viven en `public.spaces` en Supabase.

## Acceso y datos

- La pantalla de inicio acepta únicamente `fncorvalan@uc.cl`; la cuenta debe existir en Supabase Auth.
- El navegador usa la clave **publicable** del proyecto. RLS limita cada fila al `user_id` de la sesión; no se usa una clave secreta en el cliente.
- Los cambios se escriben en Supabase con control de revisión para detectar ediciones concurrentes.
- La fila personal migrada conserva la revisión 24 y coincide con el respaldo de Neon. Neon se mantiene intacto como copia anterior; la aplicación ya no lo usa para movimientos.
- `/api/spaces` devuelve 410 y no sirve la antigua tabla pública de Neon.
- `supabase/schema.sql` documenta la tabla y sus políticas. No subir claves secretas, contraseñas ni respaldos al repositorio.

## ChatGPT (MCP)

El MCP de `/api/mcp` consulta Supabase con el token OAuth del usuario, verifica el correo permitido y conserva RLS al leer `public.spaces`. Solo ofrece herramientas de lectura: resumen, movimientos, cuentas/deudas y presupuestos/objetivos. El consentimiento usa la sesión de Fino y bloquea redirecciones que no sean de `chatgpt.com`.

Para activarlo en Supabase, falta habilitar **Authentication → OAuth Server**, configurar el sitio `https://fino-nu.vercel.app`, usar `/auth/consent` como Authorization Path y permitir registro dinámico de clientes para ChatGPT. La configuración activa permisos de OAuth sobre datos financieros; no se debe habilitar hasta confirmar esa autorización. Tras activarlo, agrega en ChatGPT la URL `https://fino-nu.vercel.app/api/mcp` con autenticación OAuth.

El presupuesto por proyecto presenta en una sola conciliación el límite, el estimado virtual, el consumo real asociado y la diferencia por categoría. Los movimientos rendidos siguen siendo los únicos que afectan las cuentas contables.
