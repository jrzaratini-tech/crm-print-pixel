'use strict';

const crypto = require('crypto');

const AUTHORIZATION_ENDPOINT = 'https://auth.openai.com/api/accounts/authorize';
const TOKEN_ENDPOINT = 'https://auth.openai.com/api/accounts/oauth/token';
const OIDC_CONFIGURATION_ENDPOINT = 'https://auth.openai.com/.well-known/openid-configuration';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function randomValue(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function validHostId(value) {
  return /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
    || /^urn:ietf:params:oauth:jwk-thumbprint:[A-Za-z0-9_-]{20,}$/.test(String(value || ''));
}

function newHostId() {
  return `urn:uuid:${crypto.randomUUID()}`;
}

function createAuthorizationAttempt({ hostId, redirectUri, appName, clientId = 'dynamic_agent_client', idTokenHint = '', loginHint = '' }) {
  if (!hostId || !redirectUri || !appName) throw new Error('hostId, redirectUri e appName são obrigatórios.');
  if (!validHostId(hostId)) throw new Error('ext_agent_host_id deve usar um UUID URN ou JWK thumbprint URN válido.');
  const state = randomValue();
  const nonce = randomValue();
  const codeVerifier = randomValue(64);
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const url = new URL(AUTHORIZATION_ENDPOINT);
  const parameters = {
    client_id: clientId,
    ext_agent_host_id: hostId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge
  };
  if (clientId === 'dynamic_agent_client') parameters.agent_name_hint = appName;
  if (idTokenHint) parameters.id_token_hint = idTokenHint;
  if (loginHint) parameters.login_hint = loginHint;
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  return { url: url.toString(), state, nonce, codeVerifier, redirectUri };
}

async function tokenRequest(parameters, fetchImpl = fetch) {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(body.error_description || body.error || 'A OpenAI recusou a autorização.');
    error.status = response.status;
    error.code = body.error || 'token_exchange_failed';
    throw error;
  }
  return body;
}

function exchangeAuthorizationCode({ clientId, code, codeVerifier, redirectUri }, fetchImpl = fetch) {
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    resource: RESOURCE
  }, fetchImpl);
}

function refreshCredentials({ clientId, refreshToken }, fetchImpl = fetch) {
  return tokenRequest({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    resource: RESOURCE
  }, fetchImpl);
}

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function verifyIdToken(idToken, { clientId, nonce = '', fetchImpl = fetch } = {}) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('ID token inválido.');
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Assinatura do ID token não suportada.');

  const configurationResponse = await fetchImpl(OIDC_CONFIGURATION_ENDPOINT);
  if (!configurationResponse.ok) throw new Error('Não foi possível consultar a configuração OIDC da OpenAI.');
  const configuration = await configurationResponse.json();
  const jwksResponse = await fetchImpl(configuration.jwks_uri);
  if (!jwksResponse.ok) throw new Error('Não foi possível consultar as chaves públicas da OpenAI.');
  const jwks = await jwksResponse.json();
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('A chave usada no ID token não foi encontrada.');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('A assinatura do ID token não é válida.');
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== 'https://auth.openai.com') throw new Error('Emissor do ID token inválido.');
  if (!clientId || !audiences.includes(clientId)) throw new Error('O ID token não pertence a este cliente.');
  if (!claims.exp || claims.exp <= now) throw new Error('O ID token expirou.');
  if (claims.nbf && claims.nbf > now + 60) throw new Error('O ID token ainda não é válido.');
  if (nonce && claims.nonce !== nonce) throw new Error('Nonce do ID token inválido.');
  if (!claims.sub) throw new Error('O ID token não contém a identidade da conta.');
  return claims;
}

function credentialCryptoKey(secret) {
  if (String(secret || '').length < 24) throw new Error('CHATGPT_TOKEN_ENCRYPTION_KEY deve ter pelo menos 24 caracteres.');
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptCredentials(credentials, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', credentialCryptoKey(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decryptCredentials(encrypted, secret) {
  if (!encrypted?.iv || !encrypted?.tag || !encrypted?.data) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', credentialCryptoKey(secret), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}

function grantedScopes(credentials = {}) {
  return new Set(String(credentials.scope || '').split(/\s+/).filter(Boolean));
}

function hasPlanUsageScope(credentials = {}) {
  return grantedScopes(credentials).has('chatgpt.tokens.use.direct');
}

async function listModels(accessToken, fetchImpl = fetch) {
  const response = await fetchImpl(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || 'Não foi possível consultar os modelos da conta.');
  return (body.models || []).filter(model => model.visibility === 'list');
}

function parseResponseStream(text) {
  let output = '';
  let completed = false;
  for (const block of String(text || '').split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') continue;
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    if (event.type === 'response.output_text.delta') output += event.delta || '';
    if (event.type === 'response.completed') completed = true;
    if (event.type === 'response.failed') {
      const error = new Error(event.response?.error?.message || 'A resposta da IA falhou.');
      error.code = event.response?.error?.code || 'response_failed';
      throw error;
    }
    if (event.type === 'response.incomplete') throw new Error('A resposta da IA ficou incompleta.');
  }
  if (!completed) throw new Error('A ligação terminou antes da confirmação da resposta.');
  return output;
}

async function createResponse({ accessToken, model, reasoningEffort, input, instructions = '', timeoutMs = 55000 }, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(10, Number(timeoutMs) || 55000));
  try {
    const response = await fetchImpl(`${RESOURCE}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        reasoning: { effort: reasoningEffort },
        input: Array.isArray(input) ? input : [{ role: 'user', content: String(input || '') }],
        ...(instructions ? { instructions: String(instructions) } : {}),
        store: false,
        stream: true
      }),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      let message = 'A OpenAI recusou o pedido.';
      try { message = JSON.parse(text).error?.message || message; } catch {}
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return parseResponseStream(text);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('A IA demorou demasiado a responder. Tente novamente.');
      timeoutError.code = 'ai_response_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  AUTHORIZATION_ENDPOINT,
  RESOURCE,
  SCOPES,
  createAuthorizationAttempt,
  createResponse,
  decryptCredentials,
  encryptCredentials,
  exchangeAuthorizationCode,
  hasPlanUsageScope,
  listModels,
  randomValue,
  newHostId,
  validHostId,
  refreshCredentials,
  verifyIdToken
};
