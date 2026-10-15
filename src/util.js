const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stripVTControlCharacters } = require('node:util');
const root = path.resolve(__dirname, '..');
function writeJSON(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function redact(value, names = []) {
  const secrets = Object.entries(process.env).filter(([key, val]) => val && (names.includes(key) || /KEY|TOKEN|PASSWORD|SECRET/i.test(key))).map(([, val]) => val);
  const walk = input => {
    if (typeof input === 'string') {
      let output = stripVTControlCharacters(input);
      for (const secret of secrets) output = output.split(secret).join('[REDACTED]');
      return output.replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [REDACTED]');
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, val]) => [key, walk(val)]));
    return input;
  };
  return walk(value);
}
function allowedFile(repo, relative) {
  const base = fs.realpathSync(repo);
  const file = fs.realpathSync(path.resolve(base, relative));
  const rel = path.relative(base, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Source file is outside the configured repository');
  if (!/\.(?:[cm]?[jt]sx?|html|css|md)$/.test(file) || /(?:^|[/\\])(?:node_modules|\.git)(?:[/\\])/.test(file)) throw new Error('Unsupported source evidence file');
  if (fs.statSync(file).size > 100000) throw new Error('Source evidence file is too large');
  return file;
}
function sourceEvidence(context) {
  if (!context.sourceFiles?.length) return [];
  if (!context.repository) throw new Error('sourceFiles requires an explicit repository path');
  if (context.sourceFiles.length > 10) throw new Error('At most ten source evidence files are allowed');
  const evidence = context.sourceFiles.map(file => ({ file, content: fs.readFileSync(allowedFile(context.repository, file), 'utf8') }));
  if (evidence.reduce((total,item)=>total+item.content.length,0)>100000) throw new Error('Combined source evidence exceeds 100,000 characters');
  return evidence;
}
function integer(value, fallback, min, max) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Expected integer ${min}–${max}, received ${value}`);
  return n;
}
module.exports = { root, writeJSON, readJSON, hash, redact, allowedFile, sourceEvidence, integer };
