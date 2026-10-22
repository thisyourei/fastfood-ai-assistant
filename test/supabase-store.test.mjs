import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from '../src/supabase-store.mjs';

test('Supabase recibe la clave secreta solo en apikey', async () => {
  const originalFetch = globalThis.fetch;
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response('[]', { status: 200 });
  };
  try {
    const store = createSupabaseStore({ SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' });
    await store.listProducts();
    assert.equal(headers.apikey, 'sb_secret_test');
    assert.equal(headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
