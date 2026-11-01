-- HavenDesk SQLite Relational Database Schema
-- Multi-Tenant SaaS Architecture

PRAGMA foreign_keys = ON;

-- 1. Plans & Pricing
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly REAL NOT NULL,
  voice_minutes_included INTEGER NOT NULL,
  messages_included INTEGER NOT NULL,
  channels TEXT NOT NULL DEFAULT '["voice","whatsapp","web"]',
  seats_included INTEGER NOT NULL DEFAULT 3,
  extra_minute_rate REAL NOT NULL DEFAULT 0.20,
  stripe_price_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tenants (Businesses)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT 'solar_pk',
  country TEXT NOT NULL DEFAULT 'PK', -- 'PK' (Pakistan), 'GB' (UK), 'US' (USA), etc.
  currency TEXT NOT NULL DEFAULT 'PKR', -- 'PKR', 'GBP', 'USD'
  phone TEXT,
  whatsapp TEXT,
  owner_phone TEXT,
  owner_whatsapp TEXT,
  owner_email TEXT,
  website TEXT,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  subscription_status TEXT NOT NULL DEFAULT 'active', -- 'trialing', 'active', 'past_due', 'canceled', 'suspended'
  trial_ends_at DATETIME,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  widget_public_key TEXT UNIQUE NOT NULL,
  allowed_domains TEXT DEFAULT '*',
  receptionist_config TEXT NOT NULL, -- JSON blob with hours, triage rules, services, persona, etc.
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Users (Auth & RBAC)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for super_admin
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client_owner', -- 'super_admin', 'support', 'client_owner', 'client_staff'
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Calls (Voice Telephony)
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  caller_number TEXT NOT NULL,
  caller_name TEXT DEFAULT 'Caller',
  direction TEXT NOT NULL DEFAULT 'inbound',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'missed', 'transferred', 'in_progress'
  triage_level TEXT NOT NULL DEFAULT 'STANDARD', -- 'STANDARD', 'HIGH_LEAD', 'HIGH_EMERGENCY'
  language_detected TEXT DEFAULT 'en', -- 'ur', 'ur-Roman', 'en', etc.
  summary TEXT,
  transcript TEXT, -- JSON array of dialogue turns
  tools_used TEXT, -- JSON array of tools executed during the call
  audio_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_calls_tenant ON calls(tenant_id, created_at DESC);

-- 5. Messages (WhatsApp & Web Chat)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'whatsapp', 'web'
  from_number_or_session TEXT NOT NULL,
  sender_name TEXT DEFAULT 'Customer',
  direction TEXT NOT NULL DEFAULT 'inbound', -- 'inbound', 'outbound'
  message_text TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id, created_at DESC);

-- 6. Leads & Customers (Unified CRM)
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT DEFAULT 'Caller',
  address TEXT,
  insurance_info TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', -- 'NEW', 'QUALIFIED', 'EMERGENCY_DISPATCHED', 'BOOKED', 'LOST'
  triage_status TEXT NOT NULL DEFAULT 'STANDARD',
  notes TEXT DEFAULT '[]', -- JSON array of timestamped notes
  media TEXT DEFAULT '[]', -- JSON array of media attachments
  estimated_value REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id, updated_at DESC);

-- 7. Appointments & Bookings
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  confirmation_code TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_name TEXT NOT NULL,
  scheduled_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED', -- 'CONFIRMED', 'RESCHEDULED', 'CANCELED', 'COMPLETED'
  channel TEXT NOT NULL DEFAULT 'voice',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id, scheduled_slot ASC);

-- 8. Owner Notifications Dispatch Log (WhatsApp, SMS, Email, In-App)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp', 'sms', 'email', 'in_app'
  recipient TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'STANDARD', -- 'STANDARD', 'HIGH_LEAD', 'HIGH_EMERGENCY'
  status TEXT NOT NULL DEFAULT 'delivered', -- 'delivered', 'pending', 'failed'
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, is_read, created_at DESC);

-- 9. Dynamic Phone Numbers Map (Supporting Multi-Country Inbound Lines)
CREATE TABLE IF NOT EXISTS phone_numbers (
  phone_number TEXT PRIMARY KEY, -- E.164 (e.g., '+924235780000', '+442079460912', '+18005557663')
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  country TEXT NOT NULL DEFAULT 'PK',
  provider TEXT NOT NULL DEFAULT 'twilio', -- 'twilio', 'vapi', 'local_sip'
  friendly_label TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Automations Config
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'MORNING_BRIEFING', 'SPEED_TO_LEAD', '24H_REMINDER', 'REVIEW_REQUEST'
  enabled INTEGER NOT NULL DEFAULT 1,
  schedule_time TEXT DEFAULT '08:00',
  template_text TEXT NOT NULL,
  last_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, type)
);

-- 11. Usage & Cost Records
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL, -- YYYY-MM
  voice_minutes INTEGER NOT NULL DEFAULT 0,
  messages_count INTEGER NOT NULL DEFAULT 0,
  ai_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0.0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, billing_month)
);

-- 12. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tenant_id TEXT,
  action TEXT NOT NULL,
  ip_address TEXT DEFAULT '127.0.0.1',
  details TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- 13. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  messages TEXT NOT NULL DEFAULT '[]', -- JSON array of messages
  internal_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Niche Templates (Master Catalog)
CREATE TABLE IF NOT EXISTS niche_templates (
  id TEXT PRIMARY KEY, -- 'solar_pk', 'clinic_pk', 'roofing', 'dental', 'hvac'
  name TEXT NOT NULL,
  tagline TEXT,
  profile_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. System Settings & Remote Config
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
