/**
 * Automated Billing, Subscription Enforcement & Security Tests
 * Verifies that:
 * 1. Active tenants can access portal and perform operations.
 * 2. Suspended / past-due tenants can view past data (GET) but mutations (POST) are locked with 402.
 * 3. Widget returns polite fallback when subscription is suspended or past due.
 * 4. Auth rate limiter blocks after 5 failed login attempts with 429.
 * 5. Usage metering increments properly and flags 80% / 100% thresholds.
 * 6. Security headers are returned on responses.
 */

import assert from 'node:assert';
import { db } from '../server/db/database.js';
import { usageService } from '../server/services/usage.js';
import { recordFailedLogin, clearFailedLogins } from '../server/middleware/security.js';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Running HavenDesk Billing Enforcement & Security Tests...\n');

  // Test 1: Security Headers on HTTP Responses
  console.log('1. Testing Security HTTP Headers...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  assert.strictEqual(healthRes.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(healthRes.headers.get('content-security-policy'), 'CSP header must be present');
  console.log('   ✓ Security headers (CSP, nosniff, SAMEORIGIN) confirmed.\n');

  // Test 2: Login and Active Tenant Access
  console.log('2. Testing Active Tenant Access...');
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@vanguardroofing.com',
      password: 'ClientPass2026!'
    })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Valid login must succeed');
  assert.ok(loginData.token, 'Token must be returned');
  const token = loginData.token;
  const tenantId = loginData.tenant.id;

  // Active GET request
  const overviewRes = await fetch(`${BASE_URL}/api/v1/portal/overview`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(overviewRes.status, 200, 'Overview should return 200 for active tenant');
  console.log('   ✓ Active tenant can access portal overview (200 OK).\n');

  // Test 3: Lockout & Read-Only Behavior when Suspended
  console.log('3. Testing Subscription Lockout Enforcement (Suspended Tenant)...');
  // Temporarily set tenant to 'suspended'
  db.run("UPDATE tenants SET subscription_status = 'suspended' WHERE id = ?", [tenantId]);

  // A) GET requests should still succeed so client can see past records
  const pastDataRes = await fetch(`${BASE_URL}/api/v1/portal/overview`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(pastDataRes.status, 200, 'GET requests for past records must succeed during suspension');
  console.log('   ✓ Suspended tenant can still read historical data (calls, bookings).');

  // B) POST / Mutation requests must be rejected with 402 Payment Required
  const mutationRes = await fetch(`${BASE_URL}/api/v1/portal/team/invite`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'newstaff@test.com', name: 'New Staff' })
  });
  assert.strictEqual(mutationRes.status, 402, 'Mutation should be blocked with 402 Payment Required');
  const mutData = await mutationRes.json();
  assert.strictEqual(mutData.paymentRequired, true, 'paymentRequired flag must be true');
  console.log('   ✓ Mutation attempt rejected with 402 Payment Required.');

  // C) Widget must return polite fallback
  const widgetRes = await fetch(`${BASE_URL}/api/v1/widget/check?key=pk_live_vanguard_roofing_key`);
  const widgetData = await widgetRes.json();
  assert.strictEqual(widgetData.active, false, 'Widget should be inactive for suspended tenant');
  assert.strictEqual(widgetData.fallback, true, 'Widget must provide fallback flag');
  assert.ok(widgetData.message.includes('unavailable'), 'Polite fallback message present');
  console.log(`   ✓ Widget returned polite fallback: "${widgetData.message}"`);

  // D) Billing checkout endpoint must remain accessible so tenant can pay & reactivate
  const checkoutRes = await fetch(`${BASE_URL}/api/v1/portal/billing/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ planId: 'plan_growth' })
  });
  assert.strictEqual(checkoutRes.status, 200, 'Billing checkout must remain accessible during suspension');
  const checkoutData = await checkoutRes.json();
  assert.strictEqual(checkoutData.success, true);
  console.log('   ✓ Billing checkout allowed suspended tenant to re-subscribe.\n');

  // Verify status is now active again
  const reactivatedTenant = db.get("SELECT subscription_status FROM tenants WHERE id = ?", [tenantId]);
  assert.strictEqual(reactivatedTenant.subscription_status, 'active', 'Tenant must be restored to active after checkout');
  console.log('   ✓ Tenant successfully reactivated to active status.\n');

  // Test 4: Auth Rate Limiter
  console.log('4. Testing Authentication Rate Limiter (Brute Force Protection)...');
  const testIp = '192.168.1.99';
  clearFailedLogins(testIp);

  // Record 5 failed logins
  for (let i = 1; i <= 5; i++) {
    recordFailedLogin(testIp);
  }

  // Simulate 6th request
  let rateLimitHit = false;
  const mockReq = { ip: testIp, connection: {} };
  const mockRes = {
    status: (code) => {
      if (code === 429) rateLimitHit = true;
      return { json: (msg) => msg };
    }
  };
  const mockNext = () => {};

  const { authRateLimiter } = await import('../server/middleware/security.js');
  authRateLimiter(mockReq, mockRes, mockNext);
  assert.strictEqual(rateLimitHit, true, '6th attempt must trigger 429 Too Many Requests');
  clearFailedLogins(testIp);
  console.log('   ✓ Brute force protection: 429 triggered after 5 failed login attempts.\n');

  // Test 5: Usage Metering & Threshold Flags
  console.log('5. Testing Usage Metering & Warning Thresholds...');
  const testTenantId = 'tnt_roofing_01';
  // Reset usage record for test month to ensure idempotent test runs
  const currentMonth = usageService.getCurrentMonth();
  db.run("DELETE FROM usage_records WHERE tenant_id = ? AND billing_month = ?", [testTenantId, currentMonth]);

  // Plan Growth: 1000 voice minutes included
  // Record 850 minutes (85% - should trigger warning_80)
  usageService.recordUsage(testTenantId, { voiceMinutes: 850, messages: 100, aiTokens: 50000 });
  const summary85 = usageService.getUsageSummary(testTenantId);
  assert.strictEqual(summary85.warning?.status, 'warning_80', '85% usage must trigger warning_80 status');
  console.log(`   ✓ 85% usage correctly triggered warning: "${summary85.warning.message}"`);

  // Record 200 more minutes (1050 total - 105% - should trigger exceeded_100)
  usageService.recordUsage(testTenantId, { voiceMinutes: 200 });
  const summary105 = usageService.getUsageSummary(testTenantId);
  assert.strictEqual(summary105.warning?.status, 'exceeded_100', '105% usage must trigger exceeded_100 status');
  console.log(`   ✓ 105% usage correctly triggered limit: "${summary105.warning.message}"\n`);

  console.log('🎉 ALL PHASE 4 BILLING ENFORCEMENT & SECURITY TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
