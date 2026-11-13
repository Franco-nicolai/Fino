# Fino

Aplicación web privada de finanzas personales. La raíz de este repositorio es el proyecto Cloudflare Worker: `public/` contiene la interfaz, `src/` la API y `schema.sql` la estructura D1.

Consulta [LEEME.md](LEEME.md) para configurar D1, Cloudflare Access, importar el respaldo JSON y desplegar. Antes de publicar, reemplaza el `database_id` de `wrangler.jsonc` y configura `TEAM_DOMAIN`, `POLICY_AUD` y `OWNER_EMAIL`. Sin esas variables la aplicación responde 403.

La versión local y el proyecto nativo macOS permanecen en `Development/Fino_2` durante la migración. No subas respaldos financieros al repositorio.
