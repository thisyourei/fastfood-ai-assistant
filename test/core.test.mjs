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
