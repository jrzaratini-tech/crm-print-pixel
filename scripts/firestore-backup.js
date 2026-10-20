const { db } = require('../firebase.js');
const BACKUP_SERVICE = require('../core/backup-service.js');

async function main() {
  const bucketName = String(process.env.FIREBASE_BACKUP_BUCKET || '').trim();
  const result = await BACKUP_SERVICE.createBackup({ db, bucketName });
  console.log(JSON.stringify({ success: true, ...result }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
