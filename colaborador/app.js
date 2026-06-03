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
    if (!response.ok) throw new Error(body.message || 'Nao foi possivel concluir a operacao.');
    return body;
  }

  function showNotice(message) {
    $('notice').textContent = message;
    $('notice').hidden = false;
  }

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

  function isDone(assignment) {
    return assignment.steps.length > 0 && assignment.steps.every(step => step.done);
  }

  function isPaid(assignment) {
    return assignment.paymentStatus === 'paid';
  }

  function groupAssignments() {
    return {
      open: assignments.filter(item => !isDone(item)),
      receivable: assignments.filter(item => isDone(item) && !isPaid(item)),
      paid: assignments.filter(item => isDone(item) && isPaid(item))
    };
  }

  function sumCommission(list) {
    return list.reduce((sum, item) => sum + (Number(item.commission) || 0), 0);
  }

  function renderCard(assignment, status) {
    const order = assignment.order;
    const card = document.createElement('article');
    card.className = `order ${status}`;
    const label = status === 'paid' ? 'Pago' : status === 'done' ? 'A receber' : 'Em andamento';
    const tagClass = status === 'paid' ? 'paid' : status === 'done' ? 'waiting' : '';
    card.innerHTML = `
      <div class="row">
        <div>
          <h2>${escapeHtml(order.numero)}</h2>
          <p>${escapeHtml(assignment.product?.nome || 'Servico geral da O.S.')} - ${escapeHtml(order.cliente)}</p>
        </div>
        <span class="tag ${tagClass}">${label}</span>
      </div>
      <div class="meta">
        <span>Entrega: ${escapeHtml(order.dataEntrega || 'Nao definida')}</span>
        <span>Comissao: ${money(assignment.commission)}</span>
        <span>${assignment.steps.filter(step => step.done).length}/${assignment.steps.length} etapas</span>
        <span>${status === 'paid' ? `Pago em ${new Date(assignment.paidAt).toLocaleDateString('pt-PT')}` : escapeHtml(order.empresa || '')}</span>
      </div>
      <button type="button">${status === 'paid' ? 'Abrir historico' : 'Abrir trabalho'}</button>`;
    card.querySelector('button').addEventListener('click', () => openOrder(assignment.id));
    return card;
  }

  function renderList(id, list, status, emptyMessage) {
    const node = $(id);
    node.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = emptyMessage;
      node.append(empty);
      return;
    }
    list.forEach(assignment => node.append(renderCard(assignment, status)));
  }

  function render() {
    const grouped = groupAssignments();
    $('totalCount').textContent = assignments.length;
    $('openCount').textContent = grouped.open.length;
    $('doneCount').textContent = grouped.receivable.length;
    $('paidCount').textContent = grouped.paid.length;
    $('assignedValue').textContent = money(sumCommission([...grouped.open, ...grouped.receivable]));
    $('receivableValue').textContent = money(sumCommission(grouped.receivable));
    if (!assignments.length) showNotice('Nenhum trabalho foi direcionado para voce ate o momento.');
    else $('notice').hidden = true;
    renderList('openList', grouped.open, 'open', 'Nenhum trabalho em andamento.');
    renderList('receivableList', grouped.receivable, 'done', 'Nenhum trabalho concluido aguardando pagamento.');
    renderList('paidList', grouped.paid, 'paid', 'Nenhum trabalho pago no historico.');
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
    const paid = isPaid(assignment);
    const orderId = assignment.orderId;
    const order = assignment.order;
    const products = assignment.product ? [assignment.product] : order.produtos;
    $('orderDetail').innerHTML = `
      <h2>${escapeHtml(order.numero)} - ${escapeHtml(order.cliente)}</h2>
      <p>${escapeHtml(order.empresa)}</p>
      <div class="box">
        <b>Informacoes do trabalho</b>
        <p>Entrega: ${escapeHtml(order.dataEntrega || 'Nao definida')}</p>
        <p>Morada: ${escapeHtml(order.morada || 'Nao informada')}</p>
        <p>Contacto: ${escapeHtml(order.telemovel || 'Nao informado')}</p>
        <p>Comissao: <strong>${money(assignment.commission)}</strong></p>
        <p>Status do pagamento: <strong>${paid ? `Pago em ${new Date(assignment.paidAt).toLocaleString('pt-PT')}` : isDone(assignment) ? 'Concluido e aguardando pagamento' : 'Em andamento'}</strong></p>
        <p>${escapeHtml(order.observacoes || '')}</p>
      </div>
      <div class="box">
        <b>Artigo direcionado</b>
        ${products.map(product => `<div class="product"><strong>${escapeHtml(product.nome)}</strong><p>${escapeHtml(product.tamanho || '')} - Qtd. ${escapeHtml(product.quantidade)}</p><p>${escapeHtml(product.observacoes || '')}</p></div>`).join('')}
      </div>
      <div class="box">
        <b>Etapas</b>
        ${assignment.steps.map(step => `<label class="step"><input type="checkbox" data-step="${escapeHtml(step.id)}" ${step.done ? 'checked' : ''} ${paid ? 'disabled' : ''}><span>${escapeHtml(step.label)}</span></label>`).join('')}
      </div>
      <div class="box">
        <b>Chat privado</b>
        <div class="messages" id="messages"></div>
        ${paid ? '<p>Servico pago e arquivado. Use o CRM para novas tratativas.</p>' : '<form class="chat" id="chatForm"><input id="chatInput" maxlength="1000" required placeholder="Escreva uma mensagem"><button class="send">Enviar</button></form>'}
      </div>`;
    $('orderDetail').querySelectorAll('[data-step]').forEach(input => input.addEventListener('change', async event => {
      const stepId = event.target.dataset.step;
      const willCompleteAll = event.target.checked && assignment.steps.every(step => step.id === stepId ? true : step.done);
      if (willCompleteAll && !confirm('Todos os processos deste trabalho foram executados e conferidos?')) {
        event.target.checked = false;
        return;
      }
      await api(`/api/colaborador/ordens/${encodeURIComponent(orderId)}/etapas`, { method: 'POST', body: JSON.stringify({ productId: assignment.productId, stepId: event.target.dataset.step, done: event.target.checked }) });
      await load();
    }));
    if (!paid) {
      $('chatForm').addEventListener('submit', async event => {
        event.preventDefault();
        const input = $('chatInput');
        await api(`/api/colaborador/ordens/${encodeURIComponent(orderId)}/chat`, { method: 'POST', body: JSON.stringify({ message: input.value }) });
        input.value = '';
        await loadChat(orderId);
      });
    }
    await loadChat(orderId);
    if (!$('orderDialog').open) $('orderDialog').showModal();
  }

  $('closeDialog').addEventListener('click', () => {
    currentOrderId = '';
    $('orderDialog').close();
  });

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/colaborador/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('username').value, password: $('password').value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Nao foi possivel entrar.');
      token = result.token;
      $('password').value = '';
      await load();
    } catch (error) {
      $('loginNotice').hidden = false;
      $('loginNotice').textContent = error.message;
    }
  });

  $('logoutBtn').addEventListener('click', () => showLogin());
  $('historyToggle').addEventListener('click', () => {
    $('paidSection').hidden = !$('paidSection').hidden;
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('installBtn').hidden = true;
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  load();
})();
