'use strict';

const crypto = require('crypto');
const { config } = require('../config');

/**
 * We store each user's GitHub access token in the database so we can
 * fetch their data later (e.g. during a scheduled background sync).
 * Storing raw tokens would be dangerous, so we encrypt them at rest
 * using AES-256-GCM (an authenticated cipher — it also detects tampering).
 */
const ALGORITHM = 'aes-256-gcm';

// Derive a stable 32-byte key from the configured secret.
function getKey() {
  const raw = config.tokenEncryptionKey;
  // Preferred: a 64-character hex string (exactly 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Fallback: hash whatever string was provided down to 32 bytes so the
  // app still runs during development even with a non-hex key.
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a string. Returns "iv:authTag:ciphertext", all hex-encoded.
 */
function encrypt(plainText) {
  const iv = crypto.randomBytes(12); // 96-bit IV is standard for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Reverse of encrypt(). Throws if the data was tampered with.
 */
function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted payload format');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
