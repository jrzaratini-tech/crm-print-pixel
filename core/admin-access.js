const crypto = require('crypto');

const ROLE_PERMISSIONS = Object.freeze({
  administracao: ['*'],
  gestao: [
    'dashboard.read', 'orders.read', 'orders.write', 'quotes.read', 'quotes.write',
    'production.read', 'production.write', 'finance.read', 'catalog.read', 'catalog.write',
    'management.read', 'ai.use', 'audit.read'
  ],
  comercial: ['dashboard.read', 'orders.read', 'orders.write', 'quotes.read', 'quotes.write', 'catalog.read', 'ai.use'],
  producao: ['orders.read', 'production.read', 'production.write', 'catalog.read'],
  financeiro: ['dashboard.read', 'orders.read', 'finance.read', 'finance.write', 'fiscal.read', 'fiscal.write', 'fiscal.close', 'catalog.read'],
  contabilista: ['dashboard.read', 'finance.read', 'fiscal.read', 'fiscal.close', 'audit.read'],
  tecnico: ['system.manage', 'users.manage', 'audit.read', 'integrations.manage', 'catalog.read', 'catalog.write']
});

const ROLE_LABELS = Object.freeze({
  administracao: 'Administração',
  gestao: 'Gestão',
  comercial: 'Comercial',
  producao: 'Produção',
  financeiro: 'Financeiro',
  contabilista: 'Contabilista',
  tecnico: 'Administração técnica'
});

const PAGE_PERMISSIONS = Object.freeze({
  'dashboard.html': 'dashboard.read',
  'novopedido.html': 'orders.write',
  'pedidos.html': 'orders.read',
  'novoorcamento.html': 'quotes.write',
  'orcamentos.html': 'quotes.read',
  'calculadora.html': 'quotes.write',
  'ordemproducao.html': 'production.read',
  'despesas.html': 'finance.read',
  'novadespesa.html': 'finance.write',
  'classificar-despesas.html': 'finance.write',
  'areceber.html': 'finance.read',
  'financas.html': 'finance.read',
  'equilibrio.html': 'management.read',
  'painel-financeiro.html': 'management.read',
  'contabilidade.html': 'fiscal.read',
  'verificacao.html': 'fiscal.read',
  'faturacao.html': 'fiscal.write',
  'fecho-fiscal.html': 'fiscal.read',
  'materiais.html': 'catalog.read',
  'produtos.html': 'catalog.read',
  'receitas.html': 'catalog.read',
  'fornecedores.html': 'catalog.read',
  'comissoes.html': 'finance.read',
  'rotulos.html': 'orders.read',
  'links.html': 'users.manage',
  'ia.html': 'ai.use',
  'aprendizagem.html': 'management.read',
  'configuracoes.html': 'users.manage',
  'utilizadores.html': 'users.manage',
  'integracoes.html': 'integrations.manage'
});

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validUsername(value) {
  return /^[a-z0-9][a-z0-9._-]{2,49}$/.test(normalizeUsername(value));
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ROLE_PERMISSIONS[role] ? role : '';
}

function passwordFields(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    passwordSalt: salt,
    passwordHash: crypto.scryptSync(String(password), salt, 64).toString('hex')
  };
}

function passwordMatches(password, user = {}) {
  if (!user.passwordSalt || !user.passwordHash) return false;
  const actual = Buffer.from(crypto.scryptSync(String(password), user.passwordSalt, 64).toString('hex'));
  const expected = Buffer.from(String(user.passwordHash));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function permissionsFor(role) {
  return [...(ROLE_PERMISSIONS[normalizeRole(role)] || [])];
}

function hasPermission(user, permission) {
  if (!permission) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : permissionsFor(user?.role);
  return permissions.includes('*') || permissions.includes(permission);
}

function publicUser(user = {}) {
  const { passwordHash, passwordSalt, ...safe } = user;
  const role = normalizeRole(safe.role);
  return {
    ...safe,
    role: role || 'sem_perfil',
    roleLabel: ROLE_LABELS[role] || 'Sem perfil',
    permissions: permissionsFor(role)
  };
}

function pagePermission(pathname) {
  const file = String(pathname || '').split('/').pop().split('?')[0].toLowerCase();
  return PAGE_PERMISSIONS[file] || '';
}

module.exports = {
  PAGE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  hasPermission,
  normalizeRole,
  normalizeUsername,
  pagePermission,
  passwordFields,
  passwordMatches,
  permissionsFor,
  publicUser,
  validUsername
};
