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

`/api/mcp` todavía usa la autorización y la copia de Neon. No debe usarse para análisis actuales: requiere migrar su lectura a Supabase antes de volver a conectarlo.
