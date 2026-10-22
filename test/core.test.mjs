import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../src/demo-store.mjs';
import { handleMessage } from '../src/core.mjs';

function chat(store, senderId = 'cliente-1') {
  return text => handleMessage({ senderId, text, store });
}

test('pedido con delivery: precio, zona y seguimiento privado', async () => {
  const store = createDemoStore();
  const send = chat(store);
  assert.match(await send('pedir'), /Hamburguesa clásica/);
  assert.match(await send('2'), /Hamburguesa con queso/);
  assert.match(await send('2'), /Agregué 2/);
  await send('finalizar');
  await send('delivery');
  await send('Providencia');
  const summary = await send('Calle Demo 123');
  assert.match(summary, /16\.300/);
  const confirmed = await send('confirmar');
  assert.match(confirmed, /DEMO-1001/);
  assert.match(await send('estado DEMO-1001'), /recibido/);
  assert.match(await chat(store, 'otro-cliente')('estado DEMO-1001'), /No encontré/);
});

test('retiro, cancelación y preguntas de ingredientes', async () => {
  const store = createDemoStore();
  const send = chat(store);
  assert.match(await send('¿La hamburguesa con queso contiene leche?'), /Alérgenos: gluten, leche/);
  await send('pedir');
  await send('1');
  await send('1');
  await send('finalizar');
  assert.match(await send('retiro'), /5\.900/);
  assert.match(await send('cancelar'), /cancelado/);
  assert.match(await send('confirmar'), /No tengo información suficiente/);
});

test('respuestas abiertas usan fuente y no inventan una fuente inexistente', async () => {
  const store = createDemoStore();
  const send = chat(store);
  assert.match(await send('¿Cuál es el horario?'), /Fuente: Horarios/);
  assert.match(await send('¿Tienen helicóptero?'), /No tengo información suficiente/);
});

test('stock se descuenta al confirmar y no antes', async () => {
  const store = createDemoStore();
  const send = chat(store);
  const before = (await store.listProducts())[0].stock;
  await send('pedir'); await send('1'); await send('3');
  assert.equal((await store.listProducts())[0].stock, before);
  await send('finalizar'); await send('retiro'); await send('confirmar');
  assert.equal((await store.listProducts())[0].stock, before - 3);
});

test('menú, pedido y estado no consumen llamadas al LLM', async () => {
  const store = createDemoStore();
  let calls = 0;
  const send = text => handleMessage({ senderId: 'cliente-1', text, store, ai: async () => { calls++; return 'respuesta'; } });
  await send('menú'); await send('pedir'); await send('1'); await send('1');
  await send('finalizar'); await send('retiro'); await send('confirmar');
  await send('estado DEMO-1001');
  assert.equal(calls, 0);
});

test('datos de ejemplo cumplen reglas mínimas de calidad', async () => {
  const store = createDemoStore();
  const products = await store.listProducts();
  const knowledge = await store.listKnowledge();
  assert.equal(new Set(products.map(p => p.id)).size, products.length);
  assert.equal(new Set(knowledge.map(k => k.title)).size, knowledge.length);
  assert.ok(products.every(p => p.name && p.price > 0 && p.stock >= 0 && p.ingredients && p.allergens));
  assert.ok(knowledge.every(k => k.title && k.content));
});
