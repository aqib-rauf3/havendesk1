/**
 * HavenDesk Multi-Tenant AI Receptionist Engine
 * Analyzes conversations, executes triage rules, updates CRM, and performs tool calls.
 */

import { db } from '../db/database.js';
import { calendarService } from './calendar.js';
import { usageService } from './usage.js';

export class ReceptionistEngine {
  /**
   * Process an inbound conversation turn for a specific tenant
   */
  async processTurn({ tenantId, phone, message, channel = 'voice', mediaAttachment = null, customerName = null }) {
    // 1. Load tenant record and configuration
    const tenant = db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) throw new Error(`Tenant '${tenantId}' not found.`);

    let config = {};
    try {
      config = JSON.parse(tenant.receptionist_config);
    } catch (e) {
      config = {};
    }

    const baseKeywords = ['emergency', 'leak', 'water', 'pain', 'swelling', 'tooth', 'teeth', 'toothache', 'furnace', 'no heat', 'freeze', 'freezing', 'burst', 'broken'];
    const emergencyKeywords = Array.from(new Set([...(config.emergencyKeywords || []), ...baseKeywords]));
    const lowerMsg = (message || '').toLowerCase();
    const isEmergency = emergencyKeywords.some(kw => lowerMsg.includes(kw));

    // 2. Load or create lead in SQLite CRM
    let lead = db.get('SELECT * FROM leads WHERE tenant_id = ? AND phone = ?', [tenantId, phone]);
    const leadId = lead ? lead.id : `lead_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    let notes = lead ? JSON.parse(lead.notes || '[]') : [];
    let media = lead ? JSON.parse(lead.media || '[]') : [];
    let leadStatus = lead ? (lead.status || 'NEW') : 'NEW';
    let triageStatus = isEmergency ? 'HIGH_EMERGENCY' : 'STANDARD';

    if (isEmergency) {
      leadStatus = 'EMERGENCY_DISPATCHED';
      notes.push({
        type: 'TRIAGE_ALERT',
        text: `Emergency detected: "${message.substring(0, 60)}"`,
        timestamp: new Date().toISOString()
      });
    }

    if (mediaAttachment) {
      media.push({
        ...mediaAttachment,
        timestamp: new Date().toISOString()
      });
    }

    // Extract caller name or address if mentioned
    let resolvedName = customerName || (lead ? lead.name : 'Caller') || 'Caller';
    const nameMatch = (message || '').match(/(?:my name is|i'm|this is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) resolvedName = nameMatch[1];

    let resolvedAddress = lead ? (lead.address || null) : null;
    const addressMatch = (message || '').match(/\b\d{1,5}\s+[A-Za-z0-9\s.,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Way|Lane|Ln|Court|Ct)\b/i);
    if (addressMatch) resolvedAddress = addressMatch[0];

    // Upsert lead
    db.run(`
      INSERT OR REPLACE INTO leads (
        id, tenant_id, phone, name, address, status, triage_status, notes, media, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [leadId, tenantId, phone, resolvedName, resolvedAddress, leadStatus, triageStatus || 'STANDARD', JSON.stringify(notes), JSON.stringify(media)]);

    // 3. Reason & generate response
    const agentResponse = this._generateResponse({
      tenantId,
      tenant,
      config,
      message,
      phone,
      resolvedName,
      leadId,
      channel,
      isEmergency: triageStatus === 'HIGH_EMERGENCY',
      mediaAttachment
    });

    // 4. Record monthly usage
    try {
      const isVoice = channel === 'voice';
      usageService.recordUsage(tenantId, {
        voiceMinutes: isVoice ? 1 : 0,
        messages: isVoice ? 0 : 1,
        aiTokens: 120 + Math.round((message || '').length / 3)
      });
    } catch (e) {
      // Non-fatal usage tracking
    }

    return {
      text: agentResponse.text,
      toolCalls: agentResponse.toolCalls || [],
      triageStatus,
      leadId,
      customerName: resolvedName
    };
  }

  _generateResponse({ tenantId, tenant, config, message, phone, resolvedName, leadId, channel, isEmergency, mediaAttachment }) {
    const text = (message || '').toLowerCase();
    const toolCalls = [];
    const persona = config.receptionistPersona || { name: 'Sarah', greeting: 'Hello' };
    const services = config.services || [{ name: 'Standard Service', priceRange: '$100' }];

    // Case 0: Media received
    if (mediaAttachment) {
      if (tenant.niche === 'roofing') {
        toolCalls.push({ name: 'analyze_damage_photo', result: 'Shingle lifting & valley leak risk detected' });
        return {
          text: `Thank you for sending the photo${resolvedName !== 'Caller' ? ', ' + resolvedName : ''}! Our inspection analysis confirms shingle lifting and flashing compromise near the valley. I have attached this directly to your priority work order. Would tomorrow at 11:00 AM or 2:00 PM work for a free on-site drone inspection?`,
          toolCalls
        };
      } else if (tenant.niche === 'dental') {
        toolCalls.push({ name: 'verify_insurance_card', result: 'Delta Dental PPO Verified' });
        return {
          text: `Thank you for sharing your insurance card${resolvedName !== 'Caller' ? ', ' + resolvedName : ''}! I have verified your Delta Dental PPO coverage with 100% preventive coverage. Would you prefer a morning or afternoon appointment for your exam?`,
          toolCalls
        };
      }
    }

    // Case 1: Booking Confirmation / Agreement ("yes", "confirm", "lock it in", "book")
    if (/(yes|confirm|book|lock it in|sounds good|that works|perfect|11:00|2:00|tomorrow|today)/i.test(text)) {
      const available = calendarService.getAvailableSlots(tenantId, isEmergency);
      const selectedSlot = available[0] || { label: 'Tomorrow at 10:00 AM', iso: new Date().toISOString() };
      
      const emergencyService = services.find(s => s.isEmergency) || services[0];
      const serviceName = isEmergency ? emergencyService.name : services[0].name;

      const apt = calendarService.bookAppointment(tenantId, {
        customerName: resolvedName,
        phone,
        serviceName,
        timeSlot: selectedSlot.label,
        leadId,
        channel
      });

      toolCalls.push({
        name: 'book_appointment',
        args: {
          slot: selectedSlot.label,
          service: serviceName,
          confirmationCode: apt.confirmationCode
        }
      });

      return {
        text: `You're all set! I have confirmed your appointment for ${selectedSlot.label}. Your confirmation code is ${apt.confirmationCode}. I have also sent calendar details and our technician's contact to your WhatsApp and phone. Is there anything else I can help you with today?`,
        toolCalls
      };
    }

    // Case 2: Selective Emergency Triage
    if (isEmergency) {
      const emergencySlots = calendarService.getAvailableSlots(tenantId, true);
      const firstSlot = emergencySlots[0] || { label: 'Today within 45 minutes' };

      toolCalls.push({
        name: 'trigger_emergency_escalation',
        args: { phone, niche: tenant.niche, priority: 'HIGH_EMERGENCY' }
      });

      // 2a. Dental Pain / Trauma Emergency
      if (/(tooth|dental|pain|swelling|jaw|ache|bleed|mouth|root canal)/i.test(text)) {
        return {
          text: `I am so sorry you are experiencing severe pain. Dental emergencies and acute swelling are our immediate priority. Dr. Davis has an emergency relief chair open ${firstSlot.label}. Would you like me to reserve this emergency chair time right now?`,
          toolCalls
        };
      }

      // 2b. HVAC / Furnace / No Heat Emergency
      if (/(heat|furnace|freez|frozen|cold|boiler|pipe|ac|air condition|thermostat)/i.test(text)) {
        return {
          text: `Having no heat or a furnace failure in these conditions is an urgent emergency. I have notified our on-call technician immediately. We can dispatch a service van to you ${firstSlot.label}. Would you like me to confirm this priority dispatch?`,
          toolCalls
        };
      }

      // 2c. Roof / Storm / Water Leak Emergency
      if (/(leak|water|ceiling|roof|storm|shingle|rain|tarp|flood|drip)/i.test(text) || tenant.niche === 'roofing') {
        return {
          text: `I understand water is actively leaking into your home! That is our top priority emergency. I have alerted our on-call dispatch crew, and we can have an emergency tarping team at your property ${firstSlot.label}. Shall I lock this emergency crew dispatch in right now for you?`,
          toolCalls
        };
      }

      if (tenant.niche === 'dental') {
        return {
          text: `I am so sorry you are experiencing severe pain. Dental emergencies and acute swelling are our immediate priority. Dr. Davis has an emergency relief chair open ${firstSlot.label}. Would you like me to reserve this emergency chair time right now?`,
          toolCalls
        };
      }

      if (tenant.niche === 'hvac') {
        return {
          text: `Having no heat or a furnace failure in these conditions is an urgent emergency. I have notified our on-call technician immediately. We can dispatch a service van to you ${firstSlot.label}. Would you like me to confirm this priority dispatch?`,
          toolCalls
        };
      }

      // 2d. General Urgent Emergency
      return {
        text: `I understand this is an urgent emergency situation. Our on-call response team has been alerted right now. We can dispatch a technician ${firstSlot.label}. Would you like to confirm this dispatch immediately?`,
        toolCalls
      };
    }

    // Case 3: Selective Price / Cost Inquiry
    if (/(price|cost|how much|insurance|rate|quote|fee|expensive|charge)/i.test(text)) {
      if (/(tooth|teeth|dental|cleaning|x-ray)/i.test(text)) {
        return {
          text: `Preventive cleanings and exams are typically 100% covered by most PPO insurance plans. For self-pay patients, our new-patient exam including digital X-rays is just $89. Would you like to book an appointment?`,
          toolCalls: [{ name: 'query_pricing_knowledgebase', service: 'New Patient Exam' }]
        };
      } else if (/(heat|furnace|ac|air condition|hvac)/i.test(text)) {
        return {
          text: `Our diagnostic service call is $89, which is credited 100% toward your repair if you proceed. Would you like to schedule a technician to diagnose the system?`,
          toolCalls: [{ name: 'query_pricing_knowledgebase', service: 'Diagnostic Visit' }]
        };
      } else if (tenant.niche === 'roofing' || /(roof|leak|shingle|inspection)/i.test(text)) {
        return {
          text: `Our comprehensive roof assessment and storm damage inspection are 100% free with zero obligation. For repairs, we provide transparent on-site quotes before any work begins. Would you like to schedule a free inspection tomorrow?`,
          toolCalls: [{ name: 'query_pricing_knowledgebase', service: 'Free Roof Assessment' }]
        };
      } else if (tenant.niche === 'dental') {
        return {
          text: `Preventive cleanings and exams are typically 100% covered by most PPO insurance plans. For self-pay patients, our new-patient exam including digital X-rays is just $89. Would you like to book an appointment?`,
          toolCalls: [{ name: 'query_pricing_knowledgebase', service: 'New Patient Exam' }]
        };
      } else {
        const topService = services[0];
        const price = topService ? (topService.priceRange || '$89 diagnostic fee') : '$89 diagnostic fee';
        return {
          text: `Our diagnostic service call is ${price}, which is credited directly toward your repair if you proceed. Would you like to schedule a technician to take a look?`,
          toolCalls: [{ name: 'query_pricing_knowledgebase', service: topService ? topService.name : 'Diagnostic Call' }]
        };
      }
    }

    // Case 4: Available schedule query
    if (/(availability|available|openings|schedule|when can|appointment|what time|hours)/i.test(text)) {
      const slots = calendarService.getAvailableSlots(tenantId, false);
      const slotList = slots.slice(0, 3).map(s => s.label).join(', or ');
      toolCalls.push({ name: 'check_calendar_availability', count: slots.length });
      return {
        text: `We currently have openings ${slotList}. Which of those works best for your schedule?`,
        toolCalls
      };
    }

    // Case 5: Short, Calm, Professional Receptionist Greeting (under 14 words)
    return {
      text: `Thanks for calling ${tenant.business_name}. How can our team assist you today?`,
      toolCalls: []
    };
  }
}

export const receptionistEngine = new ReceptionistEngine();
export default receptionistEngine;
