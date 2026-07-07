(() => {
  'use strict';

  const TOKEN_KEY = 'printpixel_vendedor_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let sales = [];
  let quotes = [];
  let debts = [];
  let purchases = [];
  let balance = {};
  let currentSeller = null;

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
    currentSeller = null;
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

  function sellerName() {
    return currentSeller?.name || 'Comercial';
  }

  function quoteProposalText(quote) {
    const lines = [
      `Proposta ${quote.codigo}`,
      `Comercial: ${sellerName()}`,
      '',
      quote.cliente || quote.empresa || '',
      '',
      'Itens:'
    ].filter((line, index) => index !== 3 || Boolean(line));

    (quote.produtos || []).forEach(product => {
      const quantity = Number(product.quantidade || 1) || 1;
      const total = Number(product.valor || 0) * Math.max(1, quantity);
      lines.push(`- ${product.nome || 'Produto'} | Qtd. ${quantity} | ${money(total)}`);
      if (product.observacoes) lines.push(`  Obs.: ${product.observacoes}`);
    });

    lines.push('', `Subtotal: ${money(quote.subtotal)}`);
    if (Number(quote.iva || 0) > 0) lines.push(`IVA: ${money(quote.iva)}`);
    lines.push(`Total: ${money(quote.total)}`);
    if (quote.observacoes) lines.push('', `Observacoes: ${quote.observacoes}`);
    lines.push('', `Proposta enviada por ${sellerName()}.`);
    return lines.join('\n');
  }

  function proposalProductsHtml(quote) {
    const rows = (quote.produtos || []).map(product => {
      const quantity = Number(product.quantidade || 1) || 1;
      const unit = Number(product.valor || 0);
      const total = unit * Math.max(1, quantity);
      return `
        <tr>
          <td>
            <strong>${escapeHtml(product.nome || 'Produto')}</strong>
            ${product.observacoes ? `<small>${escapeHtml(product.observacoes)}</small>` : ''}
          </td>
          <td>${quantity}</td>
          <td>${money(unit)}</td>
          <td>${money(total)}</td>
        </tr>`;
    }).join('');
    return rows || '<tr><td colspan="4">Nenhum produto informado.</td></tr>';
  }

  function ensureProposalModal() {
    let modal = $('proposalModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'proposalModal';
    modal.className = 'proposal-modal';
    modal.innerHTML = '<div class="proposal-sheet" id="proposalSheet"></div>';
    document.body.append(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.remove('active');
    });
    return modal;
  }

  function showProposal(quote) {
    const modal = ensureProposalModal();
    $('proposalSheet').innerHTML = `
      <div class="proposal-top">
        <div>
          <p class="eyebrow">Proposta comercial</p>
          <h1>${escapeHtml(sellerName())}</h1>
          <p>Or&ccedil;amento #${escapeHtml(quote.codigo)}</p>
        </div>
        <button class="proposal-close" type="button">Fechar</button>
      </div>
      <div class="proposal-client">
        <span>Contacto</span>
        <strong>${escapeHtml(quote.cliente || quote.empresa || 'Contacto')}</strong>
        ${quote.email ? `<span>${escapeHtml(quote.email)}</span>` : ''}
        ${quote.telemovel ? `<span>${escapeHtml(quote.telemovel)}</span>` : ''}
      </div>
      <table class="proposal-table">
        <thead><tr><th>Produto</th><th>Qtd.</th><th>Valor un.</th><th>Total</th></tr></thead>
        <tbody>${proposalProductsHtml(quote)}</tbody>
      </table>
      ${quote.observacoes ? `<div class="proposal-note"><strong>Observa&ccedil;&atilde;o geral:</strong><p>${escapeHtml(quote.observacoes)}</p></div>` : ''}
      <div class="proposal-total">
        <div><span>Subtotal</span><strong>${money(quote.subtotal)}</strong></div>
        <div><span>IVA</span><strong>${money(quote.iva)}</strong></div>
        <div class="final"><span>Total</span><strong>${money(quote.total)}</strong></div>
      </div>
      <div class="proposal-signature">
        <span>Proposta emitida por</span>
        <strong>${escapeHtml(sellerName())}</strong>
      </div>
      <div class="proposal-actions">
        <button class="download-proposal" type="button">Baixar PDF</button>
      </div>`;

    $('proposalSheet').querySelector('.proposal-close').addEventListener('click', () => modal.classList.remove('active'));
    $('proposalSheet').querySelector('.download-proposal').addEventListener('click', () => downloadProposalPdf(quote));
    modal.classList.add('active');
  }

  function downloadProposalPdf(quote) {
    showProposal(quote);
    setTimeout(() => window.print(), 120);
  }

  function renderCard(sale, paid = false) {
    const card = document.createElement('article');
    card.className = `sale ${paid ? 'paid' : ''}`;
    card.innerHTML = `
      <div class="row"><div><h2>${escapeHtml(sale.numero)}</h2><p>${escapeHtml(sale.cliente || sale.empresa || 'Cliente')}</p></div><span class="tag">${paid ? 'Pago' : 'A receber'}</span></div>
      <div class="meta">
        <span>Base sem IVA/instalacao: ${money(sale.subtotalServicos)}</span>
        <span>Comissao: ${money(sale.commission)} (${Number(sale.commissionRate || 0)}%)</span>
        <span>${paid ? `Pago em ${new Date(sale.paidAt).toLocaleDateString('pt-PT')}` : `Entrega: ${escapeHtml(sale.dataEntrega || 'sem data')}`}</span>
      </div>`;
    return card;
  }

  function renderQuoteCard(quote) {
    const approved = quote.status === 'approved' || quote.status === 'aprovado';
    const card = document.createElement('article');
    card.className = `sale quote ${approved ? 'approved' : ''}`;
    card.innerHTML = `
      <div class="row"><div><h2>${escapeHtml(quote.codigo)}</h2><p>${escapeHtml(quote.cliente || quote.empresa || 'Contacto')}</p></div><span class="tag">${approved ? 'Aprovado' : 'Enviado'}</span></div>
      <div class="meta">
        <span>Valor: ${money(quote.total)} ${Number(quote.iva || 0) > 0 ? `(IVA ${money(quote.iva)})` : ''}</span>
        <span>Comissao prevista: ${money(quote.commission)} (${Number(quote.commissionRate || 0)}%)</span>
        ${Number(quote.sellerExtraMarkup || 0) > 0 ? `<span>Acrescimo na comissao: ${money(quote.sellerExtraMarkup)}</span>` : ''}
      </div>
      <div class="quote-actions">
        <label>Acrescimo sem IVA (€)<input class="extra-input" type="number" min="0" step="0.01" value="${Number(quote.sellerExtraMarkup || 0).toFixed(2)}" ${approved ? 'disabled' : ''}></label>
        <button class="save-extra" type="button" ${approved ? 'disabled' : ''}>Atualizar valor</button>
        <button class="view-proposal" type="button">Visualizar proposta</button>
        <button class="download-proposal-card" type="button">Baixar PDF</button>
      </div>`;

    const input = card.querySelector('.extra-input');
    card.querySelector('.save-extra').addEventListener('click', async () => {
      await api(`/api/vendedor/orcamentos/${quote.id}/valor`, { method: 'POST', body: JSON.stringify({ sellerExtraMarkup: input.value }) });
      await load();
    });
    card.querySelector('.view-proposal').addEventListener('click', () => showProposal(quote));
    card.querySelector('.download-proposal-card').addEventListener('click', () => downloadProposalPdf(quote));
    return card;
  }

  function renderList(id, list, paid) {
    const node = $(id);
    node.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = paid ? 'Nenhuma comissao paga no historico.' : 'Nenhuma comissao a receber.';
      node.append(empty);
      return;
    }
    list.forEach(sale => node.append(renderCard(sale, paid)));
  }

  function render() {
    const pending = sales.filter(item => item.paymentStatus !== 'paid');
    const paid = sales.filter(item => item.paymentStatus === 'paid');
    const openQuotes = quotes.filter(item => item.status !== 'approved' && item.status !== 'aprovado');
    $('openQuoteCount').textContent = openQuotes.length;
    $('pendingValue').textContent = money(pending.reduce((sum, item) => sum + Number(item.commission || 0), 0));
    $('purchaseValue').textContent = money(balance.purchasesDue);
    $('debtValue').textContent = money(balance.debtDue);
    $('netValue').textContent = money(balance.net);
    $('netValue').classList.toggle('negative', Number(balance.net) < 0);
    renderList('pendingList', pending, false);
    renderList('paidList', paid, true);

    const debtList = $('debtList');
    debtList.replaceChildren();
    if (!debts.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = 'Nenhuma compra com saldo em aberto.';
      debtList.append(empty);
    } else {
      debts.forEach(debt => {
        const card = document.createElement('article');
        card.className = 'sale debt';
        card.innerHTML = `<div class="row"><div><h2>${escapeHtml(debt.numero)}</h2><p>Compra própria</p></div><span class="tag">A pagar</span></div><div class="meta"><span>Total: ${money(debt.total)}</span><span>Já pago: ${money(debt.paid)}</span><strong>Dívida: ${money(debt.debt)}</strong></div>`;
        debtList.append(card);
      });
    }

    const purchaseList = $('purchaseList');
    purchaseList.replaceChildren();
    if (!purchases.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = 'Nenhuma venda para a PrintPixel registrada.';
      purchaseList.append(empty);
    } else {
      purchases.forEach(purchase => {
        const card = document.createElement('article');
        card.className = 'sale purchase';
        card.innerHTML = `<div class="row"><div><h2>${escapeHtml(purchase.product)}</h2><p>Compra da PrintPixel</p></div><span class="tag">${purchase.status === 'paid' ? 'Pago' : 'A receber'}</span></div><div class="meta"><span>Valor: ${money(purchase.total)}</span><span>Comprado em: ${purchase.dataCompra ? new Date(purchase.dataCompra).toLocaleDateString('pt-PT') : 'sem data'}</span>${Number(purchase.due || 0) > 0 ? `<strong>Em aberto: ${money(purchase.due)}</strong>` : ''}</div>`;
        purchaseList.append(card);
      });
    }

    const quoteList = $('quoteList');
    quoteList.replaceChildren();
    if (!quotes.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = 'Nenhum orcamento enviado para voce.';
      quoteList.append(empty);
    } else {
      quotes.forEach(quote => quoteList.append(renderQuoteCard(quote)));
    }
  }

  async function load() {
    if (!token) return showLogin();
    try {
      localStorage.setItem(TOKEN_KEY, token);
      const result = await api('/api/vendedor/session');
      showApp();
      currentSeller = result.seller;
      $('sellerName').textContent = result.seller.name;
      $('brandName').textContent = result.seller.name;
      sales = result.sales || [];
      quotes = result.quotes || [];
      debts = result.debts || [];
      purchases = result.purchases || [];
      balance = result.balance || {};
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
