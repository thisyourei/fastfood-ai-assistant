function client(env) {
  const base = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  return async (path, options = {}) => {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers
      }
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
}

export function createSupabaseStore(env) {
  const request = client(env);
  const filter = value => encodeURIComponent(value);
  return {
    async listProducts() {
      return request('products?select=id,name,price,ingredients,allergens,stock,active&active=eq.true&order=id.asc');
    },
    async listKnowledge() {
      return request('knowledge?select=id,title,content&active=eq.true&order=id.asc');
    },
    async getSession(senderId) {
      const rows = await request(`sessions?select=state&sender_id=eq.${filter(senderId)}&limit=1`);
      return rows[0]?.state ?? { step: 'idle', cart: [], fulfillment: null, zone: null, address: null };
    },
    async saveSession(senderId, state) {
      await request('sessions?on_conflict=sender_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ sender_id: senderId, state, updated_at: new Date().toISOString() })
      });
    },
    async createOrder(senderId, cart, fulfillment, zone, address) {
      const rows = await request('rpc/place_demo_order', {
        method: 'POST',
        body: JSON.stringify({ p_customer_ref: senderId, p_cart: cart, p_fulfillment: fulfillment, p_zone: zone, p_address: address })
      });
      return rows;
    },
    async getOrderByCode(code, senderId) {
      const rows = await request(`orders?select=code,status,total,fulfillment&code=eq.${filter(code)}&customer_ref=eq.${filter(senderId)}&limit=1`);
      return rows[0] ?? null;
    },
    async claimMessage(messageId) {
      return request('rpc/claim_inbound_message', { method: 'POST', body: JSON.stringify({ p_message_id: messageId }) });
    }
  };
}
