(() => {
  'use strict';
  const TOKEN_KEY = 'printpixel_mobile_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let stream = null;
  let scanTimer = null;
  let scanRequest = null;
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
    if (scanTimer) clearInterval(scanTimer);
    if (scanRequest) cancelAnimationFrame(scanRequest);
    scanTimer = null;
    scanRequest = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    $('stopCamera').hidden = true;
    $('scanHint').textContent = 'Aguardando abertura da câmera';
  }
  function show(name) {
    stopCamera();
    screens.forEach(screen => $(`${screen}Screen`).classList.toggle('active', screen === name));
    $('bottomNav').hidden = !token;
    if (name === 'list' || name === 'home') loadDocuments();
  }
  function statusLabel(status) {
    return status === 'approved' ? 'Lançada' : status === 'rejected' ? 'Rejeitada' : 'Processando';
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
    localStorage.removeItem(TOKEN_KEY);
    show('login');
    if (notify) toast('Acesso removido deste celular.');
  }
  async function submitScannedQr(rawQr) {
    stopCamera();
    try {
      const result = await api('/api/mobile/documents', { method: 'POST', body: JSON.stringify({ rawQr, expenseMode: $('scanExpenseMode').value }) });
      alert(result.message);
    } catch (error) {
      alert(error.message);
    }
    $('rawQr').value = '';
    show('home');
  }
  async function startCamera() {
    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('camera').srcObject = stream;
      await $('camera').play();
      $('stopCamera').hidden = false;
      $('scanHint').textContent = 'Procurando QR Code...';
      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          scanTimer = setInterval(async () => {
            try {
              const codes = await detector.detect($('camera'));
              if (codes.length) submitScannedQr(codes[0].rawValue);
            } catch {
              clearInterval(scanTimer);
              scanTimer = null;
              startCanvasScanner();
            }
          }, 700);
          return;
        } catch {
          // Some browsers expose BarcodeDetector without QR support.
        }
      }
      startCanvasScanner();
    } catch {
      toast('Não foi possível abrir a câmera. Confira a permissão do navegador.');
    }
  }
  function startCanvasScanner() {
    if (typeof jsQR !== 'function') {
      stopCamera();
      toast('O leitor QR não carregou. Atualize a página e tente novamente.');
      return;
    }
    const canvas = $('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      const video = $('camera');
      if (!stream || video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
        scanRequest = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        submitScannedQr(code.data);
        return;
      }
      scanRequest = requestAnimationFrame(tick);
    };
    tick();
  }
  async function initialize() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
    if (!token) return show('login');
    try {
      const config = await api('/api/mobile/config');
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
    body.expenseMode = $('manualExpenseMode').value;
    body.rawQr = $('rawQr').value;
    try {
      const result = await api('/api/mobile/documents', { method: 'POST', body: JSON.stringify(body) });
      event.target.reset();
      $('tipoDocumento').value = 'FT';
      $('valorIVA').value = '0';
      $('manualExpenseMode').value = 'normal';
      $('manualExpenseMode').dispatchEvent(new Event('change'));
      $('rawQr').value = '';
      toast(result.message);
      show('home');
    } catch (error) {
      toast(error.message);
    }
  });
  $('manualExpenseMode').addEventListener('change', () => {
    const salary = $('manualExpenseMode').value === 'SALÁRIO';
    ['nifEmitente', 'numeroFatura'].forEach(id => {
      $(id).required = !salary;
      $(id).disabled = salary;
    });
    $('nifAdquirente').disabled = salary;
    $('nomeEmitente').disabled = salary;
    $('valorIVA').disabled = salary;
    if (salary) $('valorIVA').value = '0';
  });
  document.addEventListener('click', event => {
    const go = event.target.closest('[data-go]')?.dataset.go;
    if (go) show(go);
  });
  $('startCamera').addEventListener('click', startCamera);
  $('stopCamera').addEventListener('click', stopCamera);
  $('useRawQr').addEventListener('click', () => submitScannedQr($('rawQr').value));
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
