const test = require('node:test');
const assert = require('node:assert/strict');
const BACKUP_SERVICE = require('../core/backup-service.js');

function fakeDb() {
  return {
    listCollections: async () => [{
      id: 'events',
      get: async () => ({ docs: [{ id: 'evt-1', data: () => ({ schema: 'encomenda', title: 'Teste' }) }] })
    }]
  };
}

function fakeBucket() {
  const objects = new Map();
  return {
    name: 'backup-test',
    file: name => ({
      save: async buffer => objects.set(name, Buffer.from(buffer)),
      download: async () => {
        if (!objects.has(name)) throw new Error('Objeto não encontrado.');
        return [objects.get(name)];
      }
    })
  };
}

test('serviço cria backup e valida restauro de prova pelo checksum', async () => {
  const result = await BACKUP_SERVICE.createAndVerifyBackup({ db: fakeDb(), bucket: fakeBucket() });
  assert.match(result.objectName, /^crm-backups\/\d{4}-\d{2}-\d{2}\/printpixel-/);
  assert.equal(result.manifest.collectionCount, 1);
  assert.equal(result.manifest.documentCount, 1);
  assert.equal(result.restoreTest, 'dry_run_validated');
  assert.ok(result.verifiedAt);
});

test('nome do objeto preserva uma pasta diária ordenável', () => {
  assert.equal(
    BACKUP_SERVICE.backupObjectName('2026-10-20T20:00:01.123Z'),
    'crm-backups/2026-10-20/printpixel-2026-10-20T20-00-01-123Z.json.gz'
  );
});
