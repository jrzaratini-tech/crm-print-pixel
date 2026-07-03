'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  });
  return true;
}

function masked(value) {
  const text = String(value || '');
  if (!text) return 'em falta';
  if (text.length <= 8) return 'configurado';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

const loadedEnv = loadLocalEnvFile();
const required = [
  ['MOLONI_MODE', value => value === 'live', 'deve ser live'],
  ['MOLONI_CLIENT_ID', Boolean, 'Developer ID em falta'],
  ['MOLONI_CLIENT_SECRET', value => String(value || '').length >= 12, 'Client Secret em falta ou demasiado curto'],
  ['MOLONI_REDIRECT_URI', value => /^https:\/\/.+\/api\/moloni\/oauth\/callback$/i.test(String(value || '')), 'deve ser HTTPS e terminar em /api/moloni/oauth/callback'],
  ['MOLONI_ENCRYPTION_KEY', value => String(value || '').length >= 32, 'use uma chave aleatoria com pelo menos 32 caracteres']
];

console.log(`Moloni env check (${loadedEnv ? '.env local carregado' : 'sem .env local; usando ambiente do sistema'})`);
let ok = true;
for (const [key, validator, help] of required) {
  const value = process.env[key] || '';
  const valid = Boolean(validator(value));
  ok = ok && valid;
  console.log(`${valid ? 'OK ' : 'FALTA'} ${key}: ${key.includes('SECRET') || key.includes('KEY') ? masked(value) : (value || 'em falta')}`);
  if (!valid) console.log(`  - ${help}`);
}

if (!process.env.MOLONI_ENCRYPTION_KEY) {
  console.log('');
  console.log(`Sugestao de MOLONI_ENCRYPTION_KEY: ${crypto.randomBytes(32).toString('hex')}`);
}

if (!ok) process.exit(1);
console.log('');
console.log('Configuracao Moloni pronta para iniciar o CRM em modo live.');
