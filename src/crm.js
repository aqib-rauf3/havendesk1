/**
 * Unified In-Memory CRM and Cross-Channel Caller Store
 * Tracks leads across Phone, WhatsApp, and Website by caller phone number or session.
 */
class CRMStore {
  constructor() {
    this.leads = new Map();
    this.appointments = [];
    this.activityLog = [];
    this._seedDemoData();
  }

  _seedDemoData() {
    // Seed initial realistic activity
    this.logActivity({
      type: "SYSTEM_INIT",
      channel: "SYSTEM",
      summary: "AI Receptionist Engine initialized with modular niche profiles",
      timestamp: new Date().toISOString()
    });
  }

  normalizePhone(phone) {
    if (!phone) return "anonymous-web";
    const cleaned = String(phone).replace(/[^\d+]/g, "");
    return cleaned.startsWith("+") ? cleaned : `+1${cleaned.replace(/^1/, "")}`;
  }

  getOrCreateLead(phone, initialData = {}) {
    const key = this.normalizePhone(phone);
    if (!this.leads.has(key)) {
      this.leads.set(key, {
        phone: key,
        name: initialData.name || "Caller",
        address: initialData.address || "",
        niche: initialData.niche || "roofing",
        triageStatus: "STANDARD",
        notes: [],
        media: [],
        history: [],
        appointments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    const lead = this.leads.get(key);
    if (initialData.name && lead.name === "Caller") lead.name = initialData.name;
    if (initialData.address && !lead.address) lead.address = initialData.address;
    if (initialData.niche) lead.niche = initialData.niche;
    return lead;
  }

  addInteraction(phone, channel, role, text, metadata = {}) {
    const lead = this.getOrCreateLead(phone, metadata);
    const entry = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      channel, // 'VOICE', 'WHATSAPP', 'WEB'
      role,    // 'user', 'assistant', 'system'
      text,
      metadata,
      timestamp: new Date().toISOString()
    };
    lead.history.push(entry);
    lead.updatedAt = new Date().toISOString();

    this.logActivity({
      type: "MESSAGE",
      channel,
      phone: lead.phone,
      name: lead.name,
      summary: `${role.toUpperCase()}: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`,
      timestamp: new Date().toISOString()
    });

    return entry;
  }

  attachMedia(phone, mediaObj) {
    const lead = this.getOrCreateLead(phone);
    lead.media.push({
      ...mediaObj,
      timestamp: new Date().toISOString()
    });
    lead.updatedAt = new Date().toISOString();

    this.logActivity({
      type: "MEDIA_UPLOAD",
      channel: mediaObj.channel || "WHATSAPP",
      phone: lead.phone,
      name: lead.name,
      summary: `Received ${mediaObj.type || 'photo'}: ${mediaObj.description || 'Customer attachment'}`,
      timestamp: new Date().toISOString()
    });
  }

  updateTriage(phone, triageStatus, reason) {
    const lead = this.getOrCreateLead(phone);
    lead.triageStatus = triageStatus;
    lead.notes.push({
      type: "TRIAGE_CHANGE",
      status: triageStatus,
      reason,
      timestamp: new Date().toISOString()
    });
    lead.updatedAt = new Date().toISOString();

    this.logActivity({
      type: "TRIAGE_ALERT",
      channel: "ORCHESTRATOR",
      phone: lead.phone,
      name: lead.name,
      summary: `Triage updated to [${triageStatus}] — ${reason}`,
      priority: triageStatus === "HIGH_EMERGENCY" ? "HIGH" : "NORMAL",
      timestamp: new Date().toISOString()
    });
  }

  addAppointment(appointmentData) {
    const apt = {
      id: `apt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: "CONFIRMED",
      createdAt: new Date().toISOString(),
      ...appointmentData
    };
    this.appointments.unshift(apt);

    const lead = this.getOrCreateLead(apt.phone, { name: apt.customerName });
    lead.appointments.push(apt);

    this.logActivity({
      type: "APPOINTMENT_BOOKED",
      channel: apt.channel || "VOICE",
      phone: apt.phone,
      name: apt.customerName,
      summary: `Booked: ${apt.service} for ${apt.timeSlot}`,
      priority: "HIGH",
      timestamp: new Date().toISOString()
    });

    return apt;
  }

  logActivity(activity) {
    this.activityLog.unshift({
      id: `act_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ...activity
    });
    if (this.activityLog.length > 100) this.activityLog.pop();
  }

  getAllLeads() {
    return Array.from(this.leads.values()).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }

  getAllAppointments() {
    return this.appointments;
  }

  getActivityFeed() {
    return this.activityLog;
  }
}

export const crm = new CRMStore();
