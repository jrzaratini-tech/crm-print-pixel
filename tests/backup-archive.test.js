const assert = require('node:assert/strict');
const test = require('node:test');
const BACKUP = require('../core/backup-archive.js');

test('backup faz ida e volta comprimida com checksum e contagens', () => {
  const archive = BACKUP.buildArchive({
    events: [{ id: 'b', data: { total: 20 } }, { id: 'a', data: { total: 10 } }],
    technical_recipes: [{ id: 'recipe-1', data: { version: 1 } }]
  }, { createdAt: '2026-10-20T12:00:00.000Z' });
  assert.equal(archive.manifest.collectionCount, 2);
  assert.equal(archive.manifest.documentCount, 3);
  const restored = BACKUP.decode(BACKUP.encode(archive));
  assert.deepEqual(restored, archive);
  assert.deepEqual(BACKUP.validateArchive(restored), []);
});

test('backup adulterado é rejeitado antes do restauro', () => {
  const archive = BACKUP.buildArchive({ events: [{ id: 'a', data: { total: 10 } }] });
  archive.collections.events[0].data.total = 999;
  assert.match(BACKUP.validateArchive(archive).join(' '), /Checksum/);
  assert.throws(() => BACKUP.encode(archive), /Checksum/);
});
