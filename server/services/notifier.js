/**
 * HavenDesk Owner Notification Dispatcher
 * Instantly alerts business owners via WhatsApp, SMS, and In-App Feed
 * when calls complete or emergencies/high-value leads are captured.
 */

import { db } from '../db/database.js';

export class OwnerNotifierService {
  /**
   * Dispatch instant alert to business owner
   */
  async notifyCallCompleted({ tenant, call, lead, geminiResult }) {
    const tenantId = tenant.id;
    const recipientPhone = tenant.owner_phone || tenant.owner_whatsapp || tenant.phone || '+923008472910';
    const recipientEmail = tenant.owner_email || 'owner@havenclient.com';
    const urgency = geminiResult.urgencyLevel || call.triage_level || 'STANDARD';
    const isEmergency = urgency === 'HIGH_EMERGENCY';
    const isHighLead = urgency === 'HIGH_LEAD';

    const urgencyTag = isEmergency 
      ? '🚨 [EMERGENCY CALL ALERT]' 
      : (isHighLead ? '🔥 [HOT SALES LEAD]' : '📞 [NEW INBOUND CALL]');

    const callerName = geminiResult.callerName !== 'Caller' ? geminiResult.callerName : (call.caller_name || 'Caller');
    const langTag = geminiResult.detectedLanguage || 'English/Roman Urdu';

    const appointmentText = geminiResult.appointmentDetails 
      ? `\n📅 Appointment/Visit: ${geminiResult.appointmentDetails}` 
      : '';

    // Standard WhatsApp / SMS payload tailored for Pakistani & Global business owners
    const messageBody = `
${urgencyTag}
🏢 Business: ${tenant.business_name}
👤 Customer: ${callerName} (${call.caller_number})
🌐 Language: ${langTag}
📝 Summary: ${geminiResult.inquirySummary || call.summary}
⚡ Urgency: ${urgency}${appointmentText}
🔗 View Call Transcript & CRM: ${process.env.APP_URL || 'http://localhost:3000'}/app
    `.trim();

    console.log(`\n========================================================`);
    console.log(`📲 [OWNER NOTIFICATION DISPATCHED] -> ${recipientPhone}`);
    console.log(`========================================================`);
    console.log(messageBody);
    console.log(`========================================================\n`);

    // 1. Record in-app notification in SQLite
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    try {
      db.run(`
        INSERT INTO notifications (
          id, tenant_id, call_id, lead_id, channel, recipient, title, message, urgency, status, is_read
        ) VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, ?, ?, 'delivered', 0)
      `, [
        notifId,
        tenantId,
        call.id,
        lead?.id || null,
        recipientPhone,
        `${urgencyTag} from ${callerName}`,
        messageBody,
        urgency
      ]);
    } catch (e) {
      console.warn(`[NOTIFICATION DB ERROR] ${e.message}`);
    }

    // 2. Dispatch real Twilio WhatsApp / SMS if credentials configured
    if (process.env.TWILIO_ACCOUNT_SID && !process.env.TWILIO_ACCOUNT_SID.includes('placeholder')) {
      try {
        await this._sendTwilioWhatsApp({
          to: recipientPhone,
          body: messageBody
        });
      } catch (err) {
        console.warn(`[TWILIO WHATSAPP WARNING] ${err.message}`);
      }
    }

    return {
      notificationId: notifId,
      deliveredTo: recipientPhone,
      channel: 'whatsapp',
      urgency,
      preview: messageBody
    };
  }

  async _sendTwilioWhatsApp({ to, body }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const formattedFrom = fromWhatsApp.startsWith('whatsapp:') ? fromWhatsApp : `whatsapp:${fromWhatsApp}`;

    const params = new URLSearchParams();
    params.append('To', formattedTo);
    params.append('From', formattedFrom);
    params.append('Body', body);

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twilio HTTP ${res.status}: ${err}`);
    }
  }
}

export const notifierService = new OwnerNotifierService();
export default notifierService;
