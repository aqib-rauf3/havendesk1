// OmniReceptionist AI — Interactive Application Controller

const state = {
  activeNiche: 'roofing',
  profile: null,
  availableNiches: [],
  demoStep: 0,
  demoTimer: null,
  callDuration: 0,
  callInterval: null
};

// Preset queries per niche
const PRESETS = {
  roofing: [
    { label: "🚨 'Water is pouring through my ceiling!'", text: "Water is pouring through my ceiling right now from the storm! Can someone come out immediately?", isEmergency: true },
    { label: "💰 'How much for a roof inspection?'", text: "How much do you charge for a full roof inspection and estimate?", isEmergency: false },
    { label: "📅 'Do you have availability tomorrow?'", text: "Do you have any availability for a roof assessment tomorrow?", isEmergency: false },
    { label: "✅ 'Yes, please lock in that time'", text: "Yes, please lock that appointment time in for me.", isEmergency: false }
  ],
  dental: [
    { label: "🚨 'Severe throbbing toothache & swelling'", text: "I have a severe throbbing toothache and my cheek is swollen! I can't sleep from the pain, is Dr. Davis available?", isEmergency: true },
    { label: "🦷 'Do you take Delta Dental PPO?'", text: "Do you accept Delta Dental PPO insurance for routine checkups and cleaning?", isEmergency: false },
    { label: "📅 'I need a cleaning on Friday'", text: "I need to schedule a routine dental exam and cleaning for Friday.", isEmergency: false },
    { label: "✅ 'Yes, confirm that chair slot'", text: "Yes, please confirm that appointment slot for me.", isEmergency: false }
  ],
  hvac: [
    { label: "🚨 'Freezing outside and furnace died!'", text: "It's 18 degrees outside and our furnace completely shut off! We have an infant in the house.", isEmergency: true },
    { label: "❄️ 'AC blowing warm air'", text: "Our AC is running but only blowing warm air. How much is a service diagnostic?", isEmergency: false },
    { label: "📅 'Need seasonal tune-up'", text: "I'd like to book a precision seasonal tune-up for my heat pump.", isEmergency: false },
    { label: "✅ 'Yes, dispatch a technician'", text: "Yes, please confirm the dispatch window.", isEmergency: false }
  ]
};

// DOM Elements
const nicheSelect = document.getElementById('nicheSelect');
const voiceTranscript = document.getElementById('voiceTranscript');
const voicePresets = document.getElementById('voicePresets');
const voiceCustomInput = document.getElementById('voiceCustomInput');
const btnVoiceSend = document.getElementById('btnVoiceSend');
const chkAudioVoice = document.getElementById('chkAudioVoice');
const callStatusBadge = document.getElementById('callStatusBadge');
const audioWave = document.getElementById('audioWave');
const phoneCallerName = document.getElementById('phoneCallerName');
const voicePersonaName = document.getElementById('voicePersonaName');

const waChatBody = document.getElementById('waChatBody');
const waInput = document.getElementById('waInput');
const btnWaSend = document.getElementById('btnWaSend');
const btnSendPhoto = document.getElementById('btnSendPhoto');
const waBusinessName = document.getElementById('waBusinessName');

const leadsTableBody = document.getElementById('leadsTableBody');
const appointmentsTableBody = document.getElementById('appointmentsTableBody');
const activityFeed = document.getElementById('activityFeed');
const leadCount = document.getElementById('leadCount');
const aptCount = document.getElementById('aptCount');

const btnMorningBriefing = document.getElementById('btnMorningBriefing');
const btnTriggerReminder = document.getElementById('btnTriggerReminder');
const btnAutoDemo = document.getElementById('btnAutoDemo');

const demoModal = document.getElementById('demoModal');
const btnCloseDemo = document.getElementById('btnCloseDemo');
const btnNextDemoStep = document.getElementById('btnNextDemoStep');
const btnPauseDemo = document.getElementById('btnPauseDemo');
const demoStageScreen = document.getElementById('demoStageScreen');
const demoStepIndicator = document.getElementById('demoStepIndicator');
const demoProgressFill = document.getElementById('demoProgressFill');
const demoTakeawayText = document.getElementById('demoTakeawayText');

const webWidgetBubble = document.getElementById('webWidgetBubble');
const webWidgetBox = document.getElementById('webWidgetBox');
const btnCloseWidget = document.getElementById('btnCloseWidget');
const widgetMessages = document.getElementById('widgetMessages');
const widgetInput = document.getElementById('widgetInput');
const btnWidgetSend = document.getElementById('btnWidgetSend');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await fetchNicheData();
  await refreshCRM();
  setupEventListeners();
  startCallTimer();
});

async function fetchNicheData() {
  try {
    const res = await fetch('/api/niches');
    const data = await res.json();
    state.profile = data.active;
    state.activeNiche = data.active.id;
    state.availableNiches = data.available;
    updateNicheUI();
  } catch (err) {
    console.error("Failed to load niches:", err);
  }
}

function updateNicheUI() {
  const p = state.profile;
  if (!p) return;

  nicheSelect.value = p.id;
  waBusinessName.textContent = `${p.businessName} (Verified Business)`;
  voicePersonaName.textContent = p.receptionistPersona.name;

  if (p.id === 'roofing') {
    phoneCallerName.textContent = "John Doe (Homeowner)";
  } else if (p.id === 'dental') {
    phoneCallerName.textContent = "Sarah Miller (Patient)";
  } else {
    phoneCallerName.textContent = "David Clark (Resident)";
  }

  // Populate Voice Presets
  voicePresets.innerHTML = '';
  const currentPresets = PRESETS[p.id] || PRESETS.roofing;
  currentPresets.forEach(preset => {
    const chip = document.createElement('div');
    chip.className = `chip ${preset.isEmergency ? 'chip-emergency' : ''}`;
    chip.textContent = preset.label;
    chip.onclick = () => {
      voiceCustomInput.value = preset.text;
      handleVoiceSend();
    };
    voicePresets.appendChild(chip);
  });
}

function setupEventListeners() {
  // Niche change
  nicheSelect.addEventListener('change', async (e) => {
    const newId = e.target.value;
    try {
      const res = await fetch('/api/niches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: newId })
      });
      const data = await res.json();
      if (data.success) {
        state.profile = data.active;
        state.activeNiche = data.active.id;
        updateNicheUI();
        await refreshCRM();
        addVoiceSystemMessage(`Switched active business to ${data.active.businessName}. Persona: ${data.active.receptionistPersona.name}`);
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Voice simulator input
  btnVoiceSend.addEventListener('click', handleVoiceSend);
  voiceCustomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleVoiceSend();
  });

  // WhatsApp input
  btnWaSend.addEventListener('click', handleWaSend);
  waInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleWaSend();
  });

  btnSendPhoto.addEventListener('click', handlePhotoSend);

  // Widget
  webWidgetBubble.addEventListener('click', () => webWidgetBox.classList.toggle('hidden'));
  btnCloseWidget.addEventListener('click', () => webWidgetBox.classList.add('hidden'));
  btnWidgetSend.addEventListener('click', handleWidgetSend);
  widgetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleWidgetSend();
  });

  // Automations
  btnMorningBriefing.addEventListener('click', () => triggerAutomation('MORNING_BRIEFING'));
  btnTriggerReminder.addEventListener('click', () => triggerAutomation('FOLLOW_UP_REMINDER'));

  // Live Demo
  btnAutoDemo.addEventListener('click', startInteractiveDemo);
  btnCloseDemo.addEventListener('click', () => demoModal.classList.add('hidden'));
  btnNextDemoStep.addEventListener('click', advanceDemoStep);
  btnPauseDemo.addEventListener('click', togglePauseDemo);
}

function startCallTimer() {
  state.callDuration = 0;
  clearInterval(state.callInterval);
  state.callInterval = setInterval(() => {
    state.callDuration++;
    const mins = String(Math.floor(state.callDuration / 60)).padStart(2, '0');
    const secs = String(state.callDuration % 60).padStart(2, '0');
    callStatusBadge.textContent = `Call Active (${mins}:${secs})`;
  }, 1000);
}

// -------------------------------------------------------------
// Voice Channel Logic
// -------------------------------------------------------------
async function handleVoiceSend() {
  const text = voiceCustomInput.value.trim();
  if (!text) return;

  voiceCustomInput.value = '';
  appendVoiceMessage('user', text);
  triggerWave(true);

  try {
    const res = await fetch('/api/voice/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerNumber: '+1 (555) 234-5678',
        speechInput: text,
        customerName: phoneCallerName.textContent.split(' ')[0]
      })
    });
    const data = await res.json();
    appendVoiceMessage('assistant', data.text, data.toolCalls, data.triageStatus);
    
    if (chkAudioVoice.checked) {
      speakText(data.text);
    }
    await refreshCRM();
  } catch (err) {
    appendVoiceMessage('system', "Error communicating with voice engine: " + err.message);
  } finally {
    setTimeout(() => triggerWave(false), 2000);
  }
}

function appendVoiceMessage(role, text, toolCalls = [], triageStatus = null) {
  const div = document.createElement('div');
  div.className = `message ${role === 'user' ? 'msg-user' : role === 'assistant' ? 'msg-assistant' : 'system-msg'}`;
  
  let toolHtml = '';
  if (triageStatus === 'HIGH_EMERGENCY') {
    toolHtml += `<div class="tool-tag emergency-tag">🚨 HIGH EMERGENCY TRIAGE TRIGGERED</div>`;
  }
  if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach(tc => {
      toolHtml += `<div class="tool-tag">⚡ TOOL: ${tc.name}()</div>`;
    });
  }

  div.innerHTML = `<strong>${role === 'user' ? 'Caller' : role === 'assistant' ? state.profile?.receptionistPersona.name || 'AI' : 'System'}:</strong> ${text} ${toolHtml}`;
  voiceTranscript.appendChild(div);
  voiceTranscript.scrollTop = voiceTranscript.scrollHeight;
}

function addVoiceSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message system-msg';
  div.textContent = text;
  voiceTranscript.appendChild(div);
  voiceTranscript.scrollTop = voiceTranscript.scrollHeight;
}

function triggerWave(active) {
  if (active) audioWave.classList.add('active');
  else audioWave.classList.remove('active');
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  // Filter out XML or phone numbers for cleaner TTS
  const clean = text.replace(/BK-\d+/g, 'confirmation code provided').replace(/https?:\/\/\S+/g, '');
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// -------------------------------------------------------------
// WhatsApp Channel Logic
// -------------------------------------------------------------
async function handleWaSend() {
  const text = waInput.value.trim();
  if (!text) return;
  waInput.value = '';

  appendWaBubble('outgoing', text);

  try {
    const res = await fetch('/api/whatsapp/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromNumber: '+1 (555) 234-5678',
        message: text,
        customerName: phoneCallerName.textContent.split(' ')[0]
      })
    });
    const data = await res.json();
    setTimeout(() => {
      appendWaBubble('incoming', data.text);
      refreshCRM();
    }, 600);
  } catch (err) {
    appendWaBubble('incoming', "Error: " + err.message);
  }
}

async function handlePhotoSend() {
  const isDental = state.activeNiche === 'dental';
  const photoDesc = isDental ? "Delta Dental Insurance Card (Front & Back)" : "Roof Storm Damage — Torn Shingles & Valley Leak";
  
  appendWaBubble('outgoing', `[📷 Photo Attached: ${photoDesc}]`);

  try {
    const res = await fetch('/api/whatsapp/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromNumber: '+1 (555) 234-5678',
        message: "Here is the photo you requested.",
        mediaAttachment: {
          type: "photo",
          description: photoDesc,
          url: "https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=400"
        },
        customerName: phoneCallerName.textContent.split(' ')[0]
      })
    });
    const data = await res.json();
    setTimeout(() => {
      appendWaBubble('incoming', data.text);
      refreshCRM();
    }, 800);
  } catch (err) {
    appendWaBubble('incoming', "Error uploading photo: " + err.message);
  }
}

function appendWaBubble(direction, text) {
  const div = document.createElement('div');
  div.className = `wa-bubble ${direction === 'outgoing' ? 'wa-outgoing' : 'wa-incoming'}`;
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `${text} <span class="wa-time">${time} ${direction === 'outgoing' ? '✓✓' : ''}</span>`;
  waChatBody.appendChild(div);
  waChatBody.scrollTop = waChatBody.scrollHeight;
}

// -------------------------------------------------------------
// Website Widget Logic
// -------------------------------------------------------------
async function handleWidgetSend() {
  const text = widgetInput.value.trim();
  if (!text) return;
  widgetInput.value = '';

  const userDiv = document.createElement('div');
  userDiv.className = 'w-msg w-user';
  userDiv.textContent = text;
  widgetMessages.appendChild(userDiv);
  widgetMessages.scrollTop = widgetMessages.scrollHeight;

  try {
    const res = await fetch('/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session_demo_1',
        message: text,
        phone: '+1 (555) 234-5678'
      })
    });
    const data = await res.json();

    const botDiv = document.createElement('div');
    botDiv.className = 'w-msg w-bot';
    botDiv.textContent = data.text;
    widgetMessages.appendChild(botDiv);
    widgetMessages.scrollTop = widgetMessages.scrollHeight;
    refreshCRM();
  } catch (err) {
    console.error(err);
  }
}

// -------------------------------------------------------------
// CRM & Activity Refresh
// -------------------------------------------------------------
async function refreshCRM() {
  try {
    const [leadsRes, aptRes, actRes] = await Promise.all([
      fetch('/api/crm/leads'),
      fetch('/api/crm/appointments'),
      fetch('/api/crm/activity')
    ]);

    const { leads } = await leadsRes.json();
    const { appointments } = await aptRes.json();
    const { activity } = await actRes.json();

    leadCount.textContent = `${leads.length} Leads`;
    aptCount.textContent = `${appointments.length} Bookings`;

    // Render Leads Table
    if (leads.length > 0) {
      leadsTableBody.innerHTML = leads.map(l => `
        <tr>
          <td><strong>${l.name}</strong></td>
          <td>${l.phone}</td>
          <td><span class="status-badge ${l.triageStatus === 'HIGH_EMERGENCY' ? 'status-emergency' : 'status-standard'}">${l.triageStatus}</span></td>
          <td>${l.media.length > 0 ? `📷 ${l.media.length} Photo(s)` : l.address ? `📍 ${l.address}` : 'Standard inquiry'}</td>
        </tr>
      `).join('');
    }

    // Render Appointments Table
    if (appointments.length > 0) {
      appointmentsTableBody.innerHTML = appointments.map(a => `
        <tr>
          <td><strong style="color:#a78bfa">${a.confirmationCode || 'BK-1029'}</strong></td>
          <td>${a.customerName}</td>
          <td>${a.service}</td>
          <td style="color:#34d399">${a.timeSlot}</td>
        </tr>
      `).join('');
    }

    // Render Activity Feed
    if (activity.length > 0) {
      activityFeed.innerHTML = activity.slice(0, 15).map(act => `
        <div class="feed-item">
          <span class="feed-badge ${act.priority === 'HIGH' ? 'feed-high' : act.channel === 'SYSTEM' ? 'feed-sys' : 'feed-act'}">${act.channel}</span>
          <span class="feed-text">${act.summary}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error("Failed to refresh CRM:", err);
  }
}

async function triggerAutomation(type) {
  try {
    const res = await fetch('/api/automations/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    alert(`⚡ Automation Executed:\n\n${data.message}`);
    await refreshCRM();
  } catch (err) {
    alert("Error executing automation: " + err.message);
  }
}

// -------------------------------------------------------------
// Interactive Live Client Demonstration Walkthrough
// -------------------------------------------------------------
const DEMO_SCENARIOS = {
  roofing: [
    {
      step: 1,
      title: "Step 1: Emergency After-Hours Call Inbound",
      progress: "25%",
      subtitle: "Saturday 8:45 PM — Storm damages residential roof; water pouring into living room.",
      html: `
        <div style="text-align:center; padding: 20px;">
          <div style="font-size: 54px; margin-bottom: 12px; animation: bounce 1s infinite alternate;">⛈️ 📞</div>
          <h4 style="color:#ef4444; font-size: 18px; margin-bottom: 8px;">Inbound Emergency Call: John Doe (+1-555-234-5678)</h4>
          <p style="color:#cbd5e1; font-size: 14px; max-width: 500px; margin: 0 auto;">
            <em>"Water is pouring through my ceiling right now from the storm! Can someone come out immediately?"</em>
          </p>
        </div>
      `,
      takeaway: "CRITICAL PROBLEM: 62% of after-hours roofing emergency calls go to voicemail. Homeowners call the next competitor in 60 seconds. Our AI answers in under 800ms."
    },
    {
      step: 2,
      title: "Step 2: Sub-Second AI Triage & Reassurance",
      progress: "50%",
      subtitle: "AI recognizes emergency leak keywords and triggers immediate emergency protocol.",
      html: `
        <div style="background:#1e1b4b; border: 1px solid #6366f1; border-radius: 12px; padding: 18px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <span style="color:#a78bfa; font-weight:700;">Sarah (24/7 AI Receptionist):</span>
            <span class="status-badge status-emergency">HIGH EMERGENCY DETECTED</span>
          </div>
          <p style="color:#e0e7ff; line-height: 1.5; font-size: 14px;">
            "I understand water is actively leaking inside your home! This is considered a priority emergency. I have notified our on-call dispatch crew. We have an emergency tarping team ready for Today (Immediate Emergency Priority). Shall I lock this emergency crew dispatch in right now for you?"
          </p>
        </div>
      `,
      takeaway: "AI triages the severity in real-time, alerts the emergency crew, and reserves the immediate tarping window before the caller even hangs up."
    },
    {
      step: 3,
      title: "Step 3: Instant WhatsApp Follow-up & Photo Intake",
      progress: "75%",
      subtitle: "AI automatically engages customer on WhatsApp to capture visual proof of damage.",
      html: `
        <div style="background:#0c1317; border: 1px solid #25d366; border-radius: 12px; padding: 16px;">
          <div style="color:#25d366; font-weight:700; margin-bottom: 8px;">💬 Verified WhatsApp Business Automation:</div>
          <div style="background:#202c33; padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 13px; color:#d1d7db;">
            <strong>Customer sent:</strong> [📷 Photo: Roof Storm Damage — Torn Shingles & Valley Leak]
          </div>
          <div style="background:#005c4b; padding: 10px; border-radius: 8px; font-size: 13px; color:#e9edef;">
            <strong>AI Response:</strong> "Thank you John! Our damage inspection tool detects significant shingle lifting and flashing compromise. I have attached this directly to your work order for our lead project manager."
          </div>
        </div>
      `,
      takeaway: "Eliminates phone tag. Collects damage photos directly via WhatsApp so the repair crew arrives with the exact materials needed."
    },
    {
      step: 4,
      title: "Step 4: Calendar Sync & CRM Record Created",
      progress: "100%",
      subtitle: "Work order locked, calendar invite dispatched, $12,000 replacement contract saved.",
      html: `
        <div style="text-align:center; padding: 16px;">
          <div style="font-size: 48px; color: #34d399; margin-bottom: 8px;">🎉 ✅</div>
          <h4 style="color:#34d399; font-size: 18px; margin-bottom: 6px;">Appointment Confirmed: Code BK-784910</h4>
          <p style="color:#cbd5e1; font-size: 13px; margin-bottom: 12px;">
            Emergency Tarp & Storm Mitigation — Today at 9:30 PM | Address: 742 Evergreen Terrace
          </p>
          <div style="display:inline-block; background:#1e293b; padding: 8px 16px; border-radius: 8px; font-size: 12px; color:#94a3b8;">
            ✓ Real-time SMS & WhatsApp Confirmation Dispatched<br>
            ✓ Business Owner & On-Call Crew Notified on Mobile<br>
            ✓ Google Calendar & CRM Synchronized
          </div>
        </div>
      `,
      takeaway: "RESULT: Zero dropped calls, 100% lead capture, and immediate customer relief. Converts a high-stress crisis into a loyal $15,000+ customer."
    }
  ]
};

function startInteractiveDemo() {
  state.demoStep = 0;
  demoModal.classList.remove('hidden');
  renderDemoStep();
}

function renderDemoStep() {
  const scenario = DEMO_SCENARIOS.roofing[state.demoStep];
  if (!scenario) {
    demoModal.classList.add('hidden');
    return;
  }

  demoStepIndicator.textContent = scenario.title;
  demoProgressFill.style.width = scenario.progress;
  demoStageScreen.innerHTML = scenario.html;
  demoTakeawayText.textContent = scenario.takeaway;

  btnNextDemoStep.textContent = state.demoStep === DEMO_SCENARIOS.roofing.length - 1 ? "Finish Demo ✓" : "Next Step →";
}

function advanceDemoStep() {
  if (state.demoStep < DEMO_SCENARIOS.roofing.length - 1) {
    state.demoStep++;
    renderDemoStep();
  } else {
    demoModal.classList.add('hidden');
  }
}

function togglePauseDemo() {
  btnPauseDemo.textContent = btnPauseDemo.textContent === "Pause" ? "Resume" : "Pause";
}
