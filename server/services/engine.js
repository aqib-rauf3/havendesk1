/**
 * HavenDesk Multi-Tenant AI Receptionist Engine
 * Powered by Google Gemini Multilingual AI & Dynamic Telephony Routing.
 * Fully supports Pakistani businesses, UK, US, and any custom vertical.
 */

import { db } from '../db/database.js';
import { geminiService } from './gemini.js';
import { calendarService } from './calendar.js';
import { usageService } from './usage.js';
import { notifierService } from './notifier.js';

export class ReceptionistEngine {
  /**
   * Process an inbound conversation turn for a specific tenant
   */
  async processTurn({ 
    tenantId, 
    phone, 
    message, 
    channel = 'voice', 
    mediaAttachment = null, 
    customerName = null,
    dialogueHistory = []
  }) {
    // 1. Load tenant record
    const tenant = db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) throw new Error(`Tenant '${tenantId}' not found.`);

    // 2. Run Google Gemini Multilingual Intelligence Engine
    const geminiResult = await geminiService.generateTurn({
      tenant,
      message,
      callerPhone: phone,
      dialogueHistory
    });

    const resolvedName = customerName || (geminiResult.callerName !== 'Caller' ? geminiResult.callerName : 'Caller');
    const urgencyLevel = geminiResult.urgencyLevel || 'STANDARD';
    const isEmergency = urgencyLevel === 'HIGH_EMERGENCY';

    // 3. Load or create lead in SQLite CRM
    let lead = db.get('SELECT * FROM leads WHERE tenant_id = ? AND phone = ?', [tenantId, phone]);
    const leadId = lead ? lead.id : `lead_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    let notes = lead ? JSON.parse(lead.notes || '[]') : [];
    let media = lead ? JSON.parse(lead.media || '[]') : [];
    let leadStatus = lead ? (lead.status || 'NEW') : 'NEW';

    if (isEmergency) {
      leadStatus = 'EMERGENCY_DISPATCHED';
    } else if (geminiResult.appointmentRequested) {
      leadStatus = 'BOOKED';
    } else if (urgencyLevel === 'HIGH_LEAD') {
      leadStatus = 'QUALIFIED';
    }

    notes.push({
      type: isEmergency ? 'EMERGENCY_ALERT' : 'CALL_TURN',
      channel,
      language: geminiResult.detectedLanguage,
      callerQuery: message,
      summary: geminiResult.inquirySummary,
      timestamp: new Date().toISOString()
    });

    if (mediaAttachment) {
      media.push({
        ...mediaAttachment,
        timestamp: new Date().toISOString()
      });
    }

    // Upsert lead
    db.run(`
      INSERT OR REPLACE INTO leads (
        id, tenant_id, phone, name, address, status, triage_status, notes, media, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      leadId, 
      tenantId, 
      phone, 
      resolvedName, 
      geminiResult.callerAddress || (lead ? lead.address : null), 
      leadStatus, 
      urgencyLevel, 
      JSON.stringify(notes), 
      JSON.stringify(media)
    ]);

    // 4. Optional Tool Calling & Appointment Booking
    const toolCalls = [];
    if (geminiResult.appointmentRequested) {
      try {
        const apt = calendarService.bookAppointment(tenantId, {
          customerName: resolvedName,
          phone,
          serviceName: 'Technical Assessment / Survey',
          timeSlot: geminiResult.appointmentDetails || 'Tomorrow at 3:00 PM',
          leadId,
          channel
        });
        toolCalls.push({ name: 'book_appointment', result: apt });
      } catch (e) {
        console.warn(`[APPOINTMENT ERROR] ${e.message}`);
      }
    }

    // 5. Record Usage Telemetry
    try {
      const isVoice = channel === 'voice';
      usageService.recordUsage(tenantId, {
        voiceMinutes: isVoice ? 1 : 0,
        messages: isVoice ? 0 : 1,
        aiTokens: 150 + Math.round((message || '').length / 2)
      });
    } catch (e) {
      // Non-fatal usage tracking
    }

    // 6. Return response
    return {
      text: geminiResult.replyText,
      detectedLanguage: geminiResult.detectedLanguage,
      inquirySummary: geminiResult.inquirySummary,
      urgencyLevel,
      toolCalls,
      leadId,
      customerName: resolvedName,
      geminiResult
    };
  }
}

export const receptionistEngine = new ReceptionistEngine();
export default receptionistEngine;
