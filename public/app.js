const sessionId = localStorage.getItem('fastfood-demo-session') || crypto.randomUUID().replaceAll('-', '');
localStorage.setItem('fastfood-demo-session', sessionId);
const messages = document.querySelector('#messages');
const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const submit = form.querySelector('button');

function bubble(text, kind) {
  const element = document.createElement('div');
  element.className = `bubble ${kind}`;
  element.textContent = text;
  messages.append(element);
  messages.scrollTop = messages.scrollHeight;
}

async function send(message) {
  const text = message.trim();
  if (!text || submit.disabled) return;
  bubble(text, 'user');
  input.value = '';
  submit.disabled = true;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, message: text }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error de conexión');
    bubble(data.reply, 'bot');
  } catch (error) {
    bubble(error.message, 'bot error');
  } finally {
    submit.disabled = false;
    input.focus();
  }
}

bubble('¡Hola! Soy el asistente de demostración. Escribe menú para ver productos, pedir para armar un pedido o pregunta por horarios y delivery.', 'bot');
form.addEventListener('submit', event => { event.preventDefault(); send(input.value); });
document.querySelectorAll('[data-message]').forEach(button => button.addEventListener('click', () => send(button.dataset.message)));
