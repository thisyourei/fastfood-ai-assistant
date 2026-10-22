const seedProducts = [
  { id: 1, name: 'Hamburguesa clásica', price: 5900, ingredients: 'pan, carne, lechuga, tomate y salsa de la casa', allergens: 'gluten', stock: 25, active: true },
  { id: 2, name: 'Hamburguesa con queso', price: 6900, ingredients: 'pan, carne, queso, lechuga y salsa de la casa', allergens: 'gluten, leche', stock: 20, active: true },
  { id: 3, name: 'Papas fritas', price: 2500, ingredients: 'papas, aceite y sal', allergens: 'puede existir contaminación cruzada', stock: 40, active: true },
  { id: 4, name: 'Bebida 350 ml', price: 1800, ingredients: 'bebida en lata', allergens: 'consultar etiqueta del fabricante', stock: 30, active: true }
];

const seedKnowledge = [
  { id: 1, title: 'Horarios', content: 'Atendemos de lunes a sábado de 12:00 a 22:00. Domingo cerrado.' },
  { id: 2, title: 'Delivery', content: 'En esta demo entregamos en Santiago Centro, Providencia y Ñuñoa. El despacho simulado cuesta $2.500.' },
  { id: 3, title: 'Retiro', content: 'El retiro simulado se realiza en el local. La dirección ficticia es Av. Demo 123, Santiago.' },
  { id: 4, title: 'Alérgenos', content: 'La cocina manipula gluten y lácteos. No se garantiza ausencia de contaminación cruzada. Consultar con una persona ante alergias graves.' },
  { id: 5, title: 'Pagos', content: 'Esta es una demostración. No procesamos pagos reales ni enviamos pedidos a cocina.' }
];

export function createDemoStore() {
  const products = structuredClone(seedProducts);
  const sessions = new Map();
  const orders = new Map();
  const messages = new Set();
  let nextOrder = 1001;
  return {
    async listProducts() { return structuredClone(products.filter(p => p.active)); },
    async listKnowledge() { return structuredClone(seedKnowledge); },
    async getSession(senderId) { return structuredClone(sessions.get(senderId) ?? { step: 'idle', cart: [], fulfillment: null, zone: null, address: null }); },
    async saveSession(senderId, session) { sessions.set(senderId, structuredClone(session)); },
    async createOrder(senderId, cart, fulfillment, zone, address) {
      const lines = [];
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId && p.active);
        if (!product || product.stock < item.quantity) throw new Error('SIN_STOCK');
        lines.push({ productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price });
      }
      for (const item of cart) products.find(p => p.id === item.productId).stock -= item.quantity;
      const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
      const deliveryFee = fulfillment === 'delivery' ? 2500 : 0;
      const order = { code: `DEMO-${nextOrder++}`, customerRef: senderId, status: 'recibido', items: lines, subtotal, deliveryFee, total: subtotal + deliveryFee, fulfillment, zone, address, createdAt: new Date().toISOString() };
      orders.set(order.code, order);
      return structuredClone(order);
    },
    async getOrderByCode(code, senderId) {
      const order = orders.get(code.toUpperCase());
      return order?.customerRef === senderId ? structuredClone(order) : null;
    },
    async claimMessage(messageId) {
      if (messages.has(messageId)) return false;
      messages.add(messageId);
      return true;
    }
  };
}
