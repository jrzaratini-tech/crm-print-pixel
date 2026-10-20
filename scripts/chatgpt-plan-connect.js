'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const CHATGPT_PLAN = require('../core/chatgpt-plan.js');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function openBrowser(url) {
  let executable = 'xdg-open';
  let args = [url];
  if (process.platform === 'win32') {
    executable = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (process.platform === 'darwin') {
    executable = 'open';
  }
  const child = spawn(executable, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function errorMessage(error) {
  const primary = String(error?.message || error || 'Erro desconhecido.');
  const cause = String(error?.cause?.message || '').trim();
  return cause && cause !== primary ? `${primary} (${cause})` : primary;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stableHostId() {
  const file = path.join(__dirname, '..', '.chatgpt-host-id');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  if (CHATGPT_PLAN.validHostId(existing)) return existing;
  const value = CHATGPT_PLAN.newHostId();
  fs.writeFileSync(file, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  return value;
}

async function main() {
  const crmUrl = argument('crm-url').replace(/\/+$/, '');
  const importCode = argument('import-code');
  if (!crmUrl || !importCode) {
    throw new Error('Use: npm run ai:connect -- --crm-url "https://seu-crm" --import-code "codigo"');
  }
  const parsedCrmUrl = new URL(crmUrl);
  const localTarget = ['127.0.0.1', 'localhost'].includes(parsedCrmUrl.hostname);
  if (parsedCrmUrl.protocol !== 'https:' && !localTarget) throw new Error('O endereço remoto do CRM deve usar HTTPS.');

  let finish;
  const completion = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  const server = http.createServer(async (req, res) => {
    try {
      const callback = new URL(req.url, 'http://127.0.0.1');
      if (callback.pathname !== '/auth/callback') {
        res.writeHead(404).end('Nao encontrado.');
        return;
      }
      if (callback.searchParams.get('state') !== attempt.state) throw new Error('Estado OAuth inválido.');
      if (callback.searchParams.get('error')) throw new Error(callback.searchParams.get('error_description') || callback.searchParams.get('error'));
      const code = callback.searchParams.get('code');
      const clientId = callback.searchParams.get('client_id');
      if (!code || !clientId || !clientId.startsWith('oaiapp_')) throw new Error('A OpenAI não concluiu o registo do cliente.');

      const tokens = await CHATGPT_PLAN.exchangeAuthorizationCode({
        clientId,
        code,
        codeVerifier: attempt.codeVerifier,
        redirectUri: attempt.redirectUri
      });
      if (!CHATGPT_PLAN.hasPlanUsageScope(tokens)) throw new Error('O acesso ao plano ChatGPT não foi autorizado.');
      await CHATGPT_PLAN.verifyIdToken(tokens.id_token, { clientId, nonce: attempt.nonce });

      const transfer = await fetch(`${crmUrl}/api/ai/import-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importCode,
          nonce: attempt.nonce,
          credentials: { ...tokens, client_id: clientId }
        })
      });
      const result = await transfer.json().catch(() => ({}));
      if (!transfer.ok) throw new Error(result.message || 'O CRM recusou a transferência da sessão.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Ligação concluída</title><body style="font:18px system-ui;padding:40px"><h1>Ligação concluída</h1><p>A conta ChatGPT Pro foi ligada ao CRM PrintPixel. Pode fechar esta janela.</p></body>');
      finish.resolve(result);
    } catch (error) {
      const diagnostic = errorMessage(error);
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Falha na ligação</title><body style="font:18px system-ui;padding:40px"><h1>Falha na ligação</h1><p>${escapeHtml(diagnostic)}</p><p>Pode fechar esta janela e tentar novamente pelo CRM.</p></body>`);
      finish.reject(error);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
  const attempt = CHATGPT_PLAN.createAuthorizationAttempt({
    hostId: stableHostId(),
    redirectUri,
    appName: 'PrintPixel CRM'
  });
  console.log('A abrir a autorização oficial da OpenAI no navegador...');
  console.log(`Se o navegador não abrir, visite:\n${attempt.url}`);
  if (!hasFlag('no-open')) openBrowser(attempt.url);

  const timeout = setTimeout(() => finish.reject(new Error('A autorização expirou após 10 minutos. Gere um novo código no CRM.')), 10 * 60 * 1000);
  try {
    const result = await completion;
    console.log(result.message || 'Conta ligada com sucesso.');
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}

main().catch(error => {
  console.error(`Falha: ${errorMessage(error)}`);
  process.exitCode = 1;
});
