const { getStorage } = require('firebase-admin/storage');
const BACKUP = require('./backup-archive.js');

async function collectFirestore(db) {
  if (!db || typeof db.listCollections !== 'function') throw new Error('O backup exige uma ligação Firestore real.');
  const collections = {};
  for (const ref of await db.listCollections()) {
    const snapshot = await ref.get();
    collections[ref.id] = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  }
  return collections;
}

function backupObjectName(createdAt) {
  const day = createdAt.slice(0, 10);
  const stamp = createdAt.replace(/[:.]/g, '-');
  return `crm-backups/${day}/printpixel-${stamp}.json.gz`;
}

async function createBackup({ db, bucketName, bucket } = {}) {
  const normalizedBucket = String(bucketName || '').trim();
  if (!normalizedBucket && !bucket) throw new Error('Configure FIREBASE_BACKUP_BUCKET com um bucket privado antes de executar.');
  const archive = BACKUP.buildArchive(await collectFirestore(db));
  const buffer = BACKUP.encode(archive);
  const objectName = backupObjectName(archive.createdAt);
  const targetBucket = bucket || getStorage().bucket(normalizedBucket);
  await targetBucket.file(objectName).save(buffer, {
    resumable: false,
    contentType: 'application/gzip',
    metadata: {
      cacheControl: 'no-store',
      metadata: { checksum: archive.manifest.checksum, documentCount: String(archive.manifest.documentCount) }
    }
  });
  return { bucket: normalizedBucket || targetBucket.name || '', objectName, manifest: archive.manifest, createdAt: archive.createdAt };
}

async function verifyBackup({ bucketName, objectName, bucket } = {}) {
  const normalizedBucket = String(bucketName || '').trim();
  const normalizedObject = String(objectName || '').trim();
  if ((!normalizedBucket && !bucket) || !normalizedObject) throw new Error('Informe o bucket e o objeto de backup para validar.');
  const targetBucket = bucket || getStorage().bucket(normalizedBucket);
  const [buffer] = await targetBucket.file(normalizedObject).download();
  const archive = BACKUP.decode(buffer);
  return { bucket: normalizedBucket || targetBucket.name || '', objectName: normalizedObject, manifest: archive.manifest, createdAt: archive.createdAt, verifiedAt: new Date().toISOString() };
}

async function createAndVerifyBackup(options = {}) {
  const created = await createBackup(options);
  const verified = await verifyBackup({ ...options, objectName: created.objectName });
  if (verified.manifest.checksum !== created.manifest.checksum) throw new Error('O checksum do backup descarregado não corresponde ao ficheiro criado.');
  return { ...created, verifiedAt: verified.verifiedAt, restoreTest: 'dry_run_validated' };
}

module.exports = { backupObjectName, collectFirestore, createBackup, verifyBackup, createAndVerifyBackup };
