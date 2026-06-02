(() => {
  'use strict';
  const TOKEN_KEY = 'printpixel_producao_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let assignments = [];
  let currentOrderId = '';
  let deferredInstall = null;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => Number(value || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  const auth = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...auth(), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Não foi possível concluir a operação.');
    return body;
  }
  function showNotice(message) { $('notice').textContent = message; $('notice').hidden = false; }
  function showLogin(message = '') {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    $('appShell').hidden = true;
    $('logoutBtn').hidden = true;
    $('loginShell').hidden = false;
    $('loginNotice').hidden = !message;
    $('loginNotice').textContent = message;
  }
  function showApp() {
    $('loginShell').hidden = true;
    $('appShell').hidden = false;
    $('logoutBtn').hidden = false;
  }
  function isDone(assignment) { return assignment.steps.length > 0 && assignment.steps.every(step => step.done); }
  function render() {
    $('totalCount').textContent = assignments.length;
    $('doneCount').textContent = assignments.filter(isDone).length;
    $('openCount').textContent = assignments.filter(item => !isDone(item)).length;
    $('orderList').replaceChildren();
    if (!assignments.length) return showNotice('Nenhum trabalho foi direcionado para você até o momento.');
    $('notice').hidden = true;
    assignments.forEach(assignment => {
      const order = assignment.order;
      const card = document.createElement('article');
      card.className = `order ${isDone(assignment) ? 'done' : ''}`;
      card.innerHTML = `<div class="row"><div><h2>${escapeHtml(order.numero)}</h2><p>${escapeHtml(assignment.product?.nome || 'Serviço geral da O.S.')} · ${escapeHtml(order.cliente)}</p></div><span class="tag">${isDone(assignment) ? 'Concluído' : 'Em andamento'}</span></div><div class="meta"><span>Entrega: ${escapeHtml(order.dataEntrega || 'Não definida')}</span><span>Comissão: ${money(assignment.commission)}</span><span>${assignment.steps.filter(step => step.done).length}/${assignment.steps.length} etapas</span><span>${escapeHtml(order.empresa || '')}</span></div><button type="button">Abrir trabalho</button>`;
      card.querySelector('button').addEventListener('click', () => openOrder(assignment.id));
      $('orderList').append(card);
    });
  }
  async function load() {
    if (!token) return showLogin();
    try {
      localStorage.setItem(TOKEN_KEY, token);
      const result = await api('/api/colaborador/session');
      showApp();
      $('workerName').textContent = result.worker.name;
      assignments = result.assignments;
      render();
      if (currentOrderId) openOrder(currentOrderId);
    } catch (error) {
      showLogin(error.message);
    }
  }
  async function loadChat(orderId) {
    const result = await api(`/api/colaborador/ordens/${encodeURIComponent(orderId)}/chat`);
    const node = $('messages');
    node.replaceChildren();
    result.messages.forEach(message => {
      const row = document.createElement('div');
      row.className = 'message';
      row.innerHTML = `<b>${escapeHtml(message.author)}</b><span>${escapeHtml(message.message)}</span><small>${new Date(message.createdAt).toLocaleString('pt-PT')}</small>`;
      node.append(row);
    });
    node.scrollTop = node.scrollHeight;
  }
  async function openOrder(assignmentId) {
    currentOrderId = assignmentId;
    const assignment = assignments.find(item => item.id === assignmentId);
    if (!assignment) return;
    const orderId = assignment.orderId;
    const order = assignment.order;
    const products = assignment.product ? [assignment.product] : order.produtos;
    $('orderDetail').innerHTML = `<h2>${escapeHtml(order.numero)} · ${escapeHtml(order.cliente)}</h2><p>${escapeHtml(order.empresa)}</p><div class="box"><b>Informações do trabalho</b><p>Entrega: ${escapeHtml(order.dataEntrega || 'Não definida')}</p><p>Morada: ${escapeHtml(order.morada || 'Não informada')}</p><p>Contacto: ${escapeHtml(order.telemovel || 'Não informado')}</p><p>Comissão: <strong>${money(assignment.commission)}</strong></p><p>${escapeHtml(order.observacoes || '')}</p></div><div class="box"><b>Artigo direcionado</b>${products.map(product => `<div class="product"><strong>${escapeHtml(product.nome)}</strong><p>${escapeHtml(product.tamanho || '')} · Qtd. ${escapeHtml(product.quantidade)}</p><p>${escapeHtml(product.observacoes || '')}</p></div>`).join('')}</div><div class="box"><b>Etapas</b>${assignment.steps.map(step => `<label class="step"><input type="checkbox" data-step="${escapeHtml(step.id)}" ${step.done ? 'checked' : ''}><span>${escapeHtml(step.label)}</span></label>`).join('')}</div><div class="box"><b>Chat privado</b><div class="messages" id="messages"></div><form class="chat" id="chatForm"><input id="chatInput" maxlength="1000" required placeholder="Escreva uma mensagem"><button class="send">Enviar</button></form></div>`;
    $('orderDetail').querySelectorAll('[data-step]').forEach(input => input.addEventListener('change', async event => {
      await api(`/api/colaborador/ordens/${encodeURIComponent(orderId)}/etapas`, { method: 'POST', body: JSON.stringify({ productId: assignment.productId, stepId: event.target.dataset.step, done: event.target.checked }) });
      await load();
    }));
    $('chatForm').addEventListener('submit', async event => {
      event.preventDefault();
      const input = $('chatInput');
      await api(`/api/colaborador/ordens/${encodeURIComponent(orderId)}/chat`, { method: 'POST', body: JSON.stringify({ message: input.value }) });
      input.value = '';
      await loadChat(orderId);
    });
    await loadChat(orderId);
    if (!$('orderDialog').open) $('orderDialog').showModal();
  }
  $('closeDialog').addEventListener('click', () => { currentOrderId = ''; $('orderDialog').close(); });
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/colaborador/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('username').value, password: $('password').value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Não foi possível entrar.');
      token = result.token;
      $('password').value = '';
      await load();
    } catch (error) {
      $('loginNotice').hidden = false;
      $('loginNotice').textContent = error.message;
    }
  });
  $('logoutBtn').addEventListener('click', () => showLogin());
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('installBtn').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  load();
})();
