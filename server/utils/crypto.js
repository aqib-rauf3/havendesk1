/**
 * Cryptographic & Security Utilities
 * Secure password hashing with scrypt, token generation, and secret encryption at rest.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY = process.env.ENCRYPTION_KEY 
  ? crypto.scryptSync(process.env.ENCRYPTION_KEY, 'havendesk-salt', 32)
  : crypto.scryptSync('havendesk-default-secret-key-32b', 'havendesk-salt', 32);

/**
 * Hash a password using scrypt with a unique random salt
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored salt:hash
 */
export function verifyPassword(password, storedHash) {
  try {
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token (e.g. for sessions or API keys)
 */
export function generateToken(prefix = 'hvn', bytes = 24) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;
}

/**
 * Encrypt sensitive provider keys at rest (AES-256-GCM)
 */
export function encryptSecret(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive provider keys
 */
export function decryptSecret(encryptedPayload) {
  if (!encryptedPayload) return null;
  try {
    const [ivHex, authTagHex, encrypted] = encryptedPayload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

/**
 * Mask an API key for safe UI display (e.g., "sk_live_...4819")
 */
export function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  const prefix = key.substring(0, 4);
  const suffix = key.slice(-4);
  return `${prefix}••••••••${suffix}`;
}
