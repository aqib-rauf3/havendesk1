/**
 * HavenDesk — Global Brand & System Configuration
 * Single source of truth for product name, copy, themes, and default settings.
 */

export const BRAND = {
  name: "HavenDesk",
  shortName: "Haven",
  productName: "HavenDesk AI Receptionist",
  tagline: "Calm, 24/7 AI Reception for High-Value Local Businesses",
  description: "Never lose a high-ticket customer to voicemail. Autonomous voice, WhatsApp, and web intake with real-time emergency triage and automated calendar booking.",
  website: "https://havendesk.com",
  supportEmail: "support@havendesk.com",
  version: "2.0.0",
  
  // Visual Theme Tokens
  theme: {
    accentColor: "#0d9488",        // Slate Teal (Calm, trustworthy, medical & trade grade)
    accentHover: "#0f766e",
    accentLight: "#f0fdfa",
    accentMuted: "rgba(13, 148, 136, 0.12)",
    
    // Light Mode
    bgLight: "#f8fafc",            // Soft off-white
    surfaceLight: "#ffffff",
    surfaceLightSubtle: "#f1f5f9",
    borderLight: "#e2e8f0",
    textLightPrimary: "#0f172a",   // Dark charcoal (never harsh pure black)
    textLightMuted: "#64748b",
    
    // Dark Mode
    bgDark: "#0f172a",             // Soft dark charcoal (never harsh pure black)
    surfaceDark: "#1e293b",
    surfaceDarkSubtle: "#182234",
    borderDark: "#334155",
    textDarkPrimary: "#f8fafc",
    textDarkMuted: "#94a3b8",
    
    // Semantic States
    success: "#10b981",
    warning: "#f59e0b",
    emergency: "#ef4444",
    emergencyMuted: "rgba(239, 68, 68, 0.10)"
  },

  // Default Plans (synced with Stripe test placeholders)
  plans: [
    {
      id: "plan_starter",
      name: "Starter",
      description: "Essential 24/7 call and WhatsApp answering for solo practices & small crews.",
      priceMonthly: 199,
      voiceMinutes: 300,
      messages: 1000,
      channels: ["voice", "whatsapp", "web"],
      seats: 2,
      extraMinuteRate: 0.25,
      stripePriceId: "price_mock_starter"
    },
    {
      id: "plan_growth",
      name: "Growth",
      description: "Complete emergency triage, photo intake, and CRM integration for growing contractors & clinics.",
      priceMonthly: 399,
      voiceMinutes: 1000,
      messages: 3500,
      channels: ["voice", "whatsapp", "web"],
      seats: 5,
      extraMinuteRate: 0.20,
      popular: true,
      stripePriceId: "price_mock_growth"
    },
    {
      id: "plan_pro",
      name: "Pro & Multi-Location",
      description: "High-volume emergency dispatch, customized workflows, and dedicated live transfer routing.",
      priceMonthly: 799,
      voiceMinutes: 3000,
      messages: 10000,
      channels: ["voice", "whatsapp", "web"],
      seats: 15,
      extraMinuteRate: 0.15,
      stripePriceId: "price_mock_pro"
    }
  ]
};

export default BRAND;
