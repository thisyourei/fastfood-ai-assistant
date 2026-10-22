import { createDemoStore } from './demo-store.mjs';
import { createSupabaseStore } from './supabase-store.mjs';
import { handleMessage } from './core.mjs';

const localStore = createDemoStore();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function storeFor(env) {
  return env.DEMO_MODE === 'true' ? (env.DEMO_STORE ?? localStore) : createSupabaseStore(env);
}

function aiFor(env) {
  if (!env.AI) return null;
  return async (question, sources) => {
    const context = sources.map(s => `[${s.title}] ${s.content}`).join('\n');
    const result = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        { role: 'system', content: `Responde en español chileno y solo con los datos de las fuentes. Si no contienen la respuesta, di que no sabes. No inventes precios, stock, estados de pedido ni promesas de entrega. Máximo 120 palabras.\n${context}` },
        { role: 'user', content: question }
      ],
      max_completion_tokens: 180,
      temperature: 0.2
    });
    return result.response ?? result.choices?.[0]?.message?.content ?? '';
  };
}

async function verifySignature(raw, signature, secret) {
  if (!signature?.startsWith('sha256=') || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, raw));
  const expected = `sha256=${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function sendWhatsApp(env, to, body) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('Faltan credenciales de WhatsApp');
  const version = env.WHATSAPP_API_VERSION || 'v25.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } })
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${await response.text()}`);
}

async function processWebhook(payload, env) {
  const store = storeFor(env);
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    for (const message of change.value?.messages ?? []) {
      const senderId = message.from;
      const body = message.text?.body ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title;
      if (!senderId || !message.id || !body) continue;
      if (!await store.claimMessage(message.id)) continue;
      const reply = await handleMessage({ senderId, text: body, store, ai: aiFor(env) });
      await sendWhatsApp(env, senderId, reply);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, mode: env.DEMO_MODE === 'true' ? 'local-demo' : 'supabase' });
    if (url.pathname === '/api/menu' && request.method === 'GET') {
      if (env.DEMO_ENABLED !== 'true') return json({ error: 'Demo web desactivada' }, 403);
      return json({ products: await storeFor(env).listProducts() });
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      if (env.DEMO_ENABLED !== 'true') return json({ error: 'Demo web desactivada' }, 403);
      let data;
      try { data = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
      if (typeof data.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.sessionId) || typeof data.message !== 'string' || data.message.length > 500) return json({ error: 'Mensaje o sesión inválidos' }, 400);
      try {
        const reply = await handleMessage({ senderId: `web:${data.sessionId}`, text: data.message, store: storeFor(env), ai: aiFor(env) });
        return json({ reply });
      } catch (error) {
        console.error('Chat error', error);
        return json({ error: 'No pude responder en este momento.' }, 500);
      }
    }
    if (url.pathname === '/webhook' && request.method === 'GET') {
      const valid = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env.META_VERIFY_TOKEN;
      return valid ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 });
    }
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const raw = await request.arrayBuffer();
      if (!await verifySignature(raw, request.headers.get('x-hub-signature-256'), env.META_APP_SECRET)) return new Response('Forbidden', { status: 403 });
      let payload;
      try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return new Response('Bad Request', { status: 400 }); }
      ctx.waitUntil(processWebhook(payload, env).catch(error => console.error('Webhook error', error)));
      return new Response('OK', { status: 200 });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  }
};
