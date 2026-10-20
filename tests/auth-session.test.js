const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.CRM_USERNAME = 'admin-teste';
process.env.CRM_PASSWORD = 'palavra-passe-segura-teste';
delete process.env.CRM_AUTH_DISABLED;

const { app } = require('../server.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('login web cria sessao segura para navegadores sem HTTP Basic', async () => {
  const protectedPage = await fetch(`${baseUrl}/pages/faturacao.html`, { redirect: 'manual' });
  assert.equal(protectedPage.status, 303);
  assert.equal(protectedPage.headers.get('location'), '/login?returnTo=%2Fpages%2Ffaturacao.html');

  const loginPage = await fetch(`${baseUrl}/login?returnTo=%2Fpages%2Ffaturacao.html`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Entrar com segurança/);

  const denied = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin-teste', password: 'errada', returnTo: '/pages/faturacao.html' })
  });
  assert.equal(denied.status, 401);

  const accepted = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'crm-print-pixel.onrender.com',
      Origin: 'https://crm-print-pixel.onrender.com',
      'X-Forwarded-Host': 'crm-print-pixel.onrender.com',
      'X-Forwarded-Proto': 'https'
    },
    body: new URLSearchParams({
      username: 'admin-teste',
      password: 'palavra-passe-segura-teste',
      returnTo: '/pages/faturacao.html'
    })
  });
  assert.equal(accepted.status, 303);
  assert.equal(accepted.headers.get('location'), '/pages/faturacao.html');
  const cookie = accepted.headers.get('set-cookie');
  assert.match(cookie, /^crm_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);

  const authenticated = await fetch(`${baseUrl}/pages/faturacao.html`, {
    headers: { Cookie: cookie.split(';')[0] }
  });
  assert.equal(authenticated.status, 200);
  assert.match(await authenticated.text(), /Faturação e pagamentos/);
});
