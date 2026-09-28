const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');

process.env.MOLONI_MODE = 'live';
process.env.MOLONI_ENCRYPTION_KEY = 'moloni-auth-regression-test-key';
const { app } = require('../server.js');
const { db } = require('../firebase.js');

function encryptedTokens() {
  const key = crypto.createHash('sha256').update(process.env.MOLONI_ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({
    access_token: 'expired-test-access', refresh_token: 'test-refresh', expires_at: 1
  }), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

test('estado live renova OAuth e distingue falha temporaria de autorizacao expirada', async () => {
  const originalFetch = global.fetch;
  const ref = db.collection('integrations').doc('moloni');
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/moloni/status`;
  let calls = 0;
  let failure = '';
  global.fetch = async (target, options) => {
    if (String(target).startsWith('https://api.moloni.pt/v1/grant/')) {
      calls++;
      return { ok: !failure, status: failure ? 400 : 200, json: async () => failure
        ? { error: failure }
        : { access_token: 'new-test-access', refresh_token: 'new-test-refresh', expires_in: 3600 } };
    }
    return originalFetch(target, options);
  };
  try {
    await ref.set({ tokens: encryptedTokens(), companyId: '123', settings: { defaultProductId: 456 } });
    const connected = await (await originalFetch(url)).json();
    assert.equal(connected.connected, true);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(connected).includes('new-test-access'), false);
    await originalFetch(url);
    assert.equal(calls, 1);

    await ref.set({ tokens: encryptedTokens() }, { merge: true });
    failure = 'temporarily_unavailable';
    const temporary = await (await originalFetch(url)).json();
    assert.equal(temporary.readyForLive, false);
    assert.ok((await ref.get()).data().tokens);

    failure = 'invalid_grant';
    const expired = await (await originalFetch(url)).json();
    assert.equal(expired.connected, false);
    assert.equal(expired.checklist.find(item => item.key === 'connected').ok, false);
    assert.match(expired.connectionError, /expirou/);
    const saved = (await ref.get()).data();
    assert.equal(saved.tokens, null);
    assert.equal(saved.companyId, '123');
    assert.equal(saved.settings.defaultProductId, 456);
    const persisted = await (await originalFetch(url)).json();
    assert.match(persisted.connectionError, /Ligar Moloni/);
  } finally {
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
});
