/**
 * HavenDesk Gemini Multilingual AI Receptionist Engine
 * Uses Google Gemini 2.5/1.5 Flash for sub-second, multilingual voice processing.
 * Fluently handles Urdu, Roman Urdu, English, Punjabi, and code-switching for Pakistani, UK, and US businesses.
 */

export class GeminiReceptionistService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  }

  /**
   * Process a live customer conversation turn using Gemini
   */
  async generateTurn({ tenant, message, callerPhone, dialogueHistory = [] }) {
    let config = {};
    try {
      config = typeof tenant.receptionist_config === 'string' 
        ? JSON.parse(tenant.receptionist_config) 
        : (tenant.receptionist_config || {});
    } catch (e) {
      config = {};
    }

    const persona = config.receptionistPersona || {
      name: tenant.country === 'PK' ? 'Ayesha' : 'Sarah',
      greeting: tenant.country === 'PK' 
        ? `Assalam-o-Alaikum! ${tenant.business_name} mein khushamdeed.` 
        : `Thank you for calling ${tenant.business_name}.`
    };

    const currency = tenant.currency || (tenant.country === 'PK' ? 'PKR' : 'USD');
    const currencySymbol = currency === 'PKR' ? 'Rs.' : (currency === 'GBP' ? '£' : '$');

    // If Gemini API Key is available, use real Gemini Flash
    if (this.apiKey && this.apiKey !== 'your_gemini_api_key_here') {
      try {
        return await this._callGeminiAPI({ tenant, config, persona, currency, currencySymbol, message, callerPhone, dialogueHistory });
      } catch (err) {
        console.warn(`[GEMINI API WARNING] Real API failed, falling back to smart engine: ${err.message}`);
      }
    }

    // High-Fidelity Multilingual Smart Fallback Engine (Runs out of the box with zero keys)
    return this._smartMultilingualFallback({ tenant, config, persona, currencySymbol, message, callerPhone });
  }

  /**
   * Real Google Gemini API Call with Structured JSON Output
   */
  async _callGeminiAPI({ tenant, config, persona, currency, currencySymbol, message, callerPhone, dialogueHistory }) {
    const systemPrompt = `
You are ${persona.name}, an authentic, highly professional AI telephone receptionist working for "${tenant.business_name}".
Industry / Niche: ${tenant.niche}
Country: ${tenant.country || 'PK'} | Currency: ${currency} (${currencySymbol})
Business Phone: ${tenant.phone || 'N/A'} | WhatsApp: ${tenant.whatsapp || 'N/A'}
Services Offered: ${JSON.stringify(config.services || [])}
Business Hours: ${JSON.stringify(config.businessHours || {})}
Emergency Triage Rules: ${JSON.stringify(config.triageRules || {})}
Frequently Asked Questions: ${JSON.stringify(config.faq || [])}

CRITICAL RULES:
1. YOU ARE ON A LIVE PHONE CALL. Keep your verbal responses concise (1 to 3 sentences maximum), warm, natural, and conversational.
2. MULTILINGUAL FLUENCY:
   - If the caller speaks in Urdu (اردو), reply in polite, natural Urdu.
   - If the caller speaks in Roman Urdu (e.g., "Mera solar ka bill bohot aa raha hai", "appointment kab milegi"), reply in natural, friendly Roman Urdu with traditional etiquette ("Assalam-o-Alaikum", "Jee bilkul", "Bohat shukriya").
   - If the caller speaks in English, reply in crisp, professional English.
   - If the caller mixes English and Urdu, match their natural code-switching tone.
3. Be helpful, answer pricing and service questions using the data provided, ask for their name/address if not known, and offer to schedule an appointment or technician visit.
4. If an emergency or high-urgency issue is mentioned (e.g. fire, spark, water pouring, extreme pain), flag urgency as "HIGH_EMERGENCY". If they want a quote or to buy a system/service, flag as "HIGH_LEAD".

You must respond ONLY in valid JSON matching this schema:
{
  "replyText": "Exact text to speak out loud to the caller",
  "detectedLanguage": "Urdu" | "Roman Urdu" | "English" | "Mixed",
  "callerName": "Extracted name or 'Caller'",
  "callerAddress": "Extracted address or null",
  "inquirySummary": "Brief 1-2 sentence summary of what the customer wanted",
  "urgencyLevel": "STANDARD" | "HIGH_LEAD" | "HIGH_EMERGENCY",
  "appointmentRequested": true | false,
  "appointmentDetails": "e.g. Tomorrow at 3:00 PM or null",
  "actionItems": ["Action item for the business owner"]
}
`;

    const contents = [];
    if (dialogueHistory && dialogueHistory.length > 0) {
      for (const turn of dialogueHistory.slice(-4)) {
        contents.push({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.text || turn.message || '' }]
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: `[Caller Phone: ${callerPhone}]\nCaller says: "${message}"` }]
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) throw new Error('No content returned from Gemini.');

    return JSON.parse(rawJson);
  }

  /**
   * High-Fidelity Multilingual Smart Fallback
   * Automatically recognizes Urdu, Roman Urdu, and English keywords for Pakistani, UK, and US clients.
   */
  _smartMultilingualFallback({ tenant, config, persona, currencySymbol, message, callerPhone }) {
    const text = (message || '').toLowerCase();
    const services = config.services || [{ name: 'Standard Service', priceRange: `${currencySymbol}100` }];
    const isPK = tenant.country === 'PK' || (tenant.phone && tenant.phone.startsWith('+92'));

    // Extract caller name if spoken
    let callerName = 'Caller';
    const nameMatch = (message || '').match(/(?:my name is|i'm|this is|mera naam|main)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) callerName = nameMatch[1];

    // Language detection heuristics
    const isUrduScript = /[\u0600-\u06FF]/.test(message);
    const romanUrduWords = ['mera', 'meri', 'kya', 'hai', 'hain', 'bohot', 'shukriya', 'assalam', 'walaikum', 'chahiye', 'karwana', 'lagwana', 'kitne', 'rupay', 'bill', 'kab', 'ho', 'gaya', 'dard', 'daant', 'bijli'];
    const hasRomanUrdu = romanUrduWords.some(w => text.includes(w));

    let detectedLanguage = 'English';
    if (isUrduScript) detectedLanguage = 'Urdu';
    else if (hasRomanUrdu || isPK) detectedLanguage = 'Roman Urdu';

    // Emergency Detection
    const emergencyWords = ['blast', 'fire', 'smoke', 'spark', 'sparking', 'jal gaya', 'dhuan', 'leak', 'water', 'pain', 'emergency', 'dard', 'bleeding'];
    const isEmergency = emergencyWords.some(w => text.includes(w));

    // High Lead / Commercial Inquiries
    const leadWords = ['rate', 'price', 'cost', 'quotation', 'solar', '10kw', '5kw', 'meter', 'lagwana', 'install', 'replacement', 'estimate'];
    const isHighLead = leadWords.some(w => text.includes(w));

    let replyText = '';
    let inquirySummary = '';
    let urgencyLevel = isEmergency ? 'HIGH_EMERGENCY' : (isHighLead ? 'HIGH_LEAD' : 'STANDARD');
    let appointmentRequested = false;
    let appointmentDetails = null;

    if (detectedLanguage === 'Urdu') {
      if (isEmergency) {
        replyText = `السلام علیکم! میں آپ کی صورتحال سمجھ رہی ہوں، ہماری ایمرجنسی ٹیم الرٹ کر دی گئی ہے۔ کیا آپ اپنا پتہ کنفرم کر سکتے ہیں تاکہ ٹیکنیشن فوری روانہ ہو سکے؟`;
        inquirySummary = 'کسٹمر نے ہنگامی مسئلے کی اطلاع دی ہے اور فوری مدد طلب کی ہے۔';
      } else if (isHighLead) {
        const topService = services[0] ? services[0].name : 'سولر سروس';
        replyText = `السلام علیکم! ${tenant.business_name} میں خوش آمدید۔ ہم ${topService} کے مکمل حل فراہم کرتے ہیں۔ کیا میں کل کے لیے فری سائٹ وزٹ بک کر لوں؟`;
        inquirySummary = 'کسٹمر نے پیکج ریٹس اور فری سائٹ وزٹ کی تفصیلات مانگی ہیں۔';
        appointmentRequested = true;
        appointmentDetails = 'Tomorrow at 3:00 PM';
      } else {
        replyText = `السلام علیکم! ${tenant.business_name} میں خوش آمدید۔ میرا نام ${persona.name} ہے۔ میں آپ کی کیا مدد کر سکتی ہوں؟`;
        inquirySummary = 'عمومی کسٹمر کال';
      }
    } else if (detectedLanguage === 'Roman Urdu') {
      if (isEmergency) {
        replyText = `Assalam-o-Alaikum! Main samajh rahi hoon yeh urgent masla hai. Maine on-call team ko notification bhej di hai. Baraye meharbani apna address confirm kijiye taake technician foran pohanch sakay.`;
        inquirySummary = `Urgent emergency reported by ${callerName}: "${message.substring(0, 70)}"`;
      } else if (isHighLead) {
        const topService = services[0] ? services[0].name : 'Premium Service';
        const price = services[0]?.priceRange || `${currencySymbol}950,000`;
        replyText = `Assalam-o-Alaikum! ${tenant.business_name} mein khushamdeed. Hamara ${topService} ka package aam tor par ${price} se shuru hota hai. Kya kal dopahar 3 baje hamari team aapki location ka free site survey kar sakti hai?`;
        inquirySummary = `High value lead: Customer requested quotation and details for ${topService}`;
        appointmentRequested = true;
        appointmentDetails = 'Tomorrow at 3:00 PM (Free Technical Site Survey)';
      } else {
        replyText = `Assalam-o-Alaikum! ${tenant.business_name} mein khushamdeed. Mera naam ${persona.name} hai. Main aapki kya rehnumai kar sakti hoon?`;
        inquirySummary = `Inbound customer inquiry: "${message.substring(0, 60)}"`;
      }
    } else {
      // English
      if (isEmergency) {
        replyText = `I understand this is an urgent situation. I have dispatched an alert to our priority emergency crew. Could you please confirm your location so our nearest technician can arrive immediately?`;
        inquirySummary = `Emergency call received from ${callerName}: ${message.substring(0, 70)}`;
      } else if (isHighLead) {
        const topService = services[0]?.name || 'Standard Package';
        replyText = `Thank you for calling ${tenant.business_name}! Our ${topService} is available starting from ${services[0]?.priceRange || '$500'}. Would tomorrow at 11:00 AM or 2:00 PM work for an on-site assessment?`;
        inquirySummary = `Sales inquiry regarding ${topService}`;
        appointmentRequested = true;
        appointmentDetails = 'Tomorrow at 11:00 AM';
      } else {
        replyText = `Thank you for calling ${tenant.business_name}! My name is ${persona.name}. How can I assist you today?`;
        inquirySummary = `General inbound inquiry: "${message.substring(0, 60)}"`;
      }
    }

    return {
      replyText,
      detectedLanguage,
      callerName,
      callerAddress: null,
      inquirySummary,
      urgencyLevel,
      appointmentRequested,
      appointmentDetails,
      actionItems: [
        `Send WhatsApp follow-up to ${callerPhone}`,
        urgencyLevel === 'HIGH_EMERGENCY' ? 'Alert on-call technician immediately' : 'Assign to sales representative'
      ]
    };
  }
}

export const geminiService = new GeminiReceptionistService();
export default geminiService;
