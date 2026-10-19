/**
 * HavenDesk Database Seeder
 * Populates plans, niche templates, super_admin, and 3 realistic client tenants (Roofing, Dental, HVAC).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './database.js';
import { hashPassword, generateToken } from '../utils/crypto.js';
import { BRAND } from '../../shared/brand.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function seedDatabase() {
  console.log('🌱 Seeding HavenDesk database...');

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
  const niches = ['roofing', 'dental', 'hvac'];
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

  // 5. Seed Demo Tenant 1: Vanguard Roofing (Growth Plan, Active)
  const tntRoofingId = 'tnt_roofing_01';
  db.run(`
    INSERT OR REPLACE INTO tenants (
      id, business_name, niche, phone, whatsapp, website, plan_id, 
      subscription_status, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, 'roofing', '+1 (800) 555-ROOF', '+1 (800) 555-7663', 'https://vanguardroofing.example.com', 'plan_growth', 'active', ?, ?, 1)
  `, [
    tntRoofingId,
    'Vanguard Roofing & Restoration',
    'pk_live_vanguard_roofing_key',
    profileConfigs['roofing'] || '{}'
  ]);

  const roofingOwnerHash = hashPassword('ClientPass2026!');
  db.run(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, 'owner@vanguardroofing.com', ?, 'Robert Vanguard', 'client_owner')
  `, ['usr_roofing_owner', tntRoofingId, roofingOwnerHash]);

  // Seed Calls for Roofing
  db.run(`
    INSERT OR REPLACE INTO calls (
      id, tenant_id, caller_number, caller_name, duration_seconds, status, triage_level, summary, transcript, tools_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'call_roof_01', tntRoofingId, '+1 (555) 234-5678', 'John Doe', 78, 'completed', 'HIGH_EMERGENCY',
    'Panicked call regarding water pouring through living room ceiling during thunderstorm. Tarping crew alerted and emergency window confirmed.',
    JSON.stringify([
      { role: 'user', text: 'Water is pouring through my ceiling right now from the storm! Can someone come out immediately?' },
      { role: 'assistant', text: 'I understand water is actively leaking inside your home! This is considered a priority emergency. I have notified our on-call dispatch crew. We have an emergency tarping team ready for Today. Shall I lock this emergency crew dispatch in right now for you?' },
      { role: 'user', text: 'Yes, please lock in that emergency crew!' },
      { role: 'assistant', text: "You're all set! I have confirmed your appointment. Your confirmation code is BK-760427. I have also sent calendar details and our technician's contact to your WhatsApp and phone." }
    ]),
    JSON.stringify(['trigger_emergency_escalation', 'book_appointment'])
  ]);

  // Seed Leads & Appointments for Roofing
  db.run(`
    INSERT OR REPLACE INTO leads (
      id, tenant_id, phone, name, address, status, triage_status, notes, media, estimated_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'lead_roof_01', tntRoofingId, '+1 (555) 234-5678', 'John Doe', '742 Evergreen Terrace', 'EMERGENCY_DISPATCHED', 'HIGH_EMERGENCY',
    JSON.stringify([
      { note: 'Emergency tarping crew dispatched. Active ceiling leak near chimney valley.', author: 'Sarah (AI)', timestamp: '2026-10-18T14:20:00.000Z' },
      { note: 'Homeowner called back to confirm technician arrival window.', author: 'Robert Vanguard', timestamp: '2026-10-18T14:45:00.000Z' }
    ]),
    JSON.stringify([{ type: 'photo', url: 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=800', description: 'Torn shingles and valley leak' }]),
    12500.00
  ]);

  db.run(`
    INSERT OR REPLACE INTO leads (
      id, tenant_id, phone, name, address, status, triage_status, notes, media, estimated_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'lead_roof_02', tntRoofingId, '+1 (555) 345-6789', 'Maria Santos', '412 Oak Ridge Blvd', 'ESTIMATE_SCHEDULED', 'STANDARD',
    JSON.stringify([
      { note: 'Inquired about comprehensive 21-point drone roof inspection following hail storm.', author: 'Sarah (AI)', timestamp: '2026-10-18T11:15:00.000Z' }
    ]),
    JSON.stringify([]),
    8900.00
  ]);

  db.run(`
    INSERT OR REPLACE INTO leads (
      id, tenant_id, phone, name, address, status, triage_status, notes, media, estimated_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'lead_roof_03', tntRoofingId, '+1 (555) 876-5432', 'David Clark', '109 Crestview Way', 'NEW', 'STANDARD',
    JSON.stringify([
      { note: 'Missing shingles on west elevation after windstorm. Requested estimate.', author: 'Sarah (AI)', timestamp: '2026-10-18T09:30:00.000Z' }
    ]),
    JSON.stringify([{ type: 'photo', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800', description: 'Wind damaged shingle corner' }]),
    4200.00
  ]);

  db.run(`
    INSERT OR REPLACE INTO leads (
      id, tenant_id, phone, name, address, status, triage_status, notes, media, estimated_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'lead_roof_04', tntRoofingId, '+1 (555) 901-2345', 'Robert Chen', '88 Magnolia Court', 'WON', 'STANDARD',
    JSON.stringify([
      { note: 'Full architectural shingle replacement contract signed. Insurance claim approved.', author: 'Robert Vanguard', timestamp: '2026-10-17T16:00:00.000Z' }
    ]),
    JSON.stringify([]),
    18400.00
  ]);

  db.run(`
    INSERT OR REPLACE INTO appointments (
      id, tenant_id, lead_id, confirmation_code, customer_name, phone, service_name, scheduled_slot, status, channel
    ) VALUES (?, ?, 'lead_roof_01', 'BK-760427', 'John Doe', '+1 (555) 234-5678', 'Emergency Tarp & Leak Mitigation', 'Today at 8:45 PM', 'CONFIRMED', 'voice')
  `, ['apt_roof_01', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO appointments (
      id, tenant_id, lead_id, confirmation_code, customer_name, phone, service_name, scheduled_slot, status, channel
    ) VALUES (?, ?, 'lead_roof_02', 'BK-891044', 'Maria Santos', '+1 (555) 345-6789', 'Comprehensive 21-Point Drone Inspection', 'Tomorrow at 2:00 PM', 'CONFIRMED', 'whatsapp')
  `, ['apt_roof_02', tntRoofingId]);

  // Seed Messages for Roofing (Multiple Rich Threads)
  // Thread 1: John Doe
  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 234-5678', 'John Doe', 'inbound', 'Water is pouring through my living room ceiling right now from the storm! Can someone come out?', NULL, NULL, '2026-10-18 14:18:00')
  `, ['msg_roof_01', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 234-5678', 'HavenDesk AI', 'outbound', 'I understand water is actively leaking inside your home! That is our top priority emergency. I have notified our on-call dispatch crew and locked in an emergency crew for Today. Confirmation code: BK-760427.', NULL, NULL, '2026-10-18 14:18:30')
  `, ['msg_roof_02', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 234-5678', 'John Doe', 'inbound', 'Here is the photo of the roof damage near the valley.', 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=800', 'photo', '2026-10-18 14:19:15')
  `, ['msg_roof_03', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 234-5678', 'HavenDesk AI', 'outbound', 'Photo received! Our on-call tarping supervisor Carlos has reviewed it and is en route with protective tarping gear.', NULL, NULL, '2026-10-18 14:20:00')
  `, ['msg_roof_04', tntRoofingId]);

  // Thread 2: Maria Santos
  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 345-6789', 'Maria Santos', 'inbound', 'Hi, do you offer free roof inspections for hail damage?', NULL, NULL, '2026-10-18 11:10:00')
  `, ['msg_roof_05', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 345-6789', 'HavenDesk AI', 'outbound', 'Yes Maria! Our comprehensive 21-point drone and roof inspection is 100% free with zero obligation. Would tomorrow at 2:00 PM work for you?', NULL, NULL, '2026-10-18 11:11:00')
  `, ['msg_roof_06', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 345-6789', 'Maria Santos', 'inbound', 'Tomorrow at 2:00 PM works great, our address is 412 Oak Ridge Blvd.', NULL, NULL, '2026-10-18 11:14:00')
  `, ['msg_roof_07', tntRoofingId]);

  // Thread 3: David Clark
  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 876-5432', 'David Clark', 'inbound', 'We noticed some shingles blew off after yesterday wind gusts. Here is a picture from my driveway.', 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800', 'photo', '2026-10-18 09:28:00')
  `, ['msg_roof_08', tntRoofingId]);

  db.run(`
    INSERT OR REPLACE INTO messages (id, tenant_id, channel, from_number_or_session, sender_name, direction, message_text, media_url, media_type, created_at)
    VALUES (?, ?, 'whatsapp', '+1 (555) 876-5432', 'HavenDesk AI', 'outbound', 'Thank you David, we can see the missing tabs on the ridge. Would you like a specialist to visit tomorrow morning for a repair estimate?', NULL, NULL, '2026-10-18 09:30:00')
  `, ['msg_roof_09', tntRoofingId]);

  // 6. Seed Demo Tenant 2: Apex Family & Emergency Dentistry (Pro Plan, Active)
  const tntDentalId = 'tnt_dental_02';
  db.run(`
    INSERT OR REPLACE INTO tenants (
      id, business_name, niche, phone, whatsapp, website, plan_id, 
      subscription_status, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, 'dental', '+1 (800) 555-TOOTH', '+1 (800) 555-8668', 'https://apexdental.example.com', 'plan_pro', 'active', ?, ?, 1)
  `, [
    tntDentalId,
    'Apex Family & Emergency Dentistry',
    'pk_live_apex_dental_key',
    profileConfigs['dental'] || '{}'
  ]);

  db.run(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, 'drdavis@apexdental.com', ?, 'Dr. Michael Davis, DDS', 'client_owner')
  `, ['usr_dental_owner', tntDentalId, roofingOwnerHash]);

  db.run(`
    INSERT OR REPLACE INTO calls (
      id, tenant_id, caller_number, caller_name, duration_seconds, status, triage_level, summary, transcript, tools_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'call_dent_01', tntDentalId, '+1 (555) 987-6543', 'Sarah Miller', 64, 'completed', 'HIGH_EMERGENCY',
    'Patient suffering from acute throbbing molar pain and facial swelling. Verified Delta Dental PPO and booked emergency chair relief slot.',
    JSON.stringify([
      { role: 'user', text: 'I have severe throbbing toothache pain and my cheek is swollen!' },
      { role: 'assistant', text: "I'm very sorry you're in severe pain. Dental trauma and severe pain are our top priority. Dr. Davis has reserved an emergency relief slot for Today. Would you like me to book this emergency chair time right now?" },
      { role: 'user', text: 'Yes, please book that relief chair time right away.' },
      { role: 'assistant', text: "You're all set! I have confirmed your appointment. Your confirmation code is BK-597432." }
    ]),
    JSON.stringify(['trigger_emergency_escalation', 'book_appointment'])
  ]);

  db.run(`
    INSERT OR REPLACE INTO appointments (
      id, tenant_id, confirmation_code, customer_name, phone, service_name, scheduled_slot, status, channel
    ) VALUES (?, ?, 'BK-597432', 'Sarah Miller', '+1 (555) 987-6543', 'Same-Day Emergency Pain Relief & Exam', 'Today at 10:30 AM', 'CONFIRMED', 'voice')
  `, ['apt_dent_01', tntDentalId]);

  // 7. Seed Demo Tenant 3: Apex Climate & Heating (Starter Plan, Trialing)
  const tntHvacId = 'tnt_hvac_03';
  const trialEnds = new Date(Date.now() + 10 * 86400000).toISOString();
  db.run(`
    INSERT OR REPLACE INTO tenants (
      id, business_name, niche, phone, whatsapp, website, plan_id, 
      subscription_status, trial_ends_at, widget_public_key, receptionist_config, onboarding_completed
    ) VALUES (?, ?, 'hvac', '+1 (800) 555-HVAC', '+1 (800) 555-4822', 'https://apexclimate.example.com', 'plan_starter', 'trialing', ?, ?, ?, 1)
  `, [
    tntHvacId,
    'Apex Climate & Heating Pros',
    trialEnds,
    'pk_live_apex_climate_key',
    profileConfigs['hvac'] || '{}'
  ]);

  db.run(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, 'marcus@apexclimate.com', ?, 'Marcus Sterling', 'client_owner')
  `, ['usr_hvac_owner', tntHvacId, roofingOwnerHash]);

  // 8. Seed Automations for all tenants (5 High-Value Automations)
  for (const tid of [tntRoofingId, tntDentalId, tntHvacId]) {
    // 1. Morning Executive Briefing
    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, 'MORNING_BRIEFING', 1, '08:00', '☀️ Good morning team! Here is your 8:00 AM HavenDesk briefing: confirmed appointments, emergency triage log, and staff routing.')
    `, [`auto_mb_${tid}`, tid]);

    // 2. 24-Hour Reminder
    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, '24H_REMINDER', 1, '10:00', '🔔 24-Hour WhatsApp Appointment Reminder: We look forward to seeing you tomorrow! Reply 1 to Confirm or 2 to Reschedule.')
    `, [`auto_rem_${tid}`, tid]);

    // 3. Speed-to-lead text back
    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, 'SPEED_TO_LEAD', 1, 'Instant', '⚡ Speed-to-Lead Instant Text-Back: Hi, this is your 24/7 AI Receptionist. Sorry we missed you—how can our team assist you right now?')
    `, [`auto_stl_${tid}`, tid]);

    // 4. 5-Star Google Review Request
    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, 'REVIEW_REQUEST', 1, '+2 hours', '⭐ 5-Star Review Request: Thank you for choosing us! If our crew took great care of you today, could you leave a quick 5-star Google review? [g.page/review/haven]')
    `, [`auto_rev_${tid}`, tid]);

    // 5. VIP Emergency Technician Alert
    db.run(`
      INSERT OR REPLACE INTO automations (id, tenant_id, type, enabled, schedule_time, template_text)
      VALUES (?, ?, 'EMERGENCY_DISPATCH', 1, 'Realtime', '🚨 VIP Emergency Technician Alert: High-priority triage detected. Caller address, damage summary, and photo link dispatched to on-call supervisor.')
    `, [`auto_eme_${tid}`, tid]);

    // Seed usage
    db.run(`
      INSERT OR REPLACE INTO usage_records (id, tenant_id, billing_month, voice_minutes, messages_count, ai_tokens, estimated_cost)
      VALUES (?, ?, '2026-10', 142, 380, 245000, 18.45)
    `, [`usg_${tid}_2026_10`, tid]);
  }

  // 9. Seed System Settings & Remote Config
  db.run(`
    INSERT OR REPLACE INTO system_settings (key, value)
    VALUES ('maintenance_mode', 'false'),
           ('default_llm_model', 'gemini-2.5-flash'),
           ('global_triage_strictness', 'high'),
           ('stripe_test_mode', 'true')
  `);

  console.log('✅ Database seeded successfully with Super Admin, Support, and 3 Demo Tenants!');
}

// Run immediately if called directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
}
