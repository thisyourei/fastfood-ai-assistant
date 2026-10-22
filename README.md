# Pedido Rápido · demo de IA para comida rápida

Asistente en español para un local ficticio. Responde preguntas sobre menú y políticas, toma pedidos simulados para retiro o delivery y permite consultar su estado. Comparte la lógica entre una web de prueba y la API oficial de WhatsApp.

## Probar ahora, sin cuentas ni costos

Requiere Node.js 20 o superior. No necesita instalar paquetes.

```powershell
node scripts/dev-server.mjs
```

Abre `http://localhost:8787`. Para ejecutar las pruebas:

```powershell
node --test
```

GitHub Actions ejecuta las mismas pruebas en cada cambio. Además del flujo de pedido, comprueban calidad básica de los datos y que menú, compra y seguimiento no consuman llamadas al LLM.

Flujo sugerido: `pedir` → `2` → `2` → `finalizar` → `delivery` → `Providencia` → `Calle Demo 123` → `confirmar` → `estado DEMO-1001`.

## Arquitectura

```text
WhatsApp Business Platform ──webhook──> Cloudflare Worker ──REST/RPC──> Supabase PostgreSQL
                                         │
Web de prueba ──────────────────────────┤
                                         └── Workers AI (solo preguntas abiertas con fuente)
```

- El menú, los precios, el stock y los estados se consultan en tablas, sin pedirle al LLM que los invente.
- Las preguntas abiertas recuperan fragmentos de `knowledge`; Workers AI redacta con esas fuentes cuando está disponible. Sin AI binding, se devuelve directamente la fuente más pertinente.
- El bot no cobra, no envía órdenes a cocina y no realiza entregas. Los datos de la demo son ficticios.
- El número de WhatsApp se identifica como `customer_ref`. Un pedido solo puede consultarse desde el mismo número; en la web, desde la misma sesión del navegador.

## Crear Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/) y ejecuta `supabase/schema.sql` en SQL Editor.
2. Copia `Project URL` y la **service role key**. La clave se configura únicamente como secreto del Worker; nunca se envía al navegador ni se sube a GitHub.
3. El SQL activa Row Level Security. El Worker usa la service role key y es el único acceso a estas tablas.

## Publicar en Cloudflare

1. Crea una cuenta en [Cloudflare](https://dash.cloudflare.com/) e instala Wrangler en tu entorno (`pnpm dlx wrangler`, o la instalación oficial de Cloudflare).
2. Configura los secretos con `wrangler secret put SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `META_VERIFY_TOKEN`, `META_APP_SECRET`, `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
3. Ejecuta `wrangler deploy` desde este directorio. La configuración de `wrangler.jsonc` activa Workers AI y publica los archivos de `public/`.
4. Deja `DEMO_ENABLED=false` mientras el Worker sea accesible públicamente. Para presentar la web en un entorno controlado, cámbialo temporalmente a `true`. La web local siempre está habilitada.

## Conectar WhatsApp de prueba

1. En [Meta for Developers](https://whatsappbusiness.com/developers/developer-hub/), crea una app con WhatsApp Business Platform y usa el número de prueba.
2. Registra `https://TU-WORKER.workers.dev/webhook` como callback y el mismo `META_VERIFY_TOKEN` configurado en Cloudflare. Suscribe el campo `messages`.
3. Configura `META_APP_SECRET` para verificar `x-hub-signature-256`; agrega el token y el ID del número de prueba como secretos. Ajusta `WHATSAPP_API_VERSION` a la versión de Graph API que tenga activa tu app.
4. Añade un teléfono autorizado como destinatario de pruebas y envía `menú` o `pedir` al número de prueba.

Meta limita el uso del número de prueba a destinatarios autorizados. Para un negocio real habrá que registrar su número, completar la configuración comercial, revisar políticas y comprobar tarifas actuales por país/categoría en [WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/).

## Costos y límites de la primera versión

- La demo local no consume servicios externos.
- El plan gratuito de Supabase puede pausar proyectos con poca actividad, por lo que no equivale a disponibilidad de producción.
- Cloudflare Workers y Workers AI tienen cuotas gratuitas que pueden cambiar. `DEMO_ENABLED=false` evita dejar un chat público consumiendo inferencia y escrituras.
- Las respuestas de WhatsApp que requieren LLM consumen Workers AI. Para un piloto, medir mensajes, tokens, errores y consumo antes de fijar un precio al cliente.
- El webhook confirma recepción y procesa en segundo plano. Antes de operar pedidos reales debe añadirse una cola persistente con reintentos, alertas y revisión humana para fallos de entrega.

## Siguientes iteraciones

1. Conectar un panel privado para que el local acepte pedidos y actualice estados.
2. Sustituir datos ficticios por una integración con el POS y el inventario del negocio.
3. Añadir controles de acceso, respaldo, observabilidad, cola de mensajes y reglas de consentimiento para una operación real.
