(() => {
  'use strict';

  const TOKEN_KEY = 'printpixel_producao_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let assignments = [];
  let currentWorker = null;
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
    if (assignment.extraPayment) return true;
    return assignment.steps.length > 0 && assignment.steps.every(step => step.done);
  }

  function orderStatus(assignment) {
    return String(assignment.order?.status || 'pendente').toLowerCase();
  }

  function isOrderClosed(assignment) {
    return ['concluido', 'entregue'].includes(orderStatus(assignment));
  }

  function isOrderCancelled(assignment) {
    return orderStatus(assignment) === 'cancelado';
  }

  function isPaid(assignment) {
    return assignment.paymentStatus === 'paid';
  }

  function groupAssignments() {
    const unpaid = assignments.filter(item => !isPaid(item));
    return {
      open: unpaid.filter(item => !item.extraPayment && !isOrderCancelled(item) && !isOrderClosed(item) && !isDone(item)).sort(compareOperationalPriority),
      ready: unpaid.filter(item => !item.extraPayment && isOrderClosed(item) && !isDone(item)).sort((first, second) => operationalInfo(first).weight - operationalInfo(second).weight),
      receivable: unpaid.filter(item => item.extraPayment || (!isOrderCancelled(item) && isDone(item))),
      paid: assignments.filter(item => isDone(item) && isPaid(item))
    };
  }

  function parseOperationalDate(value, endOfDay = false) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function sameDay(first, second) {
    return first && second && first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
  }

  function operationalInfo(assignment) {
    const status = orderStatus(assignment);
    if (status === 'concluido') return { weight: 6, kind: 'ready', label: 'Pronto para entregar' };
    if (status === 'entregue') return { weight: 7, kind: 'ready', label: 'Entregue' };
    if (status === 'cancelado') return { weight: 8, kind: 'ready', label: 'Cancelado' };
    const now = new Date();
    const due = parseOperationalDate(assignment.order?.dataEntrega, true);
    if (due && due < now) {
      const days = Math.max(1, Math.ceil((now - due) / 86400000));
      return { weight: 0, kind: 'urgent', label: `Atrasado ${days} dia${days === 1 ? '' : 's'}`, due };
    }
    if (due && sameDay(due, now)) return { weight: 1, kind: 'urgent', label: 'Entrega hoje', due };
    return { weight: status === 'processamento' ? 2 : 3, kind: 'open', label: status === 'processamento' ? 'Em produção' : 'Por produzir', due };
  }

  function compareOperationalPriority(first, second) {
    const a = operationalInfo(first);
    const b = operationalInfo(second);
    if (a.weight !== b.weight) return a.weight - b.weight;
    const dueDifference = (a.due?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.due?.getTime() ?? Number.MAX_SAFE_INTEGER);
    if (dueDifference) return dueDifference;
    return (parseOperationalDate(first.order?.dataEntrada)?.getTime() || 0) - (parseOperationalDate(second.order?.dataEntrada)?.getTime() || 0);
  }

  function sumCommission(list) {
    return list.reduce((sum, item) => sum + (Number(item.commission) || 0), 0);
  }

  function assignedStepValue(assignment) {
    if (assignment.extraPayment) return Number(assignment.commission) || 0;
    const workerId = currentWorker?.id || '';
    return (assignment.steps || [])
      .filter(step => step.done && (!step.completedByWorkerId || step.completedByWorkerId === workerId))
      .reduce((sum, step) => sum + (Number(step.commissionValue) || 0), 0);
  }

  function renderCard(assignment, status) {
    const order = assignment.order;
    const card = document.createElement('article');
    const operation = operationalInfo(assignment);
    card.className = `order ${status} ${operation.kind === 'urgent' ? 'urgent' : ''}`;
    const label = status === 'paid' ? 'Pago' : status === 'done' ? 'A receber' : status === 'ready' ? operation.label : operation.label;
    const tagClass = status === 'paid' ? 'paid' : status === 'done' ? 'waiting' : status === 'ready' ? 'ready' : operation.kind === 'urgent' ? 'urgent' : '';
    if (assignment.extraPayment) {
      card.innerHTML = `
      <div class="row">
        <div>
          <h2>Pagamento extra</h2>
          <p>${escapeHtml(assignment.description || 'Credito adicional')}</p>
        </div>
        <span class="tag ${tagClass}">${label}</span>
      </div>
      <div class="meta">
        <span>Valor: ${money(assignment.commission)}</span>
        <span>${status === 'paid' ? `Pago em ${new Date(assignment.paidAt).toLocaleDateString('pt-PT')}` : 'Aguardando pagamento'}</span>
      </div>
      <button type="button">${status === 'paid' ? 'Abrir historico' : 'Ver detalhe'}</button>`;
      card.querySelector('button').addEventListener('click', () => openOrder(assignment.id));
      return card;
    }
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
        <span>Estado no CRM: ${escapeHtml(operation.label)}</span>
        <span>Comissao total: ${money(assignment.commission)}</span>
        <span>Ja atribuido: ${money(assignedStepValue(assignment))}</span>
        <span>${assignment.steps.filter(step => step.done).length}/${assignment.steps.length} etapas</span>
        <span>${status === 'paid' ? `Pago em ${new Date(assignment.paidAt).toLocaleDateString('pt-PT')}` : escapeHtml(order.empresa || '')}</span>
      </div>
      <button type="button">${status === 'paid' ? 'Abrir historico' : status === 'ready' ? 'Ver trabalho encerrado' : 'Abrir trabalho'}</button>`;
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
    const activeAssignments = [...grouped.open, ...grouped.ready, ...grouped.receivable];
    $('totalCount').textContent = activeAssignments.length;
    $('openCount').textContent = grouped.open.length;
    $('readyCount').textContent = grouped.ready.length;
    $('doneCount').textContent = grouped.receivable.length;
    $('paidCount').textContent = grouped.paid.length;
    $('assignedValue').textContent = money(sumCommission(activeAssignments));
    $('receivableValue').textContent = money(sumCommission(grouped.receivable));
    if (!activeAssignments.length) showNotice('Nenhum trabalho ativo foi direcionado para voce neste momento.');
    else $('notice').hidden = true;
    renderList('openList', grouped.open, 'open', 'Nenhum trabalho aguardando produção.');
    $('readySection').hidden = grouped.ready.length === 0;
    renderList('readyList', grouped.ready, 'ready', 'Nenhum trabalho encerrado no CRM.');
    renderList('receivableList', grouped.receivable, 'done', 'Nenhum trabalho concluido aguardando pagamento.');
    renderList('paidList', grouped.paid, 'paid', 'Nenhum trabalho pago no historico.');
  }

  async function load() {
    if (!token) return showLogin();
    try {
      localStorage.setItem(TOKEN_KEY, token);
      const result = await api('/api/colaborador/session');
      showApp();
      currentWorker = result.worker;
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
    if (assignment.extraPayment) {
      $('orderDetail').innerHTML = `
      <h2>Pagamento extra</h2>
      <p>${escapeHtml(currentWorker?.name || '')}</p>
      <div class="box">
        <b>Detalhe do pagamento</b>
        <p>Valor: <strong>${money(assignment.commission)}</strong></p>
        <p>Descricao: ${escapeHtml(assignment.description || 'Credito adicional')}</p>
        <p>Status do pagamento: <strong>${paid ? `Pago em ${new Date(assignment.paidAt).toLocaleString('pt-PT')}` : 'Aguardando pagamento'}</strong></p>
      </div>`;
      if (!$('orderDialog').open) $('orderDialog').showModal();
      return;
    }
    const orderId = assignment.orderId;
    const order = assignment.order;
    const products = assignment.product ? [assignment.product] : order.produtos;
    const operation = operationalInfo(assignment);
    const workLocked = paid || isOrderClosed(assignment) || isOrderCancelled(assignment);
    $('orderDetail').innerHTML = `
      <h2>${escapeHtml(order.numero)} - ${escapeHtml(order.cliente)}</h2>
      <p>${escapeHtml(order.empresa)}</p>
      <div class="box">
        <b>Informacoes do trabalho</b>
        <p>Entrega: ${escapeHtml(order.dataEntrega || 'Nao definida')}</p>
        <p>Estado no CRM: <strong>${escapeHtml(operation.label)}</strong></p>
        <p>Morada: ${escapeHtml(order.morada || 'Nao informada')}</p>
        <p>Contacto: ${escapeHtml(order.telemovel || 'Nao informado')}</p>
        <p>Comissao total atribuida: <strong>${money(assignment.commission)}</strong></p>
        <p>Ja marcado para voce: <strong>${money(assignedStepValue(assignment))}</strong></p>
        <p>Status do pagamento: <strong>${paid ? `Pago em ${new Date(assignment.paidAt).toLocaleString('pt-PT')}` : isDone(assignment) ? 'Concluido e aguardando pagamento' : isOrderClosed(assignment) ? 'Produção encerrada no CRM; etapas pendentes' : 'Em andamento'}</strong></p>
        <p>${escapeHtml(order.observacoes || '')}</p>
      </div>
      <div class="box">
        <b>Artigo direcionado</b>
        ${products.map(product => `<div class="product"><strong>${escapeHtml(product.nome)}</strong><p>${escapeHtml(product.tamanho || '')} - Qtd. ${escapeHtml(product.quantidade)}</p><p>${escapeHtml(product.observacoes || '')}</p></div>`).join('')}
      </div>
      <div class="box">
        <b>Etapas</b>
        ${assignment.steps.map(step => {
          const lockedByOther = step.done && step.completedByWorkerId && step.completedByWorkerId !== currentWorker?.id;
          const owner = step.completedByWorkerName ? ` · feito por ${escapeHtml(step.completedByWorkerName)}` : '';
          return `<div class="step">
          <label><input type="checkbox" data-step="${escapeHtml(step.id)}" ${step.done ? 'checked' : ''} ${workLocked || lockedByOther ? 'disabled' : ''}><span>${escapeHtml(step.label)}</span></label>
          <small>${Number(step.actualMinutes || 0)} min realizados · ${money(step.commissionValue || 0)}${owner}</small>
        </div>`;
        }).join('')}
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
