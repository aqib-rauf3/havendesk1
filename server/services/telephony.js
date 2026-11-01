/**
 * HavenDesk Multi-Country Telephony & Dynamic Number Routing Service
 * Handles international phone number normalization, tenant routing,
 * and telecom voice adapters (Twilio, Vapi, SIP) for Pakistan (+92), UK (+44), and US (+1).
 */

import { db } from '../db/database.js';

export class TelephonyService {
  /**
   * Normalize any incoming phone string into clean E.164-like digits
   */
  normalizePhoneNumber(phoneStr) {
    if (!phoneStr) return '';
    const clean = phoneStr.replace(/[^\d+]/g, '');
    // Convert local Pakistani 03... to +923...
    if (clean.startsWith('03') && clean.length === 11) {
      return '+92' + clean.substring(1);
    }
    // Convert local UK 07... or 02... to +44...
    if ((clean.startsWith('07') || clean.startsWith('02')) && clean.length >= 10) {
      return '+44' + clean.substring(1);
    }
    return clean.startsWith('+') ? clean : `+${clean}`;
  }

  /**
   * Dynamically match an inbound call to the correct business tenant
   */
  findTenantByInboundNumber(toNumber) {
    const normalizedTo = this.normalizePhoneNumber(toNumber);

    // 1. Direct match in phone_numbers table
    const mapped = db.get(`
      SELECT t.* FROM phone_numbers p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE p.phone_number = ? AND p.is_active = 1
    `, [normalizedTo]);
    if (mapped) return mapped;

    // 2. Direct match in tenants table (phone or whatsapp)
    const directTenant = db.get(`
      SELECT * FROM tenants 
      WHERE replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
         OR replace(replace(replace(replace(whatsapp, ' ', ''), '-', ''), '(', ''), ')', '') = ?
    `, [normalizedTo, normalizedTo]);
    if (directTenant) return directTenant;

    // 3. Country-Prefix Based Dynamic Routing
    // Pakistan (+92)
    if (normalizedTo.startsWith('+92')) {
      const pkTenant = db.get("SELECT * FROM tenants WHERE country = 'PK' AND subscription_status = 'active' LIMIT 1");
      if (pkTenant) return pkTenant;
    }

    // United Kingdom (+44)
    if (normalizedTo.startsWith('+44')) {
      const ukTenant = db.get("SELECT * FROM tenants WHERE country = 'GB' AND subscription_status = 'active' LIMIT 1");
      if (ukTenant) return ukTenant;
    }

    // United States / Canada (+1)
    if (normalizedTo.startsWith('+1')) {
      const usTenant = db.get("SELECT * FROM tenants WHERE country = 'US' AND subscription_status = 'active' LIMIT 1");
      if (usTenant) return usTenant;
    }

    // 4. Default fallback: first active tenant
    return db.get("SELECT * FROM tenants WHERE subscription_status = 'active' ORDER BY created_at DESC LIMIT 1");
  }

  /**
   * Assign or update a dedicated phone number for a business tenant
   */
  assignNumberToTenant(tenantId, phoneNumber, country = 'PK', provider = 'twilio') {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    
    // Update tenant phone
    db.run("UPDATE tenants SET phone = ?, country = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [normalized, country, tenantId]);

    // Record in phone_numbers map
    db.run(`
      INSERT OR REPLACE INTO phone_numbers (phone_number, tenant_id, country, provider, friendly_label, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [normalized, tenantId, country, provider, `${country} Dedicated Inbound Line`]);

    return {
      tenantId,
      phoneNumber: normalized,
      country,
      provider
    };
  }

  /**
   * Generate localized Twilio Voice XML (TwiML) with native speech recognition & voice tags
   */
  generateVoiceTwiML({ replyText, country = 'PK', actionUrl = '/api/v1/webhooks/voice/twilio' }) {
    let voice = 'Polly.Gul-Neural';
    let lang = 'ur-PK';

    if (country === 'GB') {
      voice = 'Polly.Amy-Neural';
      lang = 'en-GB';
    } else if (country === 'US') {
      voice = 'Polly.Joanna-Neural';
      lang = 'en-US';
    }

    const safeText = this.escapeXml(replyText);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${safeText}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${actionUrl}" method="POST" language="${lang}">
    <Say voice="${voice}" language="${lang}">...</Say>
  </Gather>
</Response>`;
  }

  escapeXml(unsafe) {
    return String(unsafe || '').replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }
}

export const telephonyService = new TelephonyService();
export default telephonyService;
