/**
 * HavenDesk Embeddable Website Widget
 * Minimalist, calm, responsive 24/7 AI Receptionist widget for client websites.
 * Usage: <script src="https://havendesk.com/widget.js" data-haven-key="pk_live_..."></script>
 */

(function() {
  const currentScript = document.currentScript;
  const KEY = currentScript ? currentScript.getAttribute('data-haven-key') : 'pk_live_vanguard_roofing_key';
  const SCRIPT_URL = currentScript ? currentScript.src : window.location.origin;
  const BASE_URL = SCRIPT_URL.substring(0, SCRIPT_URL.indexOf('/', 8));

  // Create container
  const container = document.createElement('div');
  container.id = 'havendesk-widget-root';
  container.innerHTML = `
    <style>
      #haven-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 54px;
        height: 54px;
        background-color: #0d9488;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
        z-index: 999999;
        transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1), background-color 160ms;
      }
      #haven-bubble:hover {
        transform: scale(1.06);
        background-color: #0f766e;
      }
      #haven-bubble svg {
        width: 26px;
        height: 26px;
      }
      #haven-box {
        position: fixed;
        bottom: 90px;
        right: 24px;
        width: 360px;
        height: 480px;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      #haven-header {
        background: #f8fafc;
        padding: 14px 18px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #haven-biz { font-size: 14px; font-weight: 700; color: #0f172a; }
      #haven-status { font-size: 11.5px; color: #0d9488; display: flex; align-items: center; gap: 4px; }
      #haven-close { background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; }
      #haven-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.45; }
      .haven-msg { padding: 9px 13px; border-radius: 8px; max-width: 84%; }
      .haven-bot { background: #f1f5f9; color: #0f172a; align-self: flex-start; }
      .haven-user { background: #0d9488; color: #ffffff; align-self: flex-end; }
      #haven-footer { padding: 10px 14px; background: #ffffff; border-top: 1px solid #e2e8f0; display: flex; gap: 8px; }
      #haven-input { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 13px; outline: none; }
      #haven-input:focus { border-color: #0d9488; }
      #haven-send { background: #0d9488; border: none; color: #fff; padding: 0 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    </style>

    <div id="haven-bubble" title="Chat with 24/7 Receptionist">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </div>

    <div id="haven-box">
      <div id="haven-header">
        <div>
          <div id="haven-biz">24/7 Receptionist</div>
          <div id="haven-status">● Online Now</div>
        </div>
        <button id="haven-close">&times;</button>
      </div>
      <div id="haven-messages">
        <div class="haven-msg haven-bot" id="haven-greeting">Hi! How can we assist you with our services or scheduling today?</div>
      </div>
      <div id="haven-footer">
        <input type="text" id="haven-input" placeholder="Type a message...">
        <button id="haven-send">Send</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  const bubble = document.getElementById('haven-bubble');
  const box = document.getElementById('haven-box');
  const close = document.getElementById('haven-close');
  const msgs = document.getElementById('haven-messages');
  const input = document.getElementById('haven-input');
  const send = document.getElementById('haven-send');
  const bizTitle = document.getElementById('haven-biz');
  const greetingEl = document.getElementById('haven-greeting');

  // Verify widget key
  fetch(`${BASE_URL}/api/v1/widget/check?key=${encodeURIComponent(KEY)}`)
    .then(r => r.json())
    .then(data => {
      if (data.active) {
        bizTitle.textContent = data.businessName;
        if (data.persona && data.persona.greeting) {
          greetingEl.textContent = data.persona.greeting;
        }
      } else if (data.fallback) {
        bizTitle.textContent = data.businessName || '24/7 Receptionist';
        const statusEl = document.getElementById('haven-status');
        if (statusEl) {
          statusEl.textContent = '○ Offline';
          statusEl.style.color = '#64748b';
        }
        greetingEl.textContent = data.message || 'Receptionist temporarily unavailable, please call back soon.';
        input.placeholder = 'Receptionist temporarily offline';
        input.disabled = true;
        send.disabled = true;
        send.style.opacity = '0.5';
        send.style.cursor = 'not-allowed';
      } else {
        container.style.display = 'none';
      }
    })
    .catch(() => {});

  bubble.onclick = () => { box.style.display = box.style.display === 'flex' ? 'none' : 'flex'; };
  close.onclick = () => { box.style.display = 'none'; };

  function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const userBubble = document.createElement('div');
    userBubble.className = 'haven-msg haven-user';
    userBubble.textContent = text;
    msgs.appendChild(userBubble);
    msgs.scrollTop = msgs.scrollHeight;

    fetch(`${BASE_URL}/api/v1/widget/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: KEY,
        message: text,
        sessionId: 'web_' + Math.random().toString(36).substring(7)
      })
    })
    .then(r => r.json())
    .then(data => {
      const botBubble = document.createElement('div');
      botBubble.className = 'haven-msg haven-bot';
      botBubble.textContent = data.text;
      msgs.appendChild(botBubble);
      msgs.scrollTop = msgs.scrollHeight;
    })
    .catch(() => {});
  }

  send.onclick = sendMessage;
  input.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };
})();
