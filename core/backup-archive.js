const crypto = require('crypto');
const zlib = require('zlib');

const FORMAT = 'printpixel-firestore-backup-v1';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function buildArchive(collections = {}, options = {}) {
  const normalized = Object.keys(collections).sort().reduce((result, name) => {
    result[name] = (Array.isArray(collections[name]) ? collections[name] : [])
      .map(item => ({ id: String(item.id || ''), data: stable(item.data || {}) }))
      .filter(item => item.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    return result;
  }, {});
  const content = { format: FORMAT, createdAt: options.createdAt || new Date().toISOString(), collections: normalized };
  return {
    ...content,
    manifest: {
      collectionCount: Object.keys(normalized).length,
      documentCount: Object.values(normalized).reduce((total, docs) => total + docs.length, 0),
      checksum: checksum(content)
    }
  };
}

function validateArchive(archive = {}) {
  const errors = [];
  if (archive.format !== FORMAT) errors.push('Formato de backup incompatível.');
  if (!archive.collections || typeof archive.collections !== 'object' || Array.isArray(archive.collections)) errors.push('Coleções ausentes ou inválidas.');
  const expected = checksum({ format: archive.format, createdAt: archive.createdAt, collections: archive.collections || {} });
  if (!archive.manifest?.checksum || archive.manifest.checksum !== expected) errors.push('Checksum do backup inválido.');
  const actualCount = Object.values(archive.collections || {}).reduce((total, docs) => total + (Array.isArray(docs) ? docs.length : 0), 0);
  if (Number(archive.manifest?.documentCount) !== actualCount) errors.push('Contagem de documentos divergente.');
  return errors;
}

function encode(archive) {
  const errors = validateArchive(archive);
  if (errors.length) throw new Error(errors[0]);
  return zlib.gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'), { level: 9 });
}

function decode(buffer) {
  const archive = JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
  const errors = validateArchive(archive);
  if (errors.length) throw new Error(errors[0]);
  return archive;
}

module.exports = { FORMAT, buildArchive, checksum, decode, encode, validateArchive };
