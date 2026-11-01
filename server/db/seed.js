/**
 * HavenDesk Database Seeder
 * Populates plans, niche templates, super_admin, and realistic multi-country client tenants:
 * - Pakistan: Apex Solar Energy Lahore (+92 42 35780000) & Al-Rehman Clinic Karachi (+92 21 35870000)
 * - USA: Vanguard Roofing & Storm Restoration (+1 800 555-ROOF)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './database.js';
import { hashPassword } from '../utils/crypto.js';
import { BRAND } from '../../shared/brand.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function seedDatabase() {
  console.log('🌱 Seeding HavenDesk database with Pakistani & Global Tenants...');

  // 1. Seed Plans
  for (const plan of BRAND.plans) {
    db.run(`
      INSERT OR REPLACE INTO plans (
        id, name, description, price_monthly, voice_minutes_included, 
        messages_included, extra_minute_rate, stripe_price_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      plan.id, plan.name, plan.description, plan.priceMonthly, 
      plan.voiceMinutes, plan.messages, plan.extraMinuteRate, plan.stripePriceId
    ]);
  }

  // 2. Seed Niche Templates from profiles/ directory
  const profilesDir = path.join(__dirname, '../../profiles');
  const niches = ['solar_pk', 'clinic_pk', 'roofing', 'dental', 'hvac'];
  const profileConfigs = {};

  for (const nicheId of niches) {
    const filePath = path.join(profilesDir, `${nicheId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      profileConfigs[nicheId] = content;

      db.run(`
        INSERT OR REPLACE INTO niche_templates (id, name, tagline, profile_json, version)
        VALUES (?, ?, ?, ?, 1)
      `, [nicheId, parsed.businessName, parsed.tagline, content]);
    }
  }

  // 3. Seed Super Admin User
  const adminPasswordHash = hashPassword('HavenAdmin2026!');
  db.run(`
    INSERT OR REPLACE INTO users (
      id, tenant_id, email, password_hash, name, role, totp_secret, totp_enabled, must_change_password
    ) VALUES (?, NULL, ?, ?, ?, 'super_admin', 'JBSWY3DPEHPK3PXP', 1, 0)
  `, ['usr_admin_01', 'admin@havendesk.com', adminPasswordHash, 'System Administrator']);

  // 4. Seed Support User
  const supportPasswordHash = hashPassword('SupportPass2026!');
  db.run(`
    INSERT OR REPLACE INTO users (
      id, tenant_id, email, password_hash, name, role, totp_secret, totp_enabled
    ) VALUES (?, NULL, ?, ?, ?, 'support', NULL, 0)
  `, ['usr_support_01', 'support@havendesk.com', supportPasswordHash, 'Customer Support Specialist']);

  const clientPasswordHash = hashPassword('ClientPass2026!');

  // =====================================================================
  // 5. PAKISTANI TENANT 1: Apex Solar Energy Lahore (Pakistan, PKR)
  // =====================================================================
  const tntSolarPkId = 'tnt_solar_pk_01';
  db.run(`
    INSERT OR REPLACE INTO tenants (
      id, business_name, niche, country, currency, phone, whatsapp, owner_phone, owner_whatsapp, owner_email, website, plan_id, 
      subscription_status, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, 'solar_pk', 'PK', 'PKR', '+92 42 35780000', '+92 300 8472910', '+92 300 8472910', '+92 300 8472910', 'kamran@apexsolar.pk', 'https://apexsolar.pk', 'plan_pro', 'active', ?, ?, 1)
  `, [
    tntSolarPkId,
    'Apex Solar Energy Lahore',
    'pk_live_apex_solar_lahore_key',
    profileConfigs['solar_pk'] || '{}'
  ]);

  db.run(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, 'kamran@apexsolar.pk', ?, 'Kamran Akram (Managing Director)', 'client_owner')
  `, ['usr_solar_owner', tntSolarPkId, clientPasswordHash]);

  // Seed Dynamic Phone Numbers Map
  db.run(`
    INSERT OR REPLACE INTO phone_numbers (phone_number, tenant_id, country, provider, friendly_label, is_active)
    VALUES ('+924235780000', ?, 'PK', 'local_sip', 'Lahore Landline (UAN)', 1),
           ('+923008472910', ?, 'PK', 'twilio', 'Lahore WhatsApp / Mobile Line', 1)
  `, [tntSolarPkId, tntSolarPkId]);

  // Seed Calls for Apex Solar (Urdu & Roman Urdu)
  db.run(`
    INSERT OR REPLACE INTO calls (
      id, tenant_id, caller_number, caller_name, duration_seconds, status, triage_level, language_detected, summary, transcript, tools_used
    ) VALUES (?, ?, ?, ?, ?, 'completed', 'HIGH_LEAD', 'Roman Urdu', ?, ?, ?)
  `, [
    'call_pk_solar_01', tntSolarPkId, '+92 300 4567890', 'Usman Sheikh (DHA Phase 6)', 84,
    'Customer inquired regarding 10kW On-Grid solar package for residential home in DHA Lahore. Free site survey booked for Tomorrow at 3:00 PM.',
    JSON.stringify([
      { role: 'user', text: 'Assalam-o-Alaikum! Mujhe 10kW solar system ki quotation chahiye, mera DHA Phase 6 mein ghar hai.' },
      { role: 'assistant', text: 'Walaikum Assalam! Apex Solar Energy Lahore mein khushamdeed. Hamara 10kW On-Grid package Tier-1 Longi panels aur Inverex inverter ke sath aam tor par Rs. 1,650,000 se shuru hota hai. Kya kal dopahar 3:00 baje hamari technical team aapke ghar ka free site survey kar sakti hai?' },
      { role: 'user', text: 'Jee bilkul, kal 3:00 baje bilkul theek hai. Usman Sheikh naam hai mera.' },
      { role: 'assistant', text: 'Shukriya Usman Sahab! Aapka free site visit kal dopahar 3:00 baje confirm ho gaya hai. Hamari engineer team apko visit se pehle call karegi.' }
    ]),
    JSON.stringify(['book_appointment', 'notify_owner_whatsapp'])
  ]);

  // Seed Leads & Appointments for Solar
  db.run(`
    INSERT OR REPLACE INTO leads (
      id, tenant_id, phone, name, address, status, triage_status, notes, estimated_value
    ) VALUES (?, ?, ?, ?, ?, 'BOOKED', 'HIGH_LEAD', ?, ?)
  `, [
    'lead_pk_solar_01', tntSolarPkId, '+92 300 4567890', 'Usman Sheikh', 'House 42, Sector C, DHA Phase 6, Lahore',
    JSON.stringify([
      { note: '10kW On-Grid solar inquiry. Monthly Wapda bill Rs. 85,000. Free roof survey booked.', author: 'Ayesha (AI Receptionist)', timestamp: '2026-11-01T15:30:00.000Z' }
    ]),
    1650000.00
  ]);

  db.run(`
    INSERT OR REPLACE INTO appointments (
      id, tenant_id, lead_id, confirmation_code, customer_name, phone, service_name, scheduled_slot, status, channel
    ) VALUES (?, ?, 'lead_pk_solar_01', 'SLR-98241', 'Usman Sheikh', '+92 300 4567890', '10kW Solar Technical Survey', 'Tomorrow at 3:00 PM', 'CONFIRMED', 'voice')
  `, ['apt_pk_solar_01', tntSolarPkId]);

  // Seed Owner Notifications
  db.run(`
    INSERT OR REPLACE INTO notifications (
      id, tenant_id, call_id, lead_id, channel, recipient, title, message, urgency, status, is_read
    ) VALUES (?, ?, 'call_pk_solar_01', 'lead_pk_solar_01', 'whatsapp', '+92 300 8472910', '🔥 [HOT SALES LEAD] from Usman Sheikh', ?, 'HIGH_LEAD', 'delivered', 0)
  `, [
    'notif_pk_01', tntSolarPkId,
    '🔥 [HOT SALES LEAD]\n🏢 Apex Solar Lahore\n👤 Usman Sheikh (+92 300 4567890)\n🌐 Roman Urdu\n📝 10kW On-Grid System inquiry for DHA Phase 6. Monthly bill Rs. 85,000.\n📅 Survey Booked: Tomorrow at 3:00 PM\n🔗 http://localhost:3000/app'
  ]);

  // =====================================================================
  // 6. PAKISTANI TENANT 2: Al-Rehman Clinic Karachi (Pakistan, Medical/Dental)
  // =====================================================================
  const tntClinicPkId = 'tnt_clinic_pk_01';
  db.run(`
    INSERT OR REPLACE INTO tenants (
      id, business_name, niche, country, currency, phone, whatsapp, owner_phone, owner_whatsapp, owner_email, website, plan_id, 
      subscription_status, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, 'clinic_pk', 'PK', 'PKR', '+92 21 35870000', '+92 321 9876543', '+92 321 9876543', '+92 321 9876543', 'doctor@alrehmanclinic.pk', 'https://alrehmanclinic.pk', 'plan_growth', 'active', ?, ?, 1)
  `, [
    tntClinicPkId,
    'Al-Rehman Family & Dental Clinic Karachi',
    'pk_live_alrehman_clinic_key',
    profileConfigs['clinic_pk'] || '{}'
  ]);

  db.run(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, 'doctor@alrehmanclinic.pk', ?, 'Dr. Salman Tariq (Chief Medical Officer)', 'client_owner')
  `, ['usr_clinic_owner', tntClinicPkId, clientPasswordHash]);

  db.run(`
    INSERT OR REPLACE INTO phone_numbers (phone_number, tenant_id, country, provider, friendly_label, is_active)
    VALUES ('+922135870000', ?, 'PK', 'local_sip', 'Karachi Clifton Clinic Line', 1)
  `, [tntClinicPkId]);

  // =====================================================================
  // 7. US TENANT: Vanguard Roofing (USA, USD)
  // =====================================================================
  const tntRoofingId = 'tnt_roofing_01';
  db.run(`
    INSERT OR REPLACE INTO tenants (
      id, business_name, niche, country, currency, phone, whatsapp, owner_phone, owner_whatsapp, owner_email, website, plan_id, 
      subscription_status, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, 'roofing', 'US', 'USD', '+1 (800) 555-ROOF', '+1 (800) 555-7663', '+1 555 234 5678', '+1 555 234 5678', 'owner@vanguardroofing.com', 'https://vanguardroofing.example.com', 'plan_growth', 'active', ?, ?, 1)
  `, [
    tntRoofingId,
    'Vanguard Roofing & Restoration',
    'pk_live_vanguard_roofing_key',
    profileConfigs['roofing'] || '{}'
  ]);

  db.run(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, 'owner@vanguardroofing.com', ?, 'Robert Vanguard', 'client_owner')
  `, ['usr_roofing_owner', tntRoofingId, clientPasswordHash]);

  db.run(`
    INSERT OR REPLACE INTO phone_numbers (phone_number, tenant_id, country, provider, friendly_label, is_active)
    VALUES ('+18005557663', ?, 'US', 'twilio', 'US Toll-Free Line', 1)
  `, [tntRoofingId]);

  // Seed Calls for Roofing
  db.run(`
    INSERT OR REPLACE INTO calls (
      id, tenant_id, caller_number, caller_name, duration_seconds, status, triage_level, language_detected, summary, transcript, tools_used
    ) VALUES (?, ?, ?, ?, ?, 'completed', 'HIGH_EMERGENCY', 'English', ?, ?, ?)
  `, [
    'call_roof_01', tntRoofingId, '+1 (555) 234-5678', 'John Doe', 78,
    'Active water intrusion inside living room ceiling during storm. Emergency crew dispatch alerted.',
    JSON.stringify([
      { role: 'user', text: 'Water is pouring through my ceiling right now from the storm! Can someone come out immediately?' },
      { role: 'assistant', text: 'I understand water is actively leaking inside your home! This is considered a priority emergency. I have notified our on-call dispatch crew. We have an emergency tarping team ready for Today. Shall I lock this emergency crew dispatch in right now for you?' },
      { role: 'user', text: 'Yes, please lock in that emergency crew!' },
      { role: 'assistant', text: "You're all set! I have confirmed your appointment. Your confirmation code is BK-760427. I have also sent calendar details and our technician's contact to your WhatsApp and phone." }
    ]),
    JSON.stringify(['trigger_emergency_escalation', 'book_appointment'])
  ]);

  // 8. Seed Automations for all tenants
  for (const tid of [tntSolarPkId, tntClinicPkId, tntRoofingId]) {
    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, 'MORNING_BRIEFING', 1, '08:00', '☀️ Good morning team! Here is your 8:00 AM HavenDesk briefing: confirmed appointments, emergency triage log, and staff routing.')
    `, [`auto_mb_${tid}`, tid]);

    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, 'SPEED_TO_LEAD', 1, 'Instant', '⚡ Speed-to-Lead Instant WhatsApp Text-Back: Assalam-o-Alaikum! Thanks for calling us. How can our team assist you right now?')
    `, [`auto_stl_${tid}`, tid]);

    db.run(`
      INSERT OR REPLACE INTO usage_records (id, tenant_id, billing_month, voice_minutes, messages_count, ai_tokens, estimated_cost)
      VALUES (?, ?, '2026-11', 115, 290, 195000, 14.50)
    `, [`usg_${tid}_2026_11`, tid]);
  }

  // 9. System Settings
  db.run(`
    INSERT OR REPLACE INTO system_settings (key, value)
    VALUES ('default_llm_model', 'gemini-2.5-flash'),
           ('supported_countries', '["PK","GB","US"]'),
           ('gemini_multilingual_mode', 'true')
  `);

  console.log('✅ Database seeded successfully with Pakistani & Global businesses!');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
}
