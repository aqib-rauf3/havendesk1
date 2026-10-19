import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { receptionistEngine } from './engine.js';
import { crm } from './crm.js';
import { calendarService } from './calendar.js';
import { voiceChannel } from './channels/voice.js';
import { whatsappChannel } from './channels/whatsapp.js';
import { widgetChannel } from './channels/widget.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// -------------------------------------------------------------
// 1. Niche & Profile Management Endpoints
// -------------------------------------------------------------
app.get('/api/niches', (req, res) => {
  res.json({
    active: receptionistEngine.getActiveProfile(),
    available: receptionistEngine.getProfilesList()
  });
});

app.post('/api/niches/switch', (req, res) => {
  const { profileId } = req.body;
  const success = receptionistEngine.setActiveProfile(profileId);
  if (success) {
    res.json({ success: true, active: receptionistEngine.getActiveProfile() });
  } else {
    res.status(404).json({ error: `Niche profile '${profileId}' not found.` });
  }
});

// -------------------------------------------------------------
// 2. Voice Channel Endpoints (Retell / Vapi / Twilio / Simulator)
// -------------------------------------------------------------
app.post('/api/voice/simulate', async (req, res) => {
  try {
    const { callerNumber, speechInput, customerName } = req.body;
    const result = await voiceChannel.handleVoiceCall({ callerNumber, speechInput, customerName });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/vapi', async (req, res) => {
  try {
    const result = await voiceChannel.handleVapiWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/retell', async (req, res) => {
  try {
    const result = await voiceChannel.handleRetellWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/twilio', async (req, res) => {
  try {
    const twiml = await voiceChannel.handleTwilioVoice(req.body);
    res.type('text/xml').send(twiml);
  } catch (err) {
    res.status(500).send('<Response><Say>An error occurred.</Say></Response>');
  }
});

// -------------------------------------------------------------
// 3. WhatsApp Channel Endpoints (Twilio / Meta / Simulator)
// -------------------------------------------------------------
app.post('/api/whatsapp/simulate', async (req, res) => {
  try {
    const { fromNumber, message, mediaAttachment, customerName } = req.body;
    const result = await whatsappChannel.handleInboundMessage({
      fromNumber,
      message,
      mediaAttachment,
      customerName
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/twilio', async (req, res) => {
  try {
    const xml = await whatsappChannel.handleTwilioWhatsAppWebhook(req.body);
    res.type('text/xml').send(xml);
  } catch (err) {
    res.status(500).send('<Response><Message>Error processing message.</Message></Response>');
  }
});

app.post('/api/whatsapp/meta', async (req, res) => {
  try {
    const result = await whatsappChannel.handleMetaCloudWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. Website Widget Endpoints
// -------------------------------------------------------------
app.get('/api/widget/config', (req, res) => {
  res.json(widgetChannel.getWidgetConfig());
});

app.post('/api/widget/chat', async (req, res) => {
  try {
    const { sessionId, phone, message, customerName } = req.body;
    const result = await widgetChannel.handleChatMessage({ sessionId, phone, message, customerName });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. Calendar & CRM Endpoints
// -------------------------------------------------------------
app.get('/api/calendar/slots', (req, res) => {
  const isEmergency = req.query.emergency === 'true';
  const slots = calendarService.getAvailableSlots(req.query.service || 'Standard', isEmergency);
  res.json({ slots });
});

app.post('/api/calendar/book', (req, res) => {
  const { slotIso, customerName, phone, serviceName, notes } = req.body;
  const apt = calendarService.bookSlot(slotIso, customerName, phone, serviceName, notes);
  crm.addAppointment({
    phone,
    customerName,
    service: serviceName,
    timeSlot: slotIso,
    channel: 'API',
    confirmationCode: apt.confirmationCode
  });
  res.json(apt);
});

app.get('/api/crm/leads', (req, res) => {
  res.json({ leads: crm.getAllLeads() });
});

app.get('/api/crm/appointments', (req, res) => {
  res.json({ appointments: crm.getAllAppointments() });
});

app.get('/api/crm/activity', (req, res) => {
  res.json({ activity: crm.getActivityFeed() });
});

// -------------------------------------------------------------
// 6. Automation Triggers
// -------------------------------------------------------------
app.post('/api/automations/trigger', (req, res) => {
  const { type } = req.body;
  const profile = receptionistEngine.getActiveProfile();
  
  if (type === 'MORNING_BRIEFING') {
    const aptCount = crm.getAllAppointments().length;
    const emergencyCount = crm.getAllLeads().filter(l => l.triageStatus === 'HIGH_EMERGENCY').length;
    
    const summary = `☀️ *Good Morning, ${profile.businessName} Team!*\n\nHere is your daily 8:00 AM briefing:\n• Appointments on schedule: ${aptCount}\n• Urgent emergency triages: ${emergencyCount}\n• System status: 100% active on Phone, WhatsApp & Web.`;
    
    crm.logActivity({
      type: "AUTOMATION_FIRED",
      channel: "SCHEDULED_CRON",
      summary: `Daily 8:00 AM Morning Executive Briefing dispatched to owner`,
      priority: "NORMAL",
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, type, message: summary });
  }

  if (type === 'FOLLOW_UP_REMINDER') {
    const message = `🔔 *Automated Appointment Reminder*: Hi from ${profile.businessName}! We look forward to seeing you tomorrow. Reply 1 to Confirm or 2 to Reschedule.`;
    crm.logActivity({
      type: "AUTOMATION_FIRED",
      channel: "SCHEDULED_CRON",
      summary: `24-Hour Automated WhatsApp Reminder sequence triggered for all booked appointments`,
      priority: "NORMAL",
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, type, message });
  }

  res.status(400).json({ error: "Unknown automation type" });
});

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🤖 Modular AI Receptionist Engine is LIVE on http://localhost:${PORT}`);
  console.log(`📞 Phone (Retell/Vapi/Twilio), 💬 WhatsApp, & 🌐 Web Widget Ready`);
  console.log(`🎯 Active Niche: ${receptionistEngine.getActiveProfile().businessName}`);
  console.log(`================================================================`);
});
