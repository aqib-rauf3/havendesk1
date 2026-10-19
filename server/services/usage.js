/**
 * HavenDesk Usage Metering & Limit Enforcement Service
 * Tracks monthly voice minutes, WhatsApp/web messages, and AI tokens.
 * Handles 80% warning thresholds, soft caps, and overage tracking.
 */

import { db } from '../db/database.js';

export class UsageService {
  /**
   * Get current billing month in 'YYYY-MM' format
   */
  getCurrentMonth() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Record usage for a specific tenant in the current billing cycle
   */
  recordUsage(tenantId, { voiceMinutes = 0, messages = 0, aiTokens = 0 } = {}) {
    const month = this.getCurrentMonth();
    const id = `use_${tenantId}_${month}`;

    // Estimated provider direct costs:
    // Voice: ~$0.02 / min (Twilio/Telnyx + STT/TTS)
    // Messages: ~$0.005 / msg (WhatsApp Cloud API / Twilio)
    // AI Tokens: ~$0.000002 / token (gpt-4o-mini / gemini-1.5-flash)
    const costIncrement = (voiceMinutes * 0.02) + (messages * 0.005) + (aiTokens * 0.000002);

    db.run(`
      INSERT INTO usage_records (id, tenant_id, billing_month, voice_minutes, messages_count, ai_tokens, estimated_cost, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, billing_month) DO UPDATE SET
        voice_minutes = voice_minutes + excluded.voice_minutes,
        messages_count = messages_count + excluded.messages_count,
        ai_tokens = ai_tokens + excluded.ai_tokens,
        estimated_cost = estimated_cost + excluded.estimated_cost,
        updated_at = CURRENT_TIMESTAMP
    `, [id, tenantId, month, voiceMinutes, messages, aiTokens, costIncrement]);
  }

  /**
   * Check usage against plan limits for a tenant
   */
  getUsageSummary(tenantId) {
    const month = this.getCurrentMonth();
    const tenant = db.get('SELECT plan_id, subscription_status FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) return null;

    const plan = db.get('SELECT * FROM plans WHERE id = ?', [tenant.plan_id]) || {
      id: 'plan_growth',
      name: 'Growth',
      price_monthly: 399,
      voice_minutes_included: 1000,
      messages_included: 3500,
      extra_minute_rate: 0.20
    };

    let usage = db.get('SELECT * FROM usage_records WHERE tenant_id = ? AND billing_month = ?', [tenantId, month]);
    if (!usage) {
      usage = {
        voice_minutes: 0,
        messages_count: 0,
        ai_tokens: 0,
        estimated_cost: 0.0
      };
    }

    const minutesPercent = plan.voice_minutes_included > 0
      ? Math.round((usage.voice_minutes / plan.voice_minutes_included) * 100)
      : 0;

    const messagesPercent = plan.messages_included > 0
      ? Math.round((usage.messages_count / plan.messages_included) * 100)
      : 0;

    const maxPercent = Math.max(minutesPercent, messagesPercent);

    let status = 'normal';
    let warningMessage = null;

    if (maxPercent >= 100) {
      status = 'exceeded_100';
      warningMessage = `You have reached 100% of your plan allowance. Additional usage is billed at $${plan.extra_minute_rate.toFixed(2)}/min.`;
    } else if (maxPercent >= 80) {
      status = 'warning_80';
      warningMessage = `You have used ${maxPercent}% of your monthly allowance. Consider upgrading to the next tier to avoid overage rates.`;
    }

    return {
      billingMonth: month,
      plan,
      usage: {
        voiceMinutesUsed: usage.voice_minutes,
        voiceMinutesLimit: plan.voice_minutes_included,
        messagesUsed: usage.messages_count,
        messagesLimit: plan.messages_included,
        aiTokensUsed: usage.ai_tokens,
        estimatedCost: usage.estimated_cost,
        minutesPercent,
        messagesPercent
      },
      warning: status !== 'normal' ? { status, message: warningMessage, percent: maxPercent } : null
    };
  }
}

export const usageService = new UsageService();
export default usageService;
