(() => {
  'use strict';
  const TOKEN_KEY = 'printpixel_vendedor_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let sales = [];
  const $ = id => document.getElementById(id);
  const money = value => Number(value || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Nao foi possivel concluir a operacao.');
    return body;
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

  function renderCard(sale, paid = false) {
    const card = document.createElement('article');
    card.className = `sale ${paid ? 'paid' : ''}`;
    card.innerHTML = `
      <div class="row"><div><h2>${escapeHtml(sale.numero)}</h2><p>${escapeHtml(sale.cliente || sale.empresa || 'Cliente')}</p></div><span class="tag">${paid ? 'Pago' : 'A receber'}</span></div>
      <div class="meta">
        <span>Base sem IVA/instalação: ${money(sale.subtotalServicos)}</span>
        <span>Comissão: ${money(sale.commission)} (${Number(sale.commissionRate || 0)}%)</span>
        <span>${paid ? `Pago em ${new Date(sale.paidAt).toLocaleDateString('pt-PT')}` : `Entrega: ${escapeHtml(sale.dataEntrega || 'sem data')}`}</span>
      </div>`;
    return card;
  }

  function renderList(id, list, paid) {
    const node = $(id);
    node.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = paid ? 'Nenhuma comissão paga no histórico.' : 'Nenhuma comissão a receber.';
      node.append(empty);
      return;
    }
    list.forEach(sale => node.append(renderCard(sale, paid)));
  }

  function render() {
    const pending = sales.filter(item => item.paymentStatus !== 'paid');
    const paid = sales.filter(item => item.paymentStatus === 'paid');
    $('openCount').textContent = pending.length;
    $('paidCount').textContent = paid.length;
    $('pendingValue').textContent = money(pending.reduce((sum, item) => sum + Number(item.commission || 0), 0));
    renderList('pendingList', pending, false);
    renderList('paidList', paid, true);
  }

  async function load() {
    if (!token) return showLogin();
    try {
      localStorage.setItem(TOKEN_KEY, token);
      const result = await api('/api/vendedor/session');
      showApp();
      $('sellerName').textContent = result.seller.name;
      sales = result.sales || [];
      render();
    } catch (error) {
      showLogin(error.message);
    }
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/vendedor/login', {
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
  $('historyToggle').addEventListener('click', () => { $('paidSection').hidden = !$('paidSection').hidden; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  load();
})();
