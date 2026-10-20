const assert = require('node:assert/strict');
const { test } = require('node:test');
const ACCESS = require('../core/admin-access.js');

test('define perfis administrativos com menor privilégio', () => {
  assert.equal(ACCESS.hasPermission({ role: 'administracao' }, 'users.manage'), true);
  assert.equal(ACCESS.hasPermission({ role: 'comercial' }, 'quotes.write'), true);
  assert.equal(ACCESS.hasPermission({ role: 'comercial' }, 'fiscal.write'), false);
  assert.equal(ACCESS.pagePermission('/pages/faturacao.html'), 'fiscal.write');
  assert.equal(ACCESS.pagePermission('/pages/orcamentos.html'), 'quotes.read');
});

test('protege palavras-passe administrativas e não expõe hashes', () => {
  const fields = ACCESS.passwordFields('palavra-passe-segura-123');
  assert.equal(ACCESS.passwordMatches('palavra-passe-segura-123', fields), true);
  assert.equal(ACCESS.passwordMatches('incorreta', fields), false);
  const visible = ACCESS.publicUser({ id: 'u1', username: 'teste', role: 'financeiro', ...fields });
  assert.equal('passwordHash' in visible, false);
  assert.equal('passwordSalt' in visible, false);
  assert.equal(visible.permissions.includes('fiscal.write'), true);

  const invalidRole = ACCESS.publicUser({ id: 'u2', username: 'sem-perfil', role: 'desconhecido' });
  assert.equal(invalidRole.role, 'sem_perfil');
  assert.deepEqual(invalidRole.permissions, []);
});
