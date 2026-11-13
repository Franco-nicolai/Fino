# Fino en Cloudflare

Esta carpeta contiene la versión web privada. Conserva la interfaz y la contabilidad actuales; cambia el guardado a D1. Cada cambio se escribe en el servidor. No se descarga un JSON al cerrar: el navegador no garantiza que una descarga al cierre ocurra. El JSON queda como respaldo manual.

## Configuración desde el navegador (sin instalar nada en el Mac)

Cloudflare ejecuta `npm install` y `npx wrangler deploy` en sus propios servidores cuando el repositorio GitHub está conectado mediante Workers Builds. La carpeta `node_modules` se crea allí, no en este computador. Comprueba en Cloudflare que el proyecto apunta a `Franco-nicolai/Fino`, con directorio raíz `/`, comando de despliegue `npx wrangler deploy` y nombre de Worker `fino-privado`.

1. En Cloudflare, entra a **Workers & Pages → D1 SQL database → Create database** y crea `fino-data`. Copia el ID que aparece en su página y reemplaza `REEMPLAZAR_CON_ID_DE_D1` en `wrangler.jsonc`.
2. En esa base abre **Console**, pega el contenido de `schema.sql` y pulsa **Execute**. En **Tables** debe aparecer `spaces`.
3. Cuando el repositorio ya esté conectado a Workers Builds, sube estos archivos a GitHub. Cloudflare instalará las dependencias y desplegará el Worker. Mientras no se configuren las variables del paso siguiente, el Worker responde 403 incluso si la página ya tiene URL.
4. En **Workers & Pages → fino-privado → Access**, activa Access para producción y vistas previas y permite solo tu dirección de correo exacta. Copia el **Application Audience (AUD) Tag** y tu dominio de equipo de Access.
5. En **Workers & Pages → fino-privado → Settings → Variables and Secrets**, agrega `TEAM_DOMAIN` (`https://TU-EQUIPO.cloudflareaccess.com`), `POLICY_AUD` (el AUD) y `OWNER_EMAIL` (tu correo autorizado). Comprueba la URL en una ventana privada: debe solicitar acceso. Ingresa y verifica que cuentas y movimientos se guarden al recargar.

No pongas el correo o esos valores en el repositorio. Tampoco subas un respaldo financiero a GitHub.

## Alternativa con herramientas locales

1. Instala Node.js 20+ y ejecuta `npm install` en esta carpeta. Autentica Wrangler con `npx wrangler login`.
2. Crea la base: `npx wrangler d1 create fino-data`. Copia el `database_id` devuelto a `wrangler.jsonc`.
3. Inicializa la tabla: `npx wrangler d1 execute fino-data --remote --file=./schema.sql`.
4. Crea una aplicación Cloudflare Access de tipo **Worker** para este Worker; restringe la política **Include** a tu correo personal específico. Evita políticas Everyone, Bypass o un dominio de correo completo. Copia el Audience Tag y tu team domain.
5. Define en el Worker las variables `TEAM_DOMAIN` (`https://TU-EQUIPO.cloudflareaccess.com`), `POLICY_AUD` (Audience Tag) y `OWNER_EMAIL` (el mismo correo exacto de la política). Puedes configurarlas en Workers & Pages → Worker → Settings → Variables and Secrets después de la primera publicación. Hasta que estén configuradas, toda la aplicación devuelve 403. No son contraseñas; la comprobación firma el JWT de Access y exige tu correo.
6. Ejecuta `npx wrangler deploy`. Comprueba que la URL del Worker pide inicio de sesión y que `/api/spaces/personal` sin sesión devuelve 403. Si usas un dominio propio, aplica Access a ese hostname también. Revisa igualmente la URL `workers.dev` y cualquier vista previa: el Worker verifica el JWT en todas ellas.

## Llevar los datos existentes

Antes de migrar, en Fino local abre **Configuración → Descargar respaldo** desde **Mis finanzas**. Guarda una copia fuera de esta carpeta. Ingresa a la versión Cloudflare y usa **Configuración → Importar respaldo**. Comprueba cuentas, movimientos, presupuestos y estados contables antes de dejar de usar la copia local. La demo es un espacio aparte.

Si el equipo local guarda `~/Documents/Fino/fino-data.json`, ese archivo contiene un contenedor de espacios y revisiones; no es el mismo formato que el respaldo de la interfaz. Exporta desde la interfaz para importarlo fácilmente.

## Límites y siguientes mejoras

El modelo D1 guarda un documento JSON por espacio para mantener compatibilidad con los datos existentes y revisiones optimistas para evitar sobrescrituras simultáneas. Un error de red bloquea el guardado; nunca cae silenciosamente a IndexedDB en HTTPS. Descarga respaldos JSON periódicos. Para uso prolongado conviene agregar historial de versiones recuperables, pruebas de restauración, y luego normalizar movimientos/cuentas para consultas y gráficos más grandes. La siguiente etapa funcional sugerida es conciliación de movimientos, proyección de caja con vencimientos y alertas de tarjetas, y escenarios de endeudamiento vinculados a pasivos.

No subas tus respaldos JSON, `.dev.vars` ni archivos con datos financieros al repositorio. Esta entrega no incluye credenciales ni realiza el despliegue.

## Implementaciones añadidas

La interfaz incorpora conciliación por extracto (selección de partidas sin modificar el libro), proyección de efectivo a 60 días con compromisos manuales y vencimientos de deuda, y simulador de cuota con tasa, plazo, capital e intereses aproximados. Los respaldos antiguos son compatibles; los nuevos campos `reconciliations` y `cashPlans` son opcionales al importar.
