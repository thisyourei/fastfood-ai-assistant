import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { createDemoStore } from '../src/demo-store.mjs';

const env = () => ({ DEMO_MODE: 'true', DEMO_ENABLED: 'true', DEMO_STORE: createDemoStore(), META_VERIFY_TOKEN: 'test-token', META_APP_SECRET: 'test-secret' });
const ctx = { waitUntil() {} };

test('API web responde y valida la sesión', async () => {
  const config = env();
  const request = new Request('https://example.test/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'demo123456', message: 'menú' }) });
  const response = await worker.fetch(request, config, ctx);
  assert.equal(response.status, 200);
  assert.match((await response.json()).reply, /Papas fritas/);
  const invalid = await worker.fetch(new Request('https://example.test/api/chat', { method: 'POST', body: JSON.stringify({ sessionId: '!', message: 'menú' }) }), config, ctx);
  assert.equal(invalid.status, 400);
});

test('la prueba web pública vence y no invoca el modelo', async () => {
  let aiCalls = 0;
  const config = {
    DEMO_ENABLED: 'true',
    PUBLIC_DEMO_UNTIL: new Date(Date.now() + 60_000).toISOString(),
    DEMO_MODE: 'true',
    DEMO_STORE: createDemoStore(),
    AI: { async run() { aiCalls++; return { response: 'respuesta generada' }; } }
  };
  const question = () => new Request('https://example.test/api/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId: 'demo123456', message: '¿Hacen delivery?' })
  });
  assert.equal((await worker.fetch(question(), config, ctx)).status, 200);
  assert.equal(aiCalls, 0);

  config.DEMO_MODE = 'false';
  config.PUBLIC_DEMO_UNTIL = new Date(Date.now() - 60_000).toISOString();
  const expired = await worker.fetch(question(), config, ctx);
  assert.equal(expired.status, 403);
  assert.equal((await expired.json()).error, 'La prueba pública terminó.');
});

test('webhook exige token de verificación y firma', async () => {
  const config = env();
  const good = await worker.fetch(new Request('https://example.test/webhook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=123'), config, ctx);
  assert.equal(good.status, 200);
  assert.equal(await good.text(), '123');
  const bad = await worker.fetch(new Request('https://example.test/webhook', { method: 'POST', body: '{}' }), config, ctx);
  assert.equal(bad.status, 403);
});
