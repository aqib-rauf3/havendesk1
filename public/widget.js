/**
 * OmniReceptionist AI — Standalone Embeddable Website Widget
 * Usage: <script src="https://your-domain.com/widget.js" data-niche="roofing"></script>
 */
(function() {
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : 'http://localhost:3000';
  const BASE_URL = SCRIPT_URL.substring(0, SCRIPT_URL.lastIndexOf('/'));

  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'omni-receptionist-widget';
  widgetContainer.innerHTML = `
    <style>
      #omni-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 58px;
        height: 58px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
        z-index: 999999;
        transition: transform 0.2s ease;
      }
      #omni-bubble:hover { transform: scale(1.08); }
      #omni-box {
        position: fixed;
        bottom: 92px;
        right: 24px;
        width: 340px;
        height: 440px;
        background: #111827;
        color: #f3f4f6;
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
        border: 1px solid #374151;
      }
      #omni-header {
        background: #1f2937;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #374151;
      }
      #omni-header strong { font-size: 14px; }
      #omni-header span { font-size: 11px; color: #10b981; }
      #omni-close { background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer; }
      #omni-msgs { flex: 1; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
      .omni-m { padding: 8px 12px; border-radius: 10px; max-width: 85%; line-height: 1.4; }
      .omni-bot { background: #374151; align-self: flex-start; }
      .omni-user { background: #3b82f6; color: #fff; align-self: flex-end; }
      #omni-footer { padding: 10px; background: #1f2937; display: flex; gap: 6px; border-top: 1px solid #374151; }
      #omni-input { flex: 1; background: #111827; border: 1px solid #4b5563; border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 13px; outline: none; }
      #omni-send { background: #3b82f6; border: none; color: #fff; border-radius: 6px; padding: 0 14px; cursor: pointer; font-size: 13px; }
    </style>

    <div id="omni-bubble" title="Chat with 24/7 AI Receptionist">💬</div>
    <div id="omni-box">
      <div id="omni-header">
        <div>
          <strong id="omni-biz-name">24/7 AI Receptionist</strong><br>
          <span>● Online Now</span>
        </div>
        <button id="omni-close">&times;</button>
      </div>
      <div id="omni-msgs">
        <div class="omni-m omni-bot">Hi there! How can I assist you with scheduling or answering questions today?</div>
      </div>
      <div id="omni-footer">
        <input type="text" id="omni-input" placeholder="Type a message...">
        <button id="omni-send">Send</button>
      </div>
    </div>
  `;

  document.body.appendChild(widgetContainer);

  const bubble = document.getElementById('omni-bubble');
  const box = document.getElementById('omni-box');
  const close = document.getElementById('omni-close');
  const msgs = document.getElementById('omni-msgs');
  const input = document.getElementById('omni-input');
  const send = document.getElementById('omni-send');

  bubble.onclick = () => { box.style.display = box.style.display === 'flex' ? 'none' : 'flex'; };
  close.onclick = () => { box.style.display = 'none'; };

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const u = document.createElement('div');
    u.className = 'omni-m omni-user';
    u.textContent = text;
    msgs.appendChild(u);
    msgs.scrollTop = msgs.scrollHeight;

    try {
      const res = await fetch(`${BASE_URL}/api/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: 'web_' + Math.random().toString(36).substring(7) })
      });
      const data = await res.json();
      const b = document.createElement('div');
      b.className = 'omni-m omni-bot';
      b.textContent = data.text;
      msgs.appendChild(b);
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      console.error(e);
    }
  }

  send.onclick = sendMessage;
  input.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };
})();
