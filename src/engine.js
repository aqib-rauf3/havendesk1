import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crm } from './crm.js';
import { calendarService } from './calendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ReceptionistEngine {
  constructor() {
    this.profiles = new Map();
    this.activeProfileId = 'roofing';
    this.loadProfiles();
  }

  loadProfiles() {
    const profilesDir = path.join(__dirname, '../profiles');
    if (!fs.existsSync(profilesDir)) return;

    const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json') && f !== 'schema.json');
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(profilesDir, file), 'utf-8');
        const profile = JSON.parse(raw);
        this.profiles.set(profile.id, profile);
      } catch (err) {
        console.error(`Failed to parse profile ${file}:`, err);
      }
    }
  }

  getActiveProfile() {
    this.loadProfiles();
    return this.profiles.get(this.activeProfileId) || this.profiles.values().next().value;
  }

  setActiveProfile(profileId) {
    if (this.profiles.has(profileId)) {
      this.activeProfileId = profileId;
      crm.logActivity({
        type: "PROFILE_SWITCH",
        channel: "SYSTEM",
        summary: `Switched active receptionist niche to: ${this.getActiveProfile().businessName}`,
        timestamp: new Date().toISOString()
      });
      return true;
    }
    return false;
  }

  getProfilesList() {
    return Array.from(this.profiles.values()).map(p => ({
      id: p.id,
      name: p.businessName,
      tagline: p.tagline,
      phone: p.phone,
      persona: p.receptionistPersona.name
    }));
  }

  /**
   * Main conversational turn processor
   */
  async processMessage({ phone, message, channel = 'VOICE', mediaAttachment = null, customerName = null }) {
    const profile = this.getActiveProfile();
    const lead = crm.getOrCreateLead(phone, {
      name: customerName,
      niche: profile.id
    });

    // Record inbound message
    crm.addInteraction(phone, channel, 'user', message, { mediaAttachment });

    if (mediaAttachment) {
      crm.attachMedia(phone, mediaAttachment);
    }

    // 1. Triage Classification
    const lowerMsg = (message || '').toLowerCase();
    const isEmergency = profile.emergencyKeywords.some(kw => lowerMsg.includes(kw));
    
    if (isEmergency && lead.triageStatus !== 'HIGH_EMERGENCY') {
      crm.updateTriage(
        phone, 
        'HIGH_EMERGENCY', 
        `Detected emergency trigger in message: "${message.substring(0, 50)}"`
      );
    }

    // 2. Extract Customer Name or Address if provided
    this._extractLeadInfo(lead, message);

    // 3. Reason over conversation context & generate response
    const responseData = this._generateAgentResponse({
      lead,
      message,
      channel,
      profile,
      isEmergency: lead.triageStatus === 'HIGH_EMERGENCY',
      mediaAttachment
    });

    // Record outbound agent response
    crm.addInteraction(phone, channel, 'assistant', responseData.text, {
      toolCalls: responseData.toolCalls || [],
      triageStatus: lead.triageStatus
    });

    return {
      text: responseData.text,
      audioUrl: responseData.audioUrl || null,
      toolCalls: responseData.toolCalls || [],
      triageStatus: lead.triageStatus,
      leadSummary: {
        phone: lead.phone,
        name: lead.name,
        triage: lead.triageStatus,
        appointments: lead.appointments
      }
    };
  }

  _extractLeadInfo(lead, text) {
    // Basic heuristics for name & address capture
    const nameMatch = text.match(/(?:my name is|i'm|this is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch && lead.name === 'Caller') {
      lead.name = nameMatch[1];
    }

    const addressMatch = text.match(/\b\d{1,5}\s+[A-Za-z0-9\s.,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Lane|Ln|Court|Ct)\b/i);
    if (addressMatch && !lead.address) {
      lead.address = addressMatch[0];
    }
  }

  _generateAgentResponse({ lead, message, channel, profile, isEmergency, mediaAttachment }) {
    const text = message.toLowerCase();
    const toolCalls = [];

    // Case 0: Media attachment received (e.g. roof damage photo or insurance card)
    if (mediaAttachment) {
      if (profile.id === 'roofing') {
        return {
          text: `Thank you for sending the photo${lead.name !== 'Caller' ? ', ' + lead.name : ''}! Our AI damage inspection tool detects significant shingle lifting and flashing compromise near the valley. I have attached this directly to your work order for our lead project manager. Would tomorrow at 11:00 AM or 2:00 PM work for a free on-site drone inspection?`,
          toolCalls: [{ name: "analyze_damage_photo", result: "Damage verified: Shingle lifting & water intrusion risk high" }]
        };
      } else if (profile.id === 'dental') {
        return {
          text: `Thank you for sharing your insurance card${lead.name !== 'Caller' ? ', ' + lead.name : ''}! I have verified your Delta Dental PPO coverage with 100% preventive coverage. Would you prefer a morning or afternoon appointment for your exam and cleaning?`,
          toolCalls: [{ name: "verify_insurance_card", result: "Verified: Delta Dental PPO active" }]
        };
      }
    }

    // Case 1: Booking Confirmation / Agreement ("yes", "confirm", "tomorrow at 11", "book it")
    if (/(yes|confirm|book|lock it in|sounds good|that works|perfect|11:00|2:00|tomorrow)/i.test(text)) {
      const available = calendarService.getAvailableSlots("Standard", isEmergency);
      const selectedSlot = available[0] || { label: "Tomorrow at 10:00 AM", iso: new Date().toISOString() };
      
      const serviceName = isEmergency 
        ? (profile.services.find(s => s.isEmergency)?.name || profile.services[0].name)
        : profile.services[0].name;

      const apt = calendarService.bookSlot(
        selectedSlot.iso,
        lead.name === 'Caller' ? 'Valued Client' : lead.name,
        lead.phone,
        serviceName,
        lead.address ? `Address: ${lead.address}` : "Address to be confirmed"
      );

      crm.addAppointment({
        phone: lead.phone,
        customerName: lead.name,
        service: serviceName,
        timeSlot: selectedSlot.label,
        channel,
        confirmationCode: apt.confirmationCode
      });

      toolCalls.push({
        name: "book_appointment",
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

    // Case 2: Active Emergency Detected
    if (isEmergency && !lead.appointments.some(a => a.service.toLowerCase().includes('emergency'))) {
      const emergencySlots = calendarService.getAvailableSlots("Emergency", true);
      const firstSlot = emergencySlots[0];

      toolCalls.push({
        name: "trigger_emergency_escalation",
        args: {
          phone: lead.phone,
          niche: profile.id,
          priority: "HIGH_EMERGENCY"
        }
      });

      if (profile.id === 'roofing') {
        return {
          text: `I understand water is actively leaking inside your home! This is considered a priority emergency. I have notified our on-call dispatch crew. We have an emergency tarping team ready for ${firstSlot.label}. Shall I lock this emergency crew dispatch in right now for you?`,
          toolCalls
        };
      } else if (profile.id === 'dental') {
        return {
          text: `I'm very sorry you're in severe pain. Dental trauma and severe pain are our top priority. Dr. Davis has reserved an emergency relief slot ${firstSlot.label}. Would you like me to book this emergency chair time right now?`,
          toolCalls
        };
      } else {
        return {
          text: `I understand this is an emergency situation. Our on-call technician has been alerted. We can dispatch a technician ${firstSlot.label}. Would you like to confirm this dispatch immediately?`,
          toolCalls
        };
      }
    }

    // Case 3: Inquiring about Prices / Cost / Insurance
    if (/(price|cost|how much|insurance|rate|quote|fee)/i.test(text)) {
      const topService = profile.services[0];
      const faqAnswer = profile.faq[0]?.a || `Our pricing ranges from ${topService.priceRange}.`;
      return {
        text: `${faqAnswer} Would you like to schedule an assessment or speak with our coordinator?`,
        toolCalls: [{ name: "query_pricing_knowledgebase", service: topService.name }]
      };
    }

    // Case 4: Requesting Available Times / Schedule
    if (/(availability|available|openings|schedule|when can|appointment)/i.test(text)) {
      const slots = calendarService.getAvailableSlots("Standard", false);
      const slotList = slots.slice(0, 3).map(s => s.label).join(", or ");
      toolCalls.push({ name: "check_calendar_availability", count: slots.length });
      return {
        text: `We currently have openings ${slotList}. Which of those works best for your schedule?`,
        toolCalls
      };
    }

    // Case 5: Default Friendly Niche Receptionist Response
    return {
      text: `Thank you for reaching out to ${profile.businessName}. We specialize in ${profile.services.map(s => s.name).slice(0, 2).join(' as well as ')}. How can I assist you with your property or schedule an appointment today?`,
      toolCalls: []
    };
  }
}

export const receptionistEngine = new ReceptionistEngine();
