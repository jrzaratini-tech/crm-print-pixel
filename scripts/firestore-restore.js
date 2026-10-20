const { db } = require('../firebase.js');
const BACKUP = require('../core/backup-archive.js');
const BACKUP_SERVICE = require('../core/backup-service.js');

async function main() {
  const bucketName = String(process.env.FIREBASE_BACKUP_BUCKET || '').trim();
  const objectName = String(process.env.FIREBASE_BACKUP_OBJECT || '').trim();
  if (!bucketName || !objectName) throw new Error('Configure FIREBASE_BACKUP_BUCKET e FIREBASE_BACKUP_OBJECT.');
  const dryRun = process.env.BACKUP_RESTORE_CONFIRM !== 'RESTORE';
  if (dryRun) {
    const verified = await BACKUP_SERVICE.verifyBackup({ bucketName, objectName });
    console.log(JSON.stringify({ success: true, dryRun: true, message: 'Backup íntegro. Nenhum dado foi alterado.', ...verified }));
    return;
  }
  const { getStorage } = require('firebase-admin/storage');
  const [buffer] = await getStorage().bucket(bucketName).file(objectName).download();
  const archive = BACKUP.decode(buffer);
  let restored = 0;
  for (const [collectionName, documents] of Object.entries(archive.collections)) {
    for (const document of documents) {
      await db.collection(collectionName).doc(document.id).set(document.data);
      restored += 1;
    }
  }
  console.log(JSON.stringify({ success: true, dryRun: false, restored, manifest: archive.manifest }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
