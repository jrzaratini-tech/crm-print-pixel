const { getStorage } = require('firebase-admin/storage');
const { db } = require('../firebase.js');
const BACKUP = require('../core/backup-archive.js');

async function main() {
  const bucketName = String(process.env.FIREBASE_BACKUP_BUCKET || '').trim();
  if (!bucketName) throw new Error('Configure FIREBASE_BACKUP_BUCKET com um bucket privado antes de executar.');
  if (typeof db.listCollections !== 'function') throw new Error('O backup exige uma ligação Firestore real.');

  const collections = {};
  for (const ref of await db.listCollections()) {
    const snapshot = await ref.get();
    collections[ref.id] = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  }
  const archive = BACKUP.buildArchive(collections);
  const buffer = BACKUP.encode(archive);
  const day = archive.createdAt.slice(0, 10);
  const stamp = archive.createdAt.replace(/[:.]/g, '-');
  const objectName = `crm-backups/${day}/printpixel-${stamp}.json.gz`;
  await getStorage().bucket(bucketName).file(objectName).save(buffer, {
    resumable: false,
    contentType: 'application/gzip',
    metadata: { cacheControl: 'no-store', metadata: { checksum: archive.manifest.checksum, documentCount: String(archive.manifest.documentCount) } }
  });
  console.log(JSON.stringify({ success: true, bucket: bucketName, objectName, manifest: archive.manifest }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
