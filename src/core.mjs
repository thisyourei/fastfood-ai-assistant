const money = amount => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
const clean = value => String(value ?? '').trim();
const normalized = value => clean(value).toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const reset = () => ({ step: 'idle', cart: [], fulfillment: null, zone: null, address: null });
const zones = ['Santiago Centro', 'Providencia', 'Ñuñoa'];

function menuText(products) {
  return `🍔 Menú de demostración:\n${products.filter(p => p.stock > 0).map((p, index) => `${index + 1}. ${p.name} — ${money(p.price)}`).join('\n')}\n\nEscribe *pedir* para comenzar.`;
}

function summary(session, products) {
  const lines = session.cart.map(item => {
    const p = products.find(p => p.id === item.productId);
    return `${item.quantity} × ${p.name}: ${money(item.quantity * p.price)}`;
  });
  const subtotal = session.cart.reduce((sum, item) => sum + products.find(p => p.id === item.productId).price * item.quantity, 0);
  const fee = session.fulfillment === 'delivery' ? 2500 : 0;
  return `🧾 Resumen de pedido simulado:\n${lines.join('\n')}\n${session.fulfillment === 'delivery' ? `Delivery a ${session.zone}, ${session.address}: ${money(fee)}` : 'Retiro en Av. Demo 123, Santiago'}\n*Total: ${money(subtotal + fee)}*\n\nEscribe *confirmar* o *cancelar*. No se realizará ningún cobro.`;
}

function retrieve(question, knowledge) {
  const stop = new Set(['como', 'cual', 'para', 'donde', 'cuando', 'tienen', 'puedo', 'quiero', 'sobre', 'esta', 'este', 'cuanto', 'hacen', 'hacer', 'tiene', 'hay']);
  const terms = normalized(question).match(/[a-zñ]{4,}/g)?.filter(term => !stop.has(term)) ?? [];
  return knowledge.map(doc => {
    const haystack = normalized(`${doc.title} ${doc.content}`);
    const score = terms.filter(term => haystack.includes(term)).length;
    return { ...doc, score };
  }).filter(doc => doc.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
}

async function answerKnowledge(question, knowledge, ai) {
  const sources = retrieve(question, knowledge);
  if (!sources.length) return 'No tengo información suficiente para responder con seguridad. Escribe *menú*, *pedir* o *estado DEMO-1001*, o consulta con una persona del local.';
  if (!ai) return `${sources[0].content}\n\nFuente: ${sources[0].title}.`;
  try {
    const response = await ai(question, sources);
    if (!clean(response)) throw new Error('EMPTY_AI_RESPONSE');
    return `${clean(response).slice(0, 700)}\n\nFuentes: ${sources.map(s => s.title).join(', ')}.`;
  } catch {
    return `${sources[0].content}\n\nFuente: ${sources[0].title}.`;
  }
}

export async function handleMessage({ senderId, text, store, ai = null }) {
  const input = clean(text).slice(0, 500);
  const cmd = normalized(input);
  if (!input) return 'Escribe un mensaje para continuar.';
  let session = await store.getSession(senderId);
  const products = await store.listProducts();
  if (cmd === 'cancelar') {
    await store.saveSession(senderId, reset());
    return 'Pedido cancelado. Escribe *menú* para volver a empezar.';
  }
  if (cmd === 'ayuda' || cmd === 'inicio') return 'Puedo mostrarte el *menú*, tomar un *pedido* simulado, consultar *estado DEMO-1001* o responder preguntas sobre horarios, ingredientes y políticas.';
  if (cmd === 'menu') return menuText(products);
  if (/^(estado|seguimiento)\s+(demo-\d+)$/i.test(input)) {
    const code = input.match(/demo-\d+/i)[0].toUpperCase();
    const order = await store.getOrderByCode(code, senderId);
    return order ? `Pedido ${order.code}: *${order.status}*. Total ${money(order.total)}. ${order.fulfillment === 'delivery' ? 'Entrega simulada.' : 'Retiro simulado.'}` : 'No encontré ese pedido para este número o sesión.';
  }
  if (cmd === 'pedir' || cmd === 'hacer pedido' || cmd === 'quiero pedir') {
    session = { ...reset(), step: 'item' };
    await store.saveSession(senderId, session);
    return `${menuText(products)}\n\nIndica el número del producto que quieres agregar.`;
  }

  if (session.step === 'item') {
    const index = Number.parseInt(input, 10) - 1;
    const available = products.filter(p => p.stock > 0);
    const product = Number.isInteger(index) ? available[index] : available.find(p => normalized(p.name) === cmd);
    if (!product) return `No reconocí ese producto.\n\n${menuText(products)}\n\nIndica un número del menú.`;
    session = { ...session, step: 'quantity', selectedProductId: product.id };
    await store.saveSession(senderId, session);
    return `¿Cuántas unidades de ${product.name} quieres? Disponibles: ${product.stock}. Escribe un número del 1 al 10.`;
  }
  if (session.step === 'quantity') {
    const product = products.find(p => p.id === session.selectedProductId);
    const quantity = Number(input);
    const existing = session.cart.find(item => item.productId === product?.id)?.quantity ?? 0;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !product || quantity + existing > product.stock) return 'Cantidad no válida o sin stock suficiente. Escribe un número entre 1 y 10.';
    const cart = session.cart.filter(item => item.productId !== product.id);
    cart.push({ productId: product.id, quantity: existing + quantity });
    session = { ...session, cart, step: 'more', selectedProductId: null };
    await store.saveSession(senderId, session);
    return `Agregué ${quantity} × ${product.name}. Escribe *agregar* para otro producto o *finalizar* para elegir entrega.`;
  }
  if (session.step === 'more') {
    if (cmd === 'agregar') {
      session.step = 'item';
      await store.saveSession(senderId, session);
      return `${menuText(products)}\n\nIndica el número del producto.`;
    }
    if (cmd === 'finalizar') {
      session.step = 'fulfillment';
      await store.saveSession(senderId, session);
      return '¿Quieres *retiro* en local o *delivery*?';
    }
    return 'Escribe *agregar* o *finalizar*.';
  }
  if (session.step === 'fulfillment') {
    if (cmd === 'retiro') {
      session = { ...session, fulfillment: 'pickup', step: 'confirm' };
      await store.saveSession(senderId, session);
      return summary(session, products);
    }
    if (cmd === 'delivery') {
      session = { ...session, fulfillment: 'delivery', step: 'zone' };
      await store.saveSession(senderId, session);
      return `¿En qué comuna? Por ahora: ${zones.join(', ')}.`;
    }
    return 'Escribe *retiro* o *delivery*.';
  }
  if (session.step === 'zone') {
    const zone = zones.find(z => normalized(z) === cmd);
    if (!zone) return `La demo solo cubre ${zones.join(', ')}. Indica una de esas comunas o escribe *cancelar*.`;
    session = { ...session, zone, step: 'address' };
    await store.saveSession(senderId, session);
    return `Indica una dirección de demostración en ${zone}. No ingreses una dirección real.`;
  }
  if (session.step === 'address') {
    if (input.length < 8 || input.length > 120) return 'Escribe una dirección de demostración de 8 a 120 caracteres.';
    session = { ...session, address: input, step: 'confirm' };
    await store.saveSession(senderId, session);
    return summary(session, products);
  }
  if (session.step === 'confirm') {
    if (cmd !== 'confirmar') return 'Escribe *confirmar* para registrar el pedido simulado o *cancelar*.';
    try {
      const order = await store.createOrder(senderId, session.cart, session.fulfillment, session.zone, session.address);
      await store.saveSession(senderId, reset());
      return `✅ Pedido simulado ${order.code} registrado por ${money(order.total)}. Estado: *recibido*. Consulta con *estado ${order.code}*. No hay cobro ni preparación real.`;
    } catch {
      await store.saveSession(senderId, reset());
      return 'El stock cambió antes de confirmar. Vuelve a escribir *pedir* para revisar el menú actualizado.';
    }
  }

  const ingredientProduct = products.find(p => normalized(input).includes(normalized(p.name)));
  if (ingredientProduct && /(ingrediente|contiene|alerg|queso|leche|gluten)/.test(cmd)) return `${ingredientProduct.name}: ${ingredientProduct.ingredients}. Alérgenos: ${ingredientProduct.allergens}. Ante alergias graves, confirma con una persona del local.`;
  return answerKnowledge(input, await store.listKnowledge(), ai);
}
