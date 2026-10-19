/**
 * Automated Authentication & Security Tests for HavenDesk
 */

import assert from 'node:assert';
import { hashPassword, verifyPassword, generateToken, encryptSecret, decryptSecret } from '../server/utils/crypto.js';
import { createSession, sessions, destroySession } from '../server/middleware/auth.js';

console.log('🧪 Running HavenDesk Authentication & Crypto Tests...');

// 1. Password Hashing & Verification
const password = 'StrongPassword2026!';
const hash = hashPassword(password);

assert.ok(hash.includes(':'), 'Hash format must be salt:derivedKey');
assert.strictEqual(verifyPassword(password, hash), true, 'Password verification must pass for matching password');
assert.strictEqual(verifyPassword('WrongPassword', hash), false, 'Password verification must fail for incorrect password');
console.log('   ✓ Secure scrypt password hashing & timing-safe verification: PASSED');

// 2. Secret Encryption & Decryption at rest
const testApiKey = 'sk_live_vapi_982347891234891234';
const encrypted = encryptSecret(testApiKey);
assert.notStrictEqual(encrypted, testApiKey, 'Secret must be encrypted and unreadable in plain text');
const decrypted = decryptSecret(encrypted);
assert.strictEqual(decrypted, testApiKey, 'Decrypted secret must match original key');
console.log('   ✓ AES-256-GCM secret encryption at rest: PASSED');

// 3. Session Creation, Storage & Revocation
const fakeUser = { id: 'usr_test_1', email: 'test@example.com', role: 'client_owner', tenant_id: 'tnt_1', name: 'Tester' };
const { token, session } = createSession(fakeUser);

assert.ok(sessions.has(token), 'Session must be stored in active session registry');
assert.strictEqual(session.userId, fakeUser.id);
assert.strictEqual(session.tenantId, fakeUser.tenant_id);

destroySession(token);
assert.strictEqual(sessions.has(token), false, 'Session must be cleanly revoked upon logout');
console.log('   ✓ Session lifecycle and token revocation: PASSED');

console.log('\n============================================================');
console.log('✅ ALL AUTH & CRYPTO TESTS PASSED');
console.log('============================================================\n');
