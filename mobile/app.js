(() => {
  'use strict';
  const TOKEN_KEY = 'printpixel_mobile_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let companyNif = '';
  let stream = null;
  let deferredInstall = null;
  const $ = id => document.getElementById(id);
  const screens = ['login', 'home', 'scan', 'entry', 'list', 'settings'];

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    setTimeout(() => $('toast').classList.remove('show'), 3200);
  }
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/mobile/login') logout(false);
    if (!response.ok) throw new Error(body.message || 'Não foi possível concluir a operação.');
    return body;
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  function show(name) {
    stopCamera();
    screens.forEach(screen => $(`${screen}Screen`).classList.toggle('active', screen === name));
    $('bottomNav').hidden = !token;
    if (name === 'list' || name === 'home') loadDocuments();
  }
  function statusLabel(status) {
    return status === 'approved' ? 'Aprovada' : status === 'rejected' ? 'Rejeitada' : 'Em revisão';
  }
  function renderList(target, documents, max) {
    const node = $(target);
    node.replaceChildren();
    const visible = documents.slice(0, max || documents.length);
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhuma fatura enviada ainda.';
      node.append(empty);
      return;
    }
    visible.forEach(item => {
      const row = document.createElement('div');
      row.className = 'list-item';
      const badge = document.createElement('span');
      badge.className = `badge ${item.status}`;
      badge.textContent = statusLabel(item.status);
      const title = document.createElement('strong');
      title.textContent = `${item.entryType === 'income' ? 'Venda' : 'Compra'} · ${item.tipoDocumento} ${item.numeroFatura}`;
      const info = document.createElement('small');
      info.textContent = `${item.dataCompra} · € ${Number(item.valorTotal).toFixed(2)} · ${item.deviceName}`;
      row.append(badge, title, info);
      node.append(row);
    });
  }
  async function loadDocuments() {
    if (!token) return;
    try {
      const data = await api('/api/mobile/documents');
      renderList('recentList', data.documents, 4);
      renderList('fullList', data.documents);
    } catch (error) {
      toast(error.message);
    }
  }
  function logout(notify = true) {
    token = '';
    companyNif = '';
    localStorage.removeItem(TOKEN_KEY);
    show('login');
    if (notify) toast('Acesso removido deste celular.');
  }
  function parseQr(rawQr) {
    const pairs = {};
    rawQr.split('*').forEach(part => {
      const index = part.indexOf(':');
      if (index > 0) pairs[part.slice(0, index).trim().toUpperCase()] = part.slice(index + 1).trim();
    });
    const total = Number(String(pairs.O || pairs.P || pairs.Q || '0').replace(',', '.')) || 0;
    const iva = Number(String(pairs.N || pairs.IVA || '0').replace(',', '.')) || 0;
    const date = pairs.F && /^\d{8}$/.test(pairs.F) ? `${pairs.F.slice(0, 4)}-${pairs.F.slice(4, 6)}-${pairs.F.slice(6, 8)}` : '';
    return { rawQr, nifEmitente: pairs.A || '', nifAdquirente: pairs.B || '', tipoDocumento: pairs.D || 'FT', numeroFatura: pairs.G || '', dataCompra: date, valorTotal: total, valorIVA: iva };
  }
  function fillEntry(data = {}) {
    $('rawQr').value = data.rawQr || '';
    ['nifEmitente', 'nomeEmitente', 'nifAdquirente', 'tipoDocumento', 'numeroFatura', 'dataCompra', 'valorTotal', 'valorIVA'].forEach(id => {
      if (data[id] !== undefined && data[id] !== '') $(id).value = data[id];
    });
    const guessedType = companyNif && String(data.nifEmitente).replace(/\D/g, '') === companyNif ? 'income' : 'expense';
    document.querySelector(`input[name="entryType"][value="${guessedType}"]`).checked = true;
    show('entry');
  }
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      $('camera').srcObject = stream;
      await $('camera').play();
      scanFrame();
    } catch {
      toast('Não foi possível abrir a câmera. Confira a permissão do navegador.');
    }
  }
  function scanFrame() {
    if (!stream) return;
    const video = $('camera');
    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
      const canvas = $('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const code = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (code?.data) return fillEntry(parseQr(code.data));
    }
    requestAnimationFrame(scanFrame);
  }
  async function initialize() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
    if (!token) return show('login');
    try {
      const config = await api('/api/mobile/config');
      companyNif = config.companyNif || '';
      $('deviceInfo').textContent = `Dispositivo ativo: ${config.device}. O acesso permanece salvo somente neste celular.`;
      show('home');
    } catch {
      logout(false);
    }
  }
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/api/mobile/login', { method: 'POST', body: JSON.stringify({ deviceName: $('deviceName').value, accessKey: $('accessKey').value }) });
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      $('accessKey').value = '';
      await initialize();
      toast('Celular ativado com segurança.');
    } catch (error) {
      toast(error.message);
    }
  });
  $('documentForm').addEventListener('submit', async event => {
    event.preventDefault();
    const body = Object.fromEntries(['nifEmitente', 'nomeEmitente', 'nifAdquirente', 'tipoDocumento', 'numeroFatura', 'dataCompra', 'valorTotal', 'valorIVA', 'observacoes'].map(id => [id, $(id).value]));
    body.entryType = document.querySelector('input[name="entryType"]:checked').value;
    body.rawQr = $('rawQr').value;
    try {
      const result = await api('/api/mobile/documents', { method: 'POST', body: JSON.stringify(body) });
      event.target.reset();
      $('tipoDocumento').value = 'FT';
      $('valorIVA').value = '0';
      $('rawQr').value = '';
      toast(result.message);
      show('home');
    } catch (error) {
      toast(error.message);
    }
  });
  document.addEventListener('click', event => {
    const go = event.target.closest('[data-go]')?.dataset.go;
    if (go) show(go);
  });
  $('startCamera').addEventListener('click', startCamera);
  $('useRawQr').addEventListener('click', () => fillEntry(parseQr($('rawQr').value)));
  $('logoutBtn').addEventListener('click', () => logout());
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
  initialize();
})();
