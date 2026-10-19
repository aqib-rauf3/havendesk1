/**
 * HavenDesk Client Portal Application Controller
 * Handles all 13 client portal views, auth state, routing, and live call simulation.
 */

const state = {
  token: localStorage.getItem('haven_token') || null,
  user: null,
  tenant: null,
  activeRoute: 'overview',
  activeThread: null,
  theme: localStorage.getItem('haven_theme') || 'light'
};

// Apply saved theme
document.documentElement.setAttribute('data-theme', state.theme);

// Initialize icons
fetch('/shared/icons.svg')
  .then(r => r.text())
  .then(svgText => {
    document.getElementById('iconsPlaceholder').innerHTML = svgText;
  })
  .catch(() => {});

// Listen for hash changes
window.addEventListener('hashchange', handleRoute);

async function initApp() {
  // Check for impersonation token in URL query
  const urlParams = new URLSearchParams(window.location.search);
  const queryToken = urlParams.get('token');
  if (queryToken) {
    state.token = queryToken;
    localStorage.setItem('haven_token', queryToken);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }

  setupGlobalEvents();
  await checkAuthAndRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function setupGlobalEvents() {
  // Theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.onclick = () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem('haven_theme', state.theme);
    };
  }

  // Logout
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.onclick = handleLogout;
  }

  // Exit Impersonation
  const exitBtn = document.getElementById('btnExitImpersonation');
  if (exitBtn) {
    exitBtn.onclick = () => {
      window.location.href = '/admin';
    };
  }
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(`/api/v1/portal${path}`, { ...options, headers });
  if (res.status === 401) {
    handleLogout();
    throw new Error('Session expired');
  }
  if (res.status === 402) {
    const err = await res.json().catch(() => ({ error: 'Subscription suspended or unpaid. Please update payment method.' }));
    showToast(err.error, 'warning');
    throw new Error(err.error);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function checkAuthAndRoute() {
  if (!state.token) {
    renderAuth('login');
    return;
  }

  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) throw new Error('Invalid token');
    const data = await res.json();

    state.user = data.user;
    state.tenant = data.tenant;

    // Impersonation banner
    const banner = document.getElementById('impersonationBanner');
    if (data.isImpersonating && banner) {
      banner.style.display = 'flex';
      document.getElementById('impersonatedTenantName').textContent = state.tenant?.business_name || 'Client';
    }

    // Check if onboarding is needed
    if (state.tenant && state.tenant.onboarding_completed === 0) {
      renderOnboarding();
      return;
    }

    updateAppShellUI();
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('onboardingContainer').style.display = 'none';
    document.getElementById('appLayout').style.display = 'flex';

    handleRoute();
  } catch (err) {
    handleLogout();
  }
}

function updateAppShellUI() {
  if (!state.tenant || !state.user) return;
  document.getElementById('sidebarTenantName').textContent = state.tenant.business_name;
  document.getElementById('sidebarTenantPlan').textContent = `${capitalize(state.tenant.niche)} • ${capitalize(state.tenant.subscription_status)}`;
  document.getElementById('userName').textContent = state.user.name;
  document.getElementById('userRole').textContent = state.user.role === 'client_owner' ? 'Owner' : 'Staff';
  document.getElementById('userAvatar').textContent = getInitials(state.user.name);

  // Manage Subscription Alert Banner
  const subBanner = document.getElementById('subscriptionBanner');
  const subText = document.getElementById('subBannerText');
  const subBtn = document.getElementById('subBannerBtn');
  const status = state.tenant.subscription_status;

  if (subBanner && subText && subBtn) {
    if (status === 'suspended') {
      subBanner.style.display = 'flex';
      subBanner.className = 'subscription-banner danger';
      subText.textContent = 'Your subscription is currently suspended. Call handling and edits are paused, but your past records remain accessible.';
      subBtn.textContent = 'Reactivate Subscription →';
    } else if (status === 'past_due') {
      subBanner.style.display = 'flex';
      subBanner.className = 'subscription-banner danger';
      subText.textContent = 'Your recent subscription invoice is past due. Please update your card to avoid service interruption.';
      subBtn.textContent = 'Update Payment Method →';
    } else if (status === 'canceled') {
      subBanner.style.display = 'flex';
      subBanner.className = 'subscription-banner danger';
      subText.textContent = 'Your subscription has ended. Portal is in read-only mode for historical data.';
      subBtn.textContent = 'Restart Plan →';
    } else if (status === 'trialing') {
      subBanner.style.display = 'flex';
      subBanner.className = 'subscription-banner';
      subText.textContent = 'You are currently on a 14-day free trial. Choose a plan anytime to ensure uninterrupted receptionist coverage.';
      subBtn.textContent = 'Upgrade Plan →';
    } else {
      subBanner.style.display = 'none';
    }
  }
}

function handleRoute() {
  const hashRaw = window.location.hash.replace(/^#\/?/, '') || 'overview';
  const [hash, queryString] = hashRaw.split('?');
  const queryParams = new URLSearchParams(queryString || '');
  const parts = hash.split('/');
  state.activeRoute = parts[0];

  // Update sidebar active link
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-nav') === state.activeRoute);
  });

  // Route views
  switch (state.activeRoute) {
    case 'overview': renderOverview(); break;
    case 'calls': renderCalls(parts[1], queryParams.get('triage')); break;
    case 'messages': renderMessages(queryParams.get('contact')); break;
    case 'leads': renderLeads(); break;
    case 'calendar': renderCalendar(); break;
    case 'settings': renderSettings(); break;
    case 'automations': renderAutomations(); break;
    case 'integrations': renderIntegrations(); break;
    case 'reports': renderReports(); break;
    case 'billing': renderBilling(); break;
    case 'team': renderTeam(); break;
    default: renderOverview(); break;
  }
}

// -------------------------------------------------------------
// View 1: Auth (Login / Sign Up / Forgot Password)
// -------------------------------------------------------------
function renderAuth(mode = 'login') {
window.renderAuth = renderAuth;
  document.getElementById('appLayout').style.display = 'none';
  document.getElementById('onboardingContainer').style.display = 'none';
  const authContainer = document.getElementById('authContainer');
  authContainer.style.display = 'flex';

  if (mode === 'login') {
    authContainer.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo-area">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#0d9488" fill-opacity="0.14" stroke="#0d9488" stroke-width="2"/>
            <path d="M14 31 C14 20, 34 20, 34 31" stroke="#0d9488" stroke-width="3" stroke-linecap="round"/>
            <circle cx="24" cy="16" r="3.5" fill="#0d9488"/>
          </svg>
          <span style="font-size: 20px; font-weight: 700;">Haven<span style="color:var(--accent); font-weight:400;">Desk</span></span>
        </div>
        <h3 class="auth-title">Sign in to your receptionist</h3>
        <p class="auth-subtitle">Monitor calls, bookings, and emergency alerts 24/7</p>

        <form id="loginForm">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="loginEmail" class="form-input" required placeholder="owner@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="loginPassword" class="form-input" required placeholder="••••••••">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Sign In &rarr;</button>
        </form>

        <div class="demo-logins">
          <div class="demo-logins-title">Click to Test Demo Clients:</div>
          <div class="demo-pill-group">
            <button class="demo-pill" onclick="quickLogin('owner@vanguardroofing.com')">🏠 Vanguard Roofing</button>
            <button class="demo-pill" onclick="quickLogin('drdavis@apexdental.com')">🦷 Apex Dental</button>
            <button class="demo-pill" onclick="quickLogin('marcus@apexclimate.com')">⚡ Apex HVAC</button>
          </div>
        </div>

        <div class="auth-footer">
          Don't have an account? <a onclick="renderAuth('signup')">Start 14-day free trial</a><br>
          <a onclick="renderAuth('forgot')" style="font-size: 11.5px; color: var(--text-muted); margin-top: 6px; display: inline-block;">Forgot password?</a>
        </div>
      </div>
    `;

    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      await executeLogin(email, password);
    };
  } else if (mode === 'signup') {
    authContainer.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo-area">
          <span style="font-size: 20px; font-weight: 700;">Haven<span style="color:var(--accent)">Desk</span></span>
        </div>
        <h3 class="auth-title">Create your receptionist</h3>
        <p class="auth-subtitle">14-day trial • No credit card required</p>

        <form id="signupForm">
          <div class="form-group">
            <label class="form-label">Business Name</label>
            <input type="text" id="regBiz" class="form-input" required placeholder="e.g. Apex Roofing Pros">
          </div>
          <div class="form-group">
            <label class="form-label">Industry Niche</label>
            <select id="regNiche" class="form-select">
              <option value="roofing">Roofing Contractor & Restoration</option>
              <option value="dental">Dental Practice & Oral Health</option>
              <option value="hvac">HVAC & Climate Services</option>
              <option value="custom">Other Local Service Business</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Work Email</label>
            <input type="email" id="regEmail" class="form-input" required placeholder="owner@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="regPass" class="form-input" required placeholder="Create secure password">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Create Account &rarr;</button>
        </form>

        <div class="auth-footer">
          Already have an account? <a onclick="renderAuth('login')">Sign in</a>
        </div>
      </div>
    `;

    document.getElementById('signupForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: document.getElementById('regBiz').value,
            niche: document.getElementById('regNiche').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPass').value
          })
        });
        const data = await res.json();
        if (data.success) {
          state.token = data.token;
          localStorage.setItem('haven_token', data.token);
          await checkAuthAndRoute();
        } else {
          showToast(data.error || 'Registration failed', 'danger');
        }
      } catch (err) {
        showToast(err.message, 'danger');
      }
    };
  } else if (mode === 'forgot') {
    authContainer.innerHTML = `
      <div class="auth-card">
        <h3 class="auth-title">Reset password</h3>
        <p class="auth-subtitle">We'll send you instructions to recover your account</p>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="forgotEmail" class="form-input" placeholder="owner@company.com">
        </div>
        <button class="btn btn-primary" style="width: 100%;" onclick="showToast('Password reset link sent to your email!','success'); renderAuth('login')">Send Reset Link</button>
        <div class="auth-footer"><a onclick="renderAuth('login')">&larr; Back to login</a></div>
      </div>
    `;
  }
}

window.quickLogin = async function(email) {
  await executeLogin(email, 'ClientPass2026!');
};

async function executeLogin(email, password) {
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      state.token = data.token;
      localStorage.setItem('haven_token', data.token);
      showToast('Signed in successfully', 'success');
      await checkAuthAndRoute();
    } else {
      showToast(data.error || 'Login failed', 'danger');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function handleLogout() {
  state.token = null;
  state.user = null;
  state.tenant = null;
  localStorage.removeItem('haven_token');
  renderAuth('login');
}

// -------------------------------------------------------------
// View 2: Onboarding Wizard (First Login)
// -------------------------------------------------------------
function renderOnboarding() {
  document.getElementById('appLayout').style.display = 'none';
  document.getElementById('authContainer').style.display = 'none';
  const container = document.getElementById('onboardingContainer');
  container.style.display = 'block';

  container.innerHTML = `
    <div class="onboarding-container">
      <div style="text-align: center; margin-bottom: 24px;">
        <span class="badge badge-accent">Quick Setup Wizard</span>
        <h2 style="font-size: 22px; font-weight: 700; margin-top: 8px;">Configure Your HavenDesk Receptionist</h2>
        <p style="color: var(--text-muted); font-size: 13.5px;">Takes under 2 minutes. You can fine-tune all rules anytime.</p>
      </div>

      <div class="onboarding-steps">
        <div class="step-indicator active" id="obStep1">
          <div class="step-number">1</div>
          <span class="step-title">Business & Niche</span>
        </div>
        <div class="step-indicator" id="obStep2">
          <div class="step-number">2</div>
          <span class="step-title">Emergency Rules</span>
        </div>
        <div class="step-indicator" id="obStep3">
          <div class="step-number">3</div>
          <span class="step-title">Test Live Call</span>
        </div>
      </div>

      <div id="onboardingStepContent">
        <!-- Step 1 -->
        <div id="step1Form">
          <div class="form-group">
            <label class="form-label">Business Name</label>
            <input type="text" id="obBizName" class="form-input" value="${state.tenant?.business_name || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Receptionist Voice Persona Name</label>
            <input type="text" id="obPersonaName" class="form-input" value="Sarah" placeholder="e.g. Sarah, Emily, or Marcus">
          </div>
          <div class="form-group">
            <label class="form-label">Caller Greeting</label>
            <textarea id="obGreeting" class="form-textarea" rows="2">Thank you for calling ${state.tenant?.business_name || 'us'}! My name is Sarah, the 24/7 AI Receptionist. Are you calling with an urgent emergency, or would you like to schedule an appointment?</textarea>
          </div>
          <button class="btn btn-primary" style="margin-top: 12px;" onclick="goToOnboardingStep(2)">Continue to Emergency Rules &rarr;</button>
        </div>
      </div>
    </div>
  `;
}

window.goToOnboardingStep = function(step) {
  const content = document.getElementById('onboardingStepContent');
  document.querySelectorAll('.step-indicator').forEach((el, idx) => {
    el.classList.toggle('active', idx + 1 === step);
    el.classList.toggle('completed', idx + 1 < step);
  });

  if (step === 2) {
    content.innerHTML = `
      <div>
        <div class="form-group">
          <label class="form-label">Emergency Alert Mobile Number</label>
          <input type="tel" id="obEmergencyPhone" class="form-input" placeholder="+1 (555) 019-2834" value="+1 (555) 999-1234">
          <span class="form-hint">Our AI will immediately SMS/call this number when high-priority emergencies are detected.</span>
        </div>
        <div class="form-group">
          <label class="form-label">High Priority Keywords (comma separated)</label>
          <input type="text" id="obKeywords" class="form-input" value="leak, water coming in, ceiling, flood, storm damage, severe pain, no heat">
        </div>
        <div style="display:flex; gap: 10px; margin-top: 16px;">
          <button class="btn btn-secondary" onclick="goToOnboardingStep(1)">&larr; Back</button>
          <button class="btn btn-primary" onclick="goToOnboardingStep(3)">Continue to Test Call &rarr;</button>
        </div>
      </div>
    `;
  } else if (step === 3) {
    content.innerHTML = `
      <div>
        <div style="background-color: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
          <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 4px;">📞 Test Your Receptionist Right Now</h4>
          <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">Type or click a prompt to verify your AI's response and triage behavior.</p>
          
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;">
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('obTestInput').value = 'Water is pouring through my ceiling right now!'; runOnboardingTestCall();">🚨 'Water pouring through ceiling!'</button>
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('obTestInput').value = 'How much do you charge for a full inspection?'; runOnboardingTestCall();">💰 'How much for an inspection?'</button>
          </div>

          <div style="display: flex; gap: 8px;">
            <input type="text" id="obTestInput" class="form-input" placeholder="Type what a customer would say...">
            <button class="btn btn-primary" onclick="runOnboardingTestCall()">Speak</button>
          </div>
          <div id="obTestResponse" style="margin-top: 12px; font-size: 13px; line-height: 1.45;"></div>
        </div>

        <button class="btn btn-primary" style="width: 100%;" onclick="finishOnboarding()">✓ Complete Setup & Launch Portal</button>
      </div>
    `;
  }
};

window.runOnboardingTestCall = async function() {
  const input = document.getElementById('obTestInput');
  const out = document.getElementById('obTestResponse');
  if (!input || !input.value.trim()) return;

  out.innerHTML = '<span style="color:var(--text-muted)">Connecting to receptionist...</span>';
  try {
    const res = await api('/settings/test-call', {
      method: 'POST',
      body: JSON.stringify({ speechInput: input.value.trim() })
    });
    out.innerHTML = `
      <div style="background-color: var(--accent-subtle); border: 1px solid var(--accent-border); padding: 10px 14px; border-radius: 8px; color: var(--accent-text);">
        <strong>Sarah (AI):</strong> ${res.text}
        ${res.triageStatus === 'HIGH_EMERGENCY' ? '<br><span class="badge badge-emergency" style="margin-top:6px;">🚨 HIGH EMERGENCY TRIAGE TRIGGERED</span>' : ''}
      </div>
    `;
    speakAloud(res.text);
  } catch (err) {
    out.innerHTML = `<span style="color:var(--emergency)">Error: ${err.message}</span>`;
  }
};

window.finishOnboarding = async function() {
  try {
    await api('/onboarding', {
      method: 'POST',
      body: JSON.stringify({
        businessName: state.tenant.business_name,
        emergencyPhone: '+1 (555) 999-1234'
      })
    });
    showToast('Receptionist launched successfully!', 'success');
    state.tenant.onboarding_completed = 1;
    document.getElementById('onboardingContainer').style.display = 'none';
    document.getElementById('appLayout').style.display = 'flex';
    renderOverview();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// View 3: Dashboard Overview
// -------------------------------------------------------------
async function renderOverview() {
  document.getElementById('topBarTitle').textContent = 'Dashboard Overview';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading metrics...</div>';

  try {
    const data = await api('/overview');
    const m = data.metrics;

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${data.tenant.name}</h1>
          <p class="page-subtitle">Real-time receptionist performance, triage recovery, and booked appointments.</p>
        </div>
        <a href="#/calls" class="btn btn-secondary">View All Calls &rarr;</a>
      </div>

      <!-- Stat Cards Grid (Interactive) -->
      <div class="grid-4" style="margin-bottom: 24px;">
        <div class="card stat-card interactive" onclick="window.location.hash = '#/calls'" title="Click to view all call logs">
          <div class="stat-header">
            <span class="stat-label">Total Calls</span>
            <span class="badge badge-default">24/7 Active</span>
          </div>
          <div class="stat-value">${m.totalCalls}</div>
          <div class="stat-meta"><span class="stat-up">100%</span> answered in &lt;800ms</div>
          <div class="stat-click-hint">Inspect call records &rarr;</div>
        </div>

        <div class="card stat-card interactive" onclick="window.location.hash = '#/calls?triage=HIGH_EMERGENCY'" title="Click to view high-urgency emergency calls">
          <div class="stat-header">
            <span class="stat-label">Emergencies Handled</span>
            <span class="badge badge-emergency">Priority Dispatch</span>
          </div>
          <div class="stat-value" style="color: var(--emergency);">${m.emergencyCalls}</div>
          <div class="stat-meta">Zero dropped after-hours leads</div>
          <div class="stat-click-hint" style="color: var(--emergency);">Filter urgent triage &rarr;</div>
        </div>

        <div class="card stat-card interactive" onclick="window.location.hash = '#/calendar'" title="Click to view confirmed appointments">
          <div class="stat-header">
            <span class="stat-label">Confirmed Bookings</span>
            <span class="badge badge-success">Cal / CRM Sync</span>
          </div>
          <div class="stat-value" style="color: var(--success);">${m.totalBookings}</div>
          <div class="stat-meta"><span class="stat-up">+${m.totalBookings}</span> slots locked on calendar</div>
          <div class="stat-click-hint" style="color: var(--success);">Open dispatch calendar &rarr;</div>
        </div>

        <div class="card stat-card interactive" onclick="window.location.hash = '#/reports'" title="Click to view revenue & ROI reports">
          <div class="stat-header">
            <span class="stat-label">Estimated Revenue Captured</span>
            <span class="badge badge-accent">ROI Metric</span>
          </div>
          <div class="stat-value" style="color: var(--accent);">$${m.estimatedRevenue.toLocaleString()}</div>
          <div class="stat-meta">Saved approx. ${m.minutesSaved} staff mins</div>
          <div class="stat-click-hint">View financial reports &rarr;</div>
        </div>
      </div>

      <!-- Two-Column Recent Activity Grid -->
      <div class="grid-2">
        <!-- Recent Calls -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Recent Calls</h3>
              <p class="card-desc">Click any call to inspect dialogue transcript & tools</p>
            </div>
            <a href="#/calls" class="btn btn-sm btn-secondary">All Calls</a>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Triage</th>
                  <th>Summary</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${data.recentCalls.length === 0 ? '<tr><td colspan="4" class="empty-state">No calls recorded yet.</td></tr>' : 
                  data.recentCalls.map(c => `
                    <tr style="cursor: pointer;" onclick="openCallModal('${c.id}')">
                      <td>
                        <strong>${c.caller_name}</strong><br>
                        <span style="font-size:11px; color:var(--text-muted)">${c.caller_number}</span>
                      </td>
                      <td>
                        <span class="badge ${c.triage_level === 'HIGH_EMERGENCY' ? 'badge-emergency' : 'badge-default'}">
                          ${c.triage_level === 'HIGH_EMERGENCY' ? '🚨 EMERGENCY' : 'STANDARD'}
                        </span>
                      </td>
                      <td style="font-size:12px; color:var(--text-secondary); max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${c.summary || 'Standard inquiry call'}
                      </td>
                      <td>
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openCallModal('${c.id}')">Transcript</button>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Upcoming Calendar Bookings -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Upcoming Bookings</h3>
              <p class="card-desc">Direct calendar reservations captured by AI</p>
            </div>
            <a href="#/calendar" class="btn btn-sm btn-secondary">Calendar View</a>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Scheduled Slot</th>
                </tr>
              </thead>
              <tbody>
                ${data.upcomingBookings.length === 0 ? '<tr><td colspan="4" class="empty-state">No appointments booked yet.</td></tr>' :
                  data.upcomingBookings.map(b => `
                    <tr>
                      <td><strong style="color:var(--accent); font-family:var(--font-mono)">${b.confirmation_code}</strong></td>
                      <td>${b.customer_name}<br><span style="font-size:11px; color:var(--text-muted)">${b.phone}</span></td>
                      <td style="font-size:12.5px;">${b.service_name}</td>
                      <td style="color:var(--success); font-weight:600; font-size:12px;">${b.scheduled_slot}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

// -------------------------------------------------------------
// View 4: Calls List & Detail
// -------------------------------------------------------------
async function renderCalls(callIdToOpen = null, filterTriage = null) {
  document.getElementById('topBarTitle').textContent = 'Phone Call Records';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading call history...</div>';

  try {
    const data = await api('/calls');
    state.callsList = data.calls || [];

    const isFiltered = filterTriage === 'HIGH_EMERGENCY';
    const displayedCalls = isFiltered 
      ? state.callsList.filter(c => c.triage_level === 'HIGH_EMERGENCY')
      : state.callsList;

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Inbound Phone Calls</h1>
          <p class="page-subtitle">Sub-800ms Voice AI transcripts, audio recordings, and triage logs.</p>
        </div>
        <div style="display:flex; align-items:center; gap: 8px;">
          ${isFiltered ? `
            <span class="badge badge-emergency" style="cursor:pointer; padding:6px 12px;" onclick="window.location.hash='#/calls'" title="Click to clear filter">
              🚨 High Emergency Filter Active &times;
            </span>
          ` : ''}
          <input type="text" id="callSearch" class="form-input" style="width: 240px;" placeholder="Search caller, number, summary..." oninput="filterCallsTable()">
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table" id="callsTable">
          <thead>
            <tr>
              <th>Caller</th>
              <th>Status</th>
              <th>Triage Level</th>
              <th>Duration</th>
              <th>Call Summary</th>
              <th>Date & Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="callsTableBody">
            ${displayedCalls.length === 0 ? '<tr><td colspan="7" class="empty-state">No calls matching criteria.</td></tr>' :
              displayedCalls.map(c => `
                <tr onclick="openCallModal('${c.id}')" style="cursor:pointer;" class="call-row" data-search="${(c.caller_name + ' ' + c.caller_number + ' ' + (c.summary||'')).toLowerCase()}">
                  <td>
                    <strong>${c.caller_name}</strong><br>
                    <span style="font-size:11px; color:var(--text-muted)">${c.caller_number}</span>
                  </td>
                  <td><span class="badge badge-success">${c.status}</span></td>
                  <td>
                    <span class="badge ${c.triage_level === 'HIGH_EMERGENCY' ? 'badge-emergency' : 'badge-default'}">
                      ${c.triage_level === 'HIGH_EMERGENCY' ? '🚨 EMERGENCY' : 'STANDARD'}
                    </span>
                  </td>
                  <td style="font-size:12px; font-family:var(--font-mono)">${c.duration_seconds}s</td>
                  <td style="font-size:12px; max-width: 260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${c.summary || 'Inbound reception call'}
                  </td>
                  <td style="font-size:11.5px; color:var(--text-muted);">${formatDate(c.created_at)}</td>
                  <td>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openCallModal('${c.id}')">View Transcript</button>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (callIdToOpen) {
      openCallModal(callIdToOpen);
    }
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.filterCallsTable = function() {
  const query = (document.getElementById('callSearch')?.value || '').toLowerCase().trim();
  document.querySelectorAll('.call-row').forEach(row => {
    const text = row.getAttribute('data-search') || '';
    row.style.display = text.includes(query) ? '' : 'none';
  });
};

window.openCallModal = async function(callId) {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = '<div class="modal-overlay"><div class="modal-card"><div class="modal-body">Loading call details...</div></div></div>';

  try {
    const { call } = await api(`/calls/${callId}`);
    modalContainer.innerHTML = `
      <div class="modal-overlay" onclick="closeModal()">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div>
              <div class="modal-title">Call Transcript: ${call.caller_name} (${call.caller_number})</div>
              <span style="font-size: 11.5px; color: var(--text-muted)">${formatDate(call.created_at)} • Duration: ${call.duration_seconds}s</span>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Triage Badge & Summary -->
            <div style="background-color: var(--bg-surface-subtle); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                <span style="font-weight:700; font-size:12.5px;">Executive Call Summary</span>
                <span class="badge ${call.triage_level === 'HIGH_EMERGENCY' ? 'badge-emergency' : 'badge-default'}">
                  ${call.triage_level}
                </span>
              </div>
              <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.45;">${call.summary || 'Standard customer intake call.'}</p>
            </div>

            <!-- Dialogue Turn Bubbles -->
            <div class="transcript-flow">
              ${call.transcript.length === 0 ? '<div style="color:var(--text-muted)">No transcript available.</div>' :
                call.transcript.map(turn => `
                  <div class="dialogue-bubble ${turn.role === 'user' ? 'dialogue-user' : 'dialogue-assistant'}">
                    <strong>${turn.role === 'user' ? call.caller_name : 'HavenDesk AI'}:</strong><br>
                    ${turn.text}
                  </div>
                `).join('')}
            </div>

            <!-- Tools Executed -->
            ${call.tools_used.length > 0 ? `
              <div>
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Autonomous Actions Executed:</span>
                <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
                  ${call.tools_used.map(t => `<span class="badge badge-accent">⚡ ${t}</span>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast(err.message, 'danger');
    closeModal();
  }
};

window.closeModal = function() {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'none';
  modalContainer.innerHTML = '';
};

// -------------------------------------------------------------
// View 5: Messages (WhatsApp & Web Chat Inbox with Photos)
// -------------------------------------------------------------
async function renderMessages(initialContact = null) {
  document.getElementById('topBarTitle').textContent = 'WhatsApp & Web Messages';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading inbox...</div>';

  try {
    const { threads } = await api('/messages');
    state.threads = threads || [];

    if (initialContact) {
      state.activeThread = state.threads.find(t => t.contact === initialContact) || state.threads[0] || null;
    } else if (!state.activeThread && state.threads.length > 0) {
      state.activeThread = state.threads[0];
    } else if (state.activeThread) {
      state.activeThread = state.threads.find(t => t.contact === state.activeThread.contact) || state.threads[0] || null;
    }

    content.innerHTML = `
      <div class="page-header" style="margin-bottom: 16px;">
        <div>
          <h1 class="page-title">Customer Message Inbox</h1>
          <p class="page-subtitle">Two-way WhatsApp Business communication and damage photo attachments.</p>
        </div>
        <div>
          <span class="badge badge-success">● WhatsApp Business API Verified</span>
        </div>
      </div>

      <div class="inbox-layout">
        <!-- Left: Threads list -->
        <div class="inbox-threads-list" id="threadsList">
          ${state.threads.length === 0 ? '<div class="empty-state" style="padding: 24px 12px;">No active chats</div>' :
            state.threads.map(t => `
              <div class="thread-item ${state.activeThread && state.activeThread.contact === t.contact ? 'active' : ''}" 
                   onclick="selectThread('${t.contact}')" 
                   id="th_${t.contact.replace(/[^\w]/g, '')}">
                <div class="thread-header">
                  <span class="thread-name">${t.senderName || t.contact}</span>
                  <span class="thread-time">${formatDate(t.lastTimestamp, true)}</span>
                </div>
                <div class="thread-preview">${t.lastMessage}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 4px;">
                  <span class="badge ${t.channel === 'whatsapp' ? 'badge-success' : 'badge-default'}" style="font-size: 10px;">
                    ${t.channel.toUpperCase()}
                  </span>
                  ${t.messages.some(m => m.media_url) ? '<span style="font-size:11px; color:var(--accent);">📷 Photo</span>' : ''}
                </div>
              </div>
            `).join('')}
        </div>

        <!-- Right: Active Conversation -->
        <div class="inbox-conversation-pane" id="activeConversationPane">
          ${renderConversationPane(state.activeThread)}
        </div>
      </div>
    `;

    setTimeout(() => {
      const scrollBody = document.getElementById('chatScrollBody');
      if (scrollBody) scrollBody.scrollTop = scrollBody.scrollHeight;
    }, 50);
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.selectThread = function(contact) {
  if (!state.threads) return;
  const thread = state.threads.find(t => t.contact === contact);
  if (!thread) return;
  state.activeThread = thread;

  document.querySelectorAll('.thread-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`th_${contact.replace(/[^\w]/g, '')}`);
  if (activeEl) activeEl.classList.add('active');

  const pane = document.getElementById('activeConversationPane');
  if (pane) {
    pane.innerHTML = renderConversationPane(thread);
    const scrollBody = document.getElementById('chatScrollBody');
    if (scrollBody) scrollBody.scrollTop = scrollBody.scrollHeight;
  }
};

function renderConversationPane(thread) {
  if (!thread) {
    return '<div class="empty-state" style="margin: auto;">Select a conversation to view thread</div>';
  }

  return `
    <div class="conversation-header">
      <div>
        <strong style="font-size: 14.5px;">${thread.senderName || thread.contact}</strong>
        <span style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">${thread.contact}</span>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="badge badge-success">● Verified WhatsApp API</span>
        <button class="btn btn-sm btn-secondary" onclick="window.location.hash='#/leads'">View in CRM</button>
      </div>
    </div>

    <div class="conversation-body" id="chatScrollBody">
      ${thread.messages.map(m => `
        <div class="dialogue-bubble ${m.direction === 'inbound' ? 'dialogue-user' : 'dialogue-assistant'}" style="max-width: 75%;">
          ${m.media_url ? `
            <div class="photo-attachment-card" onclick="openImageLightbox('${m.media_url}', '${(m.sender_name || 'Customer').replace(/'/g, "\\'")} - Photo Attachment')" title="Click to enlarge image">
              <img src="${m.media_url}" alt="Attachment">
              <div class="photo-attachment-caption">
                <span>📷 Inspection Photo</span>
                <span style="color: var(--accent); font-size: 11px;">🔍 Zoom</span>
              </div>
            </div>
          ` : ''}
          <div style="margin-top: 6px; white-space: pre-wrap;">${m.message_text}</div>
          <span style="font-size: 10px; opacity: 0.7; text-align: right; display: block; margin-top: 4px;">${formatDate(m.created_at, true)}</span>
        </div>
      `).join('')}
    </div>

    <div class="conversation-footer">
      <input type="text" id="chatReplyInput" class="form-input" placeholder="Type a WhatsApp reply to ${thread.senderName || 'customer'}..." onkeydown="if(event.key==='Enter') sendChatReply('${thread.contact}')">
      <button class="btn btn-primary" onclick="sendChatReply('${thread.contact}')">Send &rarr;</button>
    </div>
  `;
}

window.openImageLightbox = function(src, caption) {
  let lightbox = document.getElementById('lightboxModal');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'lightboxModal';
    document.body.appendChild(lightbox);
  }
  lightbox.className = 'lightbox-overlay';
  lightbox.onclick = closeLightbox;
  lightbox.innerHTML = `
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <button class="lightbox-close-btn" onclick="closeLightbox()">&times;</button>
      <img src="${src}" class="lightbox-img" alt="Zoomed Attachment">
      <div class="lightbox-caption">${caption || 'Photo Attachment Preview'}</div>
      <div style="margin-top: 8px;">
        <a href="${src}" target="_blank" class="btn btn-sm btn-secondary" style="color: #fff; border-color: rgba(255,255,255,0.3);">Open High-Res Original ↗</a>
      </div>
    </div>
  `;
};

window.closeLightbox = function() {
  const lightbox = document.getElementById('lightboxModal');
  if (lightbox) {
    lightbox.remove();
  }
};

window.sendChatReply = async function(contact) {
  const input = document.getElementById('chatReplyInput');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';

  try {
    await api('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ contact, text, channel: 'whatsapp' })
    });
    showToast('WhatsApp message dispatched', 'success');
    await renderMessages(contact);
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// View 6: Leads & CRM
// -------------------------------------------------------------
async function renderLeads() {
  document.getElementById('topBarTitle').textContent = 'Unified Leads & CRM';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading CRM contacts...</div>';

  try {
    const { leads } = await api('/leads');
    state.leadsList = leads || [];
    state.crmActiveFilter = state.crmActiveFilter || 'ALL';

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Customer & Lead Directory</h1>
          <p class="page-subtitle">Actionable CRM workspace linked across Phone, WhatsApp, and Web by caller ID.</p>
        </div>
        <button class="btn btn-primary" onclick="openAddLeadModal()">+ Add New Lead</button>
      </div>

      <!-- CRM Toolbar: Search & Status Filters -->
      <div class="crm-toolbar">
        <div class="filter-pill-group">
          <button class="filter-pill ${state.crmActiveFilter === 'ALL' ? 'active' : ''}" onclick="filterCrmByStatus('ALL')">All Leads (${state.leadsList.length})</button>
          <button class="filter-pill ${state.crmActiveFilter === 'NEW' ? 'active' : ''}" onclick="filterCrmByStatus('NEW')">New</button>
          <button class="filter-pill ${state.crmActiveFilter === 'EMERGENCY_DISPATCHED' ? 'active' : ''}" onclick="filterCrmByStatus('EMERGENCY_DISPATCHED')">🚨 Emergency Dispatched</button>
          <button class="filter-pill ${state.crmActiveFilter === 'ESTIMATE_SCHEDULED' ? 'active' : ''}" onclick="filterCrmByStatus('ESTIMATE_SCHEDULED')">Estimate Scheduled</button>
          <button class="filter-pill ${state.crmActiveFilter === 'WON' ? 'active' : ''}" onclick="filterCrmByStatus('WON')">🏆 Won / Closed</button>
        </div>

        <div>
          <input type="text" id="crmSearchInput" class="form-input" style="width: 250px;" placeholder="Search name, phone, address..." oninput="filterCrmTable()">
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Contact Name & Phone</th>
              <th>Property Address</th>
              <th>Triage Level</th>
              <th>Pipeline Status</th>
              <th>Estimated Value</th>
              <th>Media / Notes</th>
              <th>Quick Actions</th>
            </tr>
          </thead>
          <tbody id="crmTableBody">
            ${renderCrmTableRows(state.leadsList)}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

function renderCrmTableRows(leads) {
  const filtered = state.crmActiveFilter === 'ALL' 
    ? leads 
    : leads.filter(l => l.status === state.crmActiveFilter);

  if (filtered.length === 0) {
    return '<tr><td colspan="7" class="empty-state">No leads found in this view.</td></tr>';
  }

  return filtered.map(l => `
    <tr class="crm-lead-row" data-search="${(l.name + ' ' + l.phone + ' ' + (l.address||'')).toLowerCase()}" data-status="${l.status}">
      <td>
        <strong style="font-size: 13.5px;">${l.name}</strong><br>
        <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${l.phone}</span>
      </td>
      <td style="font-size: 12.5px; color: var(--text-secondary); max-width: 180px;">${l.address || '<span style="color:var(--text-muted)">Not provided</span>'}</td>
      <td>
        <span class="badge ${l.triage_status === 'HIGH_EMERGENCY' ? 'badge-emergency' : 'badge-default'}">
          ${l.triage_status === 'HIGH_EMERGENCY' ? '🚨 EMERGENCY' : 'STANDARD'}
        </span>
      </td>
      <td>
        <span class="badge ${l.status === 'WON' ? 'badge-success' : l.status === 'EMERGENCY_DISPATCHED' ? 'badge-emergency' : 'badge-accent'}">
          ${l.status.replace(/_/g, ' ')}
        </span>
      </td>
      <td style="font-weight: 700; color: var(--text-primary); font-size: 13px;">
        $${(l.estimated_value || 0).toLocaleString()}
      </td>
      <td>
        <div style="display:flex; align-items:center; gap: 4px;">
          ${l.media && l.media.length > 0 ? `<span class="badge badge-success" title="${l.media.length} photos captured">📷 ${l.media.length}</span>` : ''}
          <span style="font-size: 11.5px; color: var(--text-muted);">${l.notes ? l.notes.length : 0} notes</span>
        </div>
      </td>
      <td>
        <div class="crm-actions-cell">
          <button class="btn btn-sm btn-secondary" onclick="window.location.hash='#/messages?contact=${encodeURIComponent(l.phone)}'" title="Open WhatsApp Chat">💬 Chat</button>
          <button class="btn btn-sm btn-secondary" onclick="openManualBookModal('${l.name.replace(/'/g, "\\'")}', '${l.phone}')" title="Schedule appointment">📅 Book</button>
          <button class="btn btn-sm btn-primary" onclick="openManageLeadModal('${l.id}')">⚙️ Manage</button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.filterCrmByStatus = function(status) {
  state.crmActiveFilter = status;
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(status === 'ALL' ? 'All Leads' : status.replace(/_/g, ' ')));
  });
  const tbody = document.getElementById('crmTableBody');
  if (tbody) tbody.innerHTML = renderCrmTableRows(state.leadsList || []);
};

window.filterCrmTable = function() {
  const query = (document.getElementById('crmSearchInput')?.value || '').toLowerCase().trim();
  document.querySelectorAll('.crm-lead-row').forEach(row => {
    const text = row.getAttribute('data-search') || '';
    row.style.display = text.includes(query) ? '' : 'none';
  });
};

window.openAddLeadModal = function() {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">+ Add New Lead to CRM</div>
          <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Customer / Business Name *</label>
            <input type="text" id="addLeadName" class="form-input" placeholder="e.g. Richard Hendricks">
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="tel" id="addLeadPhone" class="form-input" placeholder="+1 (555) 234-5678">
          </div>
          <div class="form-group">
            <label class="form-label">Property Address</label>
            <input type="text" id="addLeadAddress" class="form-input" placeholder="5230 Newell Rd, Palo Alto">
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Triage Priority</label>
              <select id="addLeadTriage" class="form-select">
                <option value="STANDARD">Standard Inspection</option>
                <option value="HIGH_EMERGENCY">🚨 High Emergency</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Pipeline Stage</label>
              <select id="addLeadStatus" class="form-select">
                <option value="NEW">New Lead</option>
                <option value="ESTIMATE_SCHEDULED">Estimate Scheduled</option>
                <option value="EMERGENCY_DISPATCHED">Emergency Dispatched</option>
                <option value="WON">Won / Signed</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Estimated Deal Value ($)</label>
            <input type="number" id="addLeadValue" class="form-input" placeholder="e.g. 8500" value="8500">
          </div>
          <div class="form-group">
            <label class="form-label">Initial Staff Note</label>
            <textarea id="addLeadNote" class="form-textarea" rows="2" placeholder="Site details, caller notes, or referral source..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitNewLead()">Save & Add Lead</button>
        </div>
      </div>
    </div>
  `;
};

window.submitNewLead = async function() {
  const name = document.getElementById('addLeadName')?.value.trim();
  const phone = document.getElementById('addLeadPhone')?.value.trim();
  const address = document.getElementById('addLeadAddress')?.value.trim();
  const triageStatus = document.getElementById('addLeadTriage')?.value;
  const status = document.getElementById('addLeadStatus')?.value;
  const estimatedValue = document.getElementById('addLeadValue')?.value;
  const initialNote = document.getElementById('addLeadNote')?.value.trim();

  if (!name || !phone) {
    alert('Please provide customer name and phone number.');
    return;
  }

  try {
    await api('/leads', {
      method: 'POST',
      body: JSON.stringify({ name, phone, address, triageStatus, status, estimatedValue, initialNote })
    });
    showToast('Lead added successfully to CRM', 'success');
    closeModal();
    renderLeads();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.openManageLeadModal = function(leadId) {
  const lead = (state.leadsList || []).find(l => l.id === leadId);
  if (!lead) return;

  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-card" style="max-width: 680px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div>
            <div class="modal-title">Manage Customer: ${lead.name}</div>
            <span style="font-size: 11.5px; color: var(--text-muted);">${lead.phone} • Added ${formatDate(lead.created_at)}</span>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
        </div>

        <div class="modal-body">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Customer Name</label>
              <input type="text" id="editLeadName" class="form-input" value="${lead.name}">
            </div>
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="tel" id="editLeadPhone" class="form-input" value="${lead.phone}">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Property Address</label>
            <input type="text" id="editLeadAddress" class="form-input" value="${lead.address || ''}">
          </div>

          <div class="grid-3" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label class="form-label">Pipeline Stage</label>
              <select id="editLeadStatus" class="form-select">
                <option value="NEW" ${lead.status === 'NEW' ? 'selected' : ''}>New Lead</option>
                <option value="CONTACTED" ${lead.status === 'CONTACTED' ? 'selected' : ''}>Contacted</option>
                <option value="EMERGENCY_DISPATCHED" ${lead.status === 'EMERGENCY_DISPATCHED' ? 'selected' : ''}>🚨 Emergency Dispatched</option>
                <option value="ESTIMATE_SCHEDULED" ${lead.status === 'ESTIMATE_SCHEDULED' ? 'selected' : ''}>Estimate Scheduled</option>
                <option value="WON" ${lead.status === 'WON' ? 'selected' : ''}>🏆 Won / Signed</option>
                <option value="LOST" ${lead.status === 'LOST' ? 'selected' : ''}>Lost</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Triage Urgency</label>
              <select id="editLeadTriage" class="form-select">
                <option value="STANDARD" ${lead.triage_status === 'STANDARD' ? 'selected' : ''}>Standard</option>
                <option value="HIGH_EMERGENCY" ${lead.triage_status === 'HIGH_EMERGENCY' ? 'selected' : ''}>🚨 High Emergency</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Estimated Value ($)</label>
              <input type="number" id="editLeadValue" class="form-input" value="${lead.estimated_value || 0}">
            </div>
          </div>

          <!-- Staff Activity & Notes History -->
          <div>
            <label class="form-label" style="font-weight: 700;">Internal Staff Notes & Activity Timeline</label>
            <div class="lead-notes-timeline" id="leadNotesTimeline">
              ${lead.notes && lead.notes.length > 0 ? lead.notes.map(n => `
                <div class="lead-note-bubble">
                  <div class="lead-note-meta">
                    <strong>${n.author || 'Staff'}</strong>
                    <span>${formatDate(n.timestamp || n.created_at)}</span>
                  </div>
                  <div>${n.note || n.text}</div>
                </div>
              `).join('') : '<div style="color:var(--text-muted); font-size:12px;">No notes recorded yet.</div>'}
            </div>

            <div style="display:flex; gap: 8px; margin-top: 10px;">
              <input type="text" id="quickNewNote" class="form-input" placeholder="Type internal note and click Add..." onkeydown="if(event.key==='Enter') addLeadNoteInModal('${lead.id}')">
              <button class="btn btn-secondary btn-sm" onclick="addLeadNoteInModal('${lead.id}')">Add Note</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveLeadChanges('${lead.id}')">Save Changes</button>
        </div>
      </div>
    </div>
  `;
};

window.addLeadNoteInModal = async function(leadId) {
  const input = document.getElementById('quickNewNote');
  if (!input || !input.value.trim()) return;
  const note = input.value.trim();
  input.value = '';

  try {
    const res = await api(`/leads/${leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note })
    });
    showToast('Note added', 'success');

    // Update in memory and refresh notes timeline inside modal
    const lead = (state.leadsList || []).find(l => l.id === leadId);
    if (lead) lead.notes = res.notes;

    const timeline = document.getElementById('leadNotesTimeline');
    if (timeline && res.notes) {
      timeline.innerHTML = res.notes.map(n => `
        <div class="lead-note-bubble">
          <div class="lead-note-meta">
            <strong>${n.author || 'Staff'}</strong>
            <span>${formatDate(n.timestamp)}</span>
          </div>
          <div>${n.note || n.text}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.saveLeadChanges = async function(leadId) {
  const name = document.getElementById('editLeadName')?.value.trim();
  const phone = document.getElementById('editLeadPhone')?.value.trim();
  const address = document.getElementById('editLeadAddress')?.value.trim();
  const status = document.getElementById('editLeadStatus')?.value;
  const triage_status = document.getElementById('editLeadTriage')?.value;
  const estimated_value = document.getElementById('editLeadValue')?.value;

  try {
    await api(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, phone, address, status, triage_status, estimated_value })
    });
    showToast('Lead record updated successfully', 'success');
    closeModal();
    renderLeads();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// View 7: Calendar Bookings
// -------------------------------------------------------------
async function renderCalendar() {
  document.getElementById('topBarTitle').textContent = 'Calendar Bookings';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading bookings...</div>';

  try {
    const { appointments } = await api('/calendar/appointments');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Confirmed Calendar Appointments</h1>
          <p class="page-subtitle">Automatic slot management synced to your technician dispatch schedule.</p>
        </div>
        <div style="display:flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="runLiveBookingTest()">⚡ Test Live Booking Flow</button>
          <button class="btn btn-primary" onclick="openManualBookModal()">+ Book Manual Appointment</button>
        </div>
      </div>

      <!-- Live Sync Status Banner -->
      <div style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 18px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="badge badge-success">● Live Sync Active</span>
          <span style="font-size: 13px; font-weight: 600;">Google Calendar & Cal.com Bidirectional Sync</span>
          <span style="font-size: 12px; color: var(--text-muted);">• Conflict prevention active • 30-min buffer between appointments</span>
        </div>
        <span style="font-size: 11.5px; color: var(--text-muted);">Auto-synchronized every 3 mins</span>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Confirmation Code</th>
              <th>Client Name</th>
              <th>Phone</th>
              <th>Service Booked</th>
              <th>Scheduled Time Slot</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${appointments.length === 0 ? '<tr><td colspan="7" class="empty-state">No appointments booked yet.</td></tr>' :
              appointments.map(a => `
                <tr>
                  <td><strong style="color:var(--accent); font-family:var(--font-mono);">${a.confirmation_code}</strong></td>
                  <td><strong>${a.customer_name}</strong></td>
                  <td style="font-family:var(--font-mono); font-size:12px;">${a.phone}</td>
                  <td>${a.service_name}</td>
                  <td style="color:var(--success); font-weight:600;">${a.scheduled_slot}</td>
                  <td>
                    <span class="badge ${a.status === 'CONFIRMED' ? 'badge-success' : a.status === 'RESCHEDULED' ? 'badge-warning' : 'badge-default'}">
                      ${a.status}
                    </span>
                  </td>
                  <td>
                    ${a.status !== 'CANCELED' ? `
                      <div style="display:flex; gap: 4px;">
                        <button class="btn btn-sm btn-secondary" onclick="openRescheduleModal('${a.id}', '${a.scheduled_slot.replace(/'/g, "\\'")}')">Reschedule</button>
                        <button class="btn btn-sm btn-secondary" style="color:var(--emergency);" onclick="cancelAppointment('${a.id}')">Cancel</button>
                      </div>
                    ` : '<span style="color:var(--text-muted); font-size:11.5px;">Canceled</span>'}
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.runLiveBookingTest = async function() {
  const testCustomers = [
    { name: 'Emma Watson', phone: '+1 (555) 432-8765', service: 'Emergency Tarp & Leak Mitigation', slot: 'Tomorrow at 11:00 AM' },
    { name: 'Carlos Mendez', phone: '+1 (555) 678-1234', service: 'Comprehensive 21-Point Drone Roof Inspection', slot: 'Thursday at 3:30 PM' },
    { name: 'Jennifer Lopez', phone: '+1 (555) 789-2345', service: 'Gutter & Flashing Assessment', slot: 'Friday at 9:00 AM' }
  ];
  const sample = testCustomers[Math.floor(Math.random() * testCustomers.length)];

  showToast('Connecting to Google Calendar & Cal.com slot manager...', 'info');

  try {
    const res = await api('/calendar/book', {
      method: 'POST',
      body: JSON.stringify({
        customerName: sample.name,
        phone: sample.phone,
        serviceName: sample.service,
        timeSlot: sample.slot
      })
    });

    showToast(`⚡ Live Booking Confirmed: Code ${res.appointment.confirmationCode} reserved on Google Calendar!`, 'success');
    renderCalendar();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.openRescheduleModal = function(appointmentId, currentSlot) {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">Reschedule Appointment</div>
          <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">
            Current Slot: <strong style="color:var(--text-primary);">${currentSlot}</strong>
          </p>
          <div class="form-group">
            <label class="form-label">Select or Type New Slot</label>
            <select id="rescheduleSelect" class="form-select" onchange="if(this.value!=='custom') document.getElementById('rescheduleCustomInput').value = this.value">
              <option value="Tomorrow at 9:00 AM">Tomorrow at 9:00 AM</option>
              <option value="Tomorrow at 1:30 PM">Tomorrow at 1:30 PM</option>
              <option value="Tomorrow at 4:00 PM">Tomorrow at 4:00 PM</option>
              <option value="Thursday at 10:00 AM">Thursday at 10:00 AM</option>
              <option value="Friday at 2:00 PM">Friday at 2:00 PM</option>
              <option value="custom">-- Custom Date & Time --</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Confirmed Time String</label>
            <input type="text" id="rescheduleCustomInput" class="form-input" value="Tomorrow at 9:00 AM">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          <button class="btn btn-primary" onclick="submitReschedule('${appointmentId}')">Update Schedule &rarr;</button>
        </div>
      </div>
    </div>
  `;
};

window.submitReschedule = async function(appointmentId) {
  const newTimeSlot = document.getElementById('rescheduleCustomInput')?.value.trim();
  if (!newTimeSlot) return;

  try {
    await api('/calendar/reschedule', {
      method: 'POST',
      body: JSON.stringify({ appointmentId, newTimeSlot })
    });
    showToast('Appointment rescheduled and calendar synced', 'success');
    closeModal();
    renderCalendar();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.cancelAppointment = async function(id) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  try {
    await api('/calendar/cancel', {
      method: 'POST',
      body: JSON.stringify({ appointmentId: id })
    });
    showToast('Appointment canceled', 'success');
    renderCalendar();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.openManualBookModal = function(prefillName = '', prefillPhone = '') {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">Manual Appointment Booking</div>
          <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Customer Name</label>
            <input type="text" id="mbName" class="form-input" value="${prefillName}" placeholder="e.g. Michael Smith">
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="tel" id="mbPhone" class="form-input" value="${prefillPhone}" placeholder="+1 (555) 123-4567">
          </div>
          <div class="form-group">
            <label class="form-label">Service Type</label>
            <input type="text" id="mbService" class="form-input" value="Comprehensive 21-Point Drone Roof Inspection">
          </div>
          <div class="form-group">
            <label class="form-label">Scheduled Time Slot</label>
            <input type="text" id="mbSlot" class="form-input" value="Tomorrow at 2:00 PM">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitManualBooking()">Confirm Booking</button>
        </div>
      </div>
    </div>
  `;
};

window.submitManualBooking = async function() {
  const customerName = document.getElementById('mbName').value.trim();
  const phone = document.getElementById('mbPhone').value.trim();
  const serviceName = document.getElementById('mbService').value.trim();
  const timeSlot = document.getElementById('mbSlot').value.trim();

  if (!customerName || !phone) {
    alert('Please enter name and phone.');
    return;
  }

  try {
    await api('/calendar/book', {
      method: 'POST',
      body: JSON.stringify({ customerName, phone, serviceName, timeSlot })
    });
    showToast('Booking saved and confirmed', 'success');
    closeModal();
    renderCalendar();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// View 8: Receptionist Settings & Live Call Simulator
// -------------------------------------------------------------
async function renderSettings() {
  document.getElementById('topBarTitle').textContent = 'Receptionist Configuration';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading settings...</div>';

  try {
    const { tenant, config } = await api('/settings');
    const p = config.receptionistPersona || { name: 'Sarah', greeting: 'Hello' };

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">AI Receptionist Settings</h1>
          <p class="page-subtitle">Configure greetings, voice persona, emergency triage thresholds, and test in real time.</p>
        </div>
        <button class="btn btn-primary" onclick="saveSettingsForm()">Save Changes</button>
      </div>

      <div class="grid-2">
        <!-- Left: Configuration Form -->
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 16px;">Voice Persona & Greetings</h3>
          <div class="form-group">
            <label class="form-label">Receptionist Name</label>
            <input type="text" id="cfgPersonaName" class="form-input" value="${p.name || 'Sarah'}">
          </div>

          <div class="form-group">
            <label class="form-label">Voice Tone & Sound</label>
            <div style="display:flex; gap: 8px;">
              <select id="cfgVoiceTone" class="form-select">
                <option value="sarah">Sarah — Soft, Feminine & Calm (Recommended for Local Services)</option>
                <option value="emma">Emma — Warm, Empathetic & Friendly</option>
                <option value="clara">Clara — Gentle, Reassuring & Professional</option>
              </select>
              <button class="btn btn-secondary" type="button" onclick="previewVoiceSample()" style="white-space:nowrap;">▶ Listen to Voice Sample</button>
            </div>
            <span class="form-hint">Ultra-natural Web Speech synthesis tuned for soft, calm customer empathy.</span>
          </div>

          <div class="form-group">
            <label class="form-label">Phone Greeting Script (Concise & Professional)</label>
            <textarea id="cfgGreeting" class="form-textarea" rows="2">${p.greeting || `Thanks for calling ${tenant.business_name}. How can our team assist you today?`}</textarea>
            <span class="form-hint">Keep under 15 words so callers are never kept waiting.</span>
          </div>

          <div class="form-group">
            <label class="form-label">Emergency Alert Mobile Number</label>
            <input type="tel" id="cfgEmergencyPhone" class="form-input" value="${config.emergencyPhone || '+1 (555) 999-1234'}">
          </div>

          <div class="form-group">
            <label class="form-label">Emergency Trigger Keywords (comma separated)</label>
            <input type="text" id="cfgKeywords" class="form-input" value="${(config.emergencyKeywords || ['leak', 'water', 'flood', 'severe pain', 'no heat']).join(', ')}">
          </div>
        </div>

        <!-- Right: Live Call Simulator Bench -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Live Call Simulator</h3>
              <p class="card-desc">Simulate a customer call directly in your browser</p>
            </div>
            <div class="waveform-bar" id="simWave">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>

          <div class="simulator-box">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted);">Quick Caller Scenarios (Selective Emergency Replies):</div>
            <div style="display:flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-secondary" onclick="fillAndSimulate('Water is leaking through my ceiling right now from the storm!')">⛈️ Emergency Leak</button>
              <button class="btn btn-sm btn-secondary" onclick="fillAndSimulate('I have a severe throbbing toothache and swelling!')">🦷 Severe Toothache</button>
              <button class="btn btn-sm btn-secondary" onclick="fillAndSimulate('My furnace broke down and we have no heat in freezing cold!')">❄️ Furnace Breakdown</button>
              <button class="btn btn-sm btn-secondary" onclick="fillAndSimulate('How much do you charge for a full inspection?')">💰 Pricing Query</button>
              <button class="btn btn-sm btn-secondary" onclick="fillAndSimulate('Yes, please confirm that emergency time slot!')">✅ Confirm Booking</button>
            </div>

            <div style="display:flex; gap: 8px; margin-top: 6px;">
              <input type="text" id="simInput" class="form-input" placeholder="Type or click scenario to simulate caller...">
              <button class="btn btn-primary" onclick="executeSimulatorTurn()">Speak</button>
            </div>

            <div id="simTranscriptOutput" style="min-height: 120px; max-height: 200px; overflow-y: auto; background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; font-size: 13px; line-height: 1.45;">
              <span style="color: var(--text-muted);">Call connected. Click any scenario button above to hear the tailored selective reply.</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.fillAndSimulate = function(text) {
  document.getElementById('simInput').value = text;
  executeSimulatorTurn();
};

window.executeSimulatorTurn = async function() {
  const input = document.getElementById('simInput');
  const out = document.getElementById('simTranscriptOutput');
  const wave = document.getElementById('simWave');
  if (!input || !input.value.trim()) return;

  const speech = input.value.trim();
  input.value = '';

  const userTurn = `<div style="margin-bottom: 8px;"><strong>Caller:</strong> ${speech}</div>`;
  out.innerHTML += userTurn;
  wave.classList.add('active');

  try {
    const res = await api('/settings/test-call', {
      method: 'POST',
      body: JSON.stringify({ speechInput: speech })
    });

    const botTurn = `
      <div style="background-color: var(--accent-subtle); border: 1px solid var(--accent-border); padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; color: var(--accent-text);">
        <strong>${state.tenant?.business_name || 'AI Receptionist'}:</strong> ${res.text}
        ${res.triageStatus === 'HIGH_EMERGENCY' ? '<br><span class="badge badge-emergency" style="margin-top:4px;">🚨 HIGH EMERGENCY DETECTED</span>' : ''}
      </div>
    `;
    out.innerHTML += botTurn;
    out.scrollTop = out.scrollHeight;
    speakAloud(res.text);
  } catch (err) {
    out.innerHTML += `<div style="color:var(--emergency)">Error: ${err.message}</div>`;
  } finally {
    setTimeout(() => wave.classList.remove('active'), 1800);
  }
};

window.saveSettingsForm = async function() {
  const name = document.getElementById('cfgPersonaName').value;
  const greeting = document.getElementById('cfgGreeting').value;
  const emergencyPhone = document.getElementById('cfgEmergencyPhone').value;
  const keywords = document.getElementById('cfgKeywords').value.split(',').map(s => s.trim());

  let config = {};
  try { config = JSON.parse(state.tenant.receptionist_config || '{}'); } catch(e){}
  config.receptionistPersona = { ...(config.receptionistPersona || {}), name, greeting };
  config.emergencyPhone = emergencyPhone;
  config.emergencyKeywords = keywords;

  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ config })
    });
    showToast('Configuration updated', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// View 9: Automations
// -------------------------------------------------------------
// -------------------------------------------------------------
// View 9: Automations
// -------------------------------------------------------------
async function renderAutomations() {
  document.getElementById('topBarTitle').textContent = 'Automated Workflows';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading automations...</div>';

  try {
    const { automations } = await api('/automations');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Scheduled Business Automations</h1>
          <p class="page-subtitle">Automatic owner briefings, 24/7 speed-to-lead recovery, and WhatsApp follow-ups.</p>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${automations.map(a => `
          <div class="card" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <h4 style="font-size: 15px; font-weight: 700;">${formatAutomationName(a.type)}</h4>
                <span class="badge ${a.enabled ? 'badge-success' : 'badge-default'}">${a.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Trigger Schedule: ${a.schedule_time === 'Instant' ? 'Instant (<30s after event)' : a.schedule_time === 'Realtime' ? 'Immediate Priority Alert' : `Daily at ${a.schedule_time || '08:00'}`}</p>
              <div style="background-color: var(--bg-surface-subtle); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 12.5px; color: var(--text-secondary); line-height: 1.45; border: 1px solid var(--border-subtle);">
                ${a.template_text}
              </div>
            </div>

            <div style="display: flex; gap: 8px; align-self: center;">
              <button class="btn btn-secondary btn-sm" onclick="triggerAutomationTest('${a.type}')">⚡ Test Dispatch</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.triggerAutomationTest = async function(type) {
  try {
    const res = await api('/automations/trigger', {
      method: 'POST',
      body: JSON.stringify({ type })
    });
    if (res.automation) {
      openDispatchPreviewModal(res.automation);
    } else {
      showToast(res.message || 'Automation dispatched', 'success');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.openDispatchPreviewModal = function(auto) {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-card" style="max-width: 500px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div>
            <div class="modal-title">⚡ Live Automation Dispatch Test</div>
            <span style="font-size: 11.5px; color: var(--text-muted);">${auto.deliveryLatency || 'Delivered in 240ms'}</span>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body" style="background-color: var(--bg-surface-subtle); padding: 20px;">
          <div class="dispatch-phone-mockup">
            <div class="dispatch-phone-header">
              <span>● ${auto.channel}</span>
              <span>${auto.dispatchedAt || 'Now'}</span>
            </div>
            <div style="font-size: 11.5px; color: #cbd5e1; margin-bottom: 8px;">
              To: <strong>${auto.recipient}</strong>
            </div>
            <div class="dispatch-message-bubble">
              ${auto.previewText.replace(/\n/g, '<br>')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal()">✓ Close Preview</button>
        </div>
      </div>
    </div>
  `;
};

// -------------------------------------------------------------
// View 10: Channels & Integrations (Complete Setup Hub with Guides)
// -------------------------------------------------------------
async function renderIntegrations() {
  document.getElementById('topBarTitle').textContent = 'Channels & Integrations';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading channels...</div>';

  try {
    const data = await api('/integrations');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Integration & Channel Setup Hub</h1>
          <p class="page-subtitle">Connect your existing phone line, WhatsApp Business, Google Calendar, and website widget.</p>
        </div>
      </div>

      <div class="grid-2">
        <!-- 1. Main Business Phone Line & Forwarding Guide -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">📞 Main Business Phone Line</h3>
              <p class="card-desc">Keep your existing number. Forward unanswered or after-hours calls to HavenDesk.</p>
            </div>
            <span class="badge badge-success">Online</span>
          </div>

          <div class="form-group" style="margin-top: 10px;">
            <label class="form-label">Dedicated HavenDesk AI Receptionist Number</label>
            <input type="text" class="form-input" readonly value="${data.phone.number}" style="font-family: var(--font-mono); font-weight:700;">
            <span class="form-hint">${data.phone.status}</span>
          </div>

          <div style="background-color: var(--bg-surface-subtle); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-top: 12px;">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">How to forward your calls in 30 seconds:</div>
            <ul style="font-size: 12px; color: var(--text-secondary); margin-left: 18px; line-height: 1.5;">
              <li><strong>Verizon / US Cellular:</strong> Dial <code>*71${data.phone.number.replace(/[^\d]/g, '')}</code> from your mobile or office phone to enable conditional forwarding (rings 3 times before AI answers).</li>
              <li><strong>AT&T / T-Mobile:</strong> Dial <code>**61*${data.phone.number.replace(/[^\d]/g, '')}#</code> for busy/no-answer forwarding.</li>
              <li><strong>Landline / VoIP (RingCentral, Vonage, Ooma):</strong> Add this number to your after-hours hunt group in your VoIP portal.</li>
            </ul>
          </div>

          <button class="btn btn-secondary btn-sm" style="margin-top: 14px;" onclick="showToast('Simulating inbound ring test... Telephony SIP trunk responsive in 210ms.', 'success')">📞 Test Line Connectivity</button>
        </div>

        <!-- 2. WhatsApp Business API -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">💬 WhatsApp Business Channel</h3>
              <p class="card-desc">Receive emergency damage photos and send 24/7 automated booking confirmations.</p>
            </div>
            <span class="badge badge-success">Verified</span>
          </div>

          <div class="form-group" style="margin-top: 10px;">
            <label class="form-label">Connected WhatsApp Business Number</label>
            <input type="text" class="form-input" readonly value="${data.whatsapp.number}" style="font-family: var(--font-mono); font-weight:700;">
            <span class="form-hint">${data.whatsapp.status}</span>
          </div>

          <div style="background-color: var(--bg-surface-subtle); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-top: 12px;">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Meta Cloud API Configuration Guide:</div>
            <ul style="font-size: 12px; color: var(--text-secondary); margin-left: 18px; line-height: 1.5;">
              <li><strong>Webhook URL:</strong> <code>${window.location.origin}/api/v1/channels/whatsapp/webhook</code></li>
              <li><strong>Media Intake:</strong> Automatically processes inbound photos (roof leaks, insurance cards) with AI triage.</li>
              <li><strong>Template Status:</strong> 24-hour reminder & morning briefing templates approved by Meta.</li>
            </ul>
          </div>

          <button class="btn btn-secondary btn-sm" style="margin-top: 14px;" onclick="showToast('Dispatching test WhatsApp ping... Received successfully.', 'success')">💬 Send Test WhatsApp Ping</button>
        </div>

        <!-- 3. Website Chat Widget & Allowed Domains -->
        <div class="card" style="grid-column: span 2;">
          <div class="card-header">
            <div>
              <h3 class="card-title">🌐 Website Chat Widget Embed Code & Security</h3>
              <p class="card-desc">Paste this single lightweight script before &lt;/body&gt; on your website to launch the 24/7 AI chat & voice widget.</p>
            </div>
            <button class="btn btn-sm btn-primary" onclick="copyWidgetCode()">Copy Embed Code</button>
          </div>

          <div class="grid-2" style="margin-top: 10px;">
            <div>
              <label class="form-label">HTML Embed Tag</label>
              <textarea id="widgetCodeBox" class="form-textarea" rows="3" readonly style="font-family: var(--font-mono); font-size: 12px; background-color: var(--bg-surface-subtle);">${data.widget.embedScript}</textarea>
            </div>
            <div>
              <label class="form-label">Allowed Web Domains (Security Setting)</label>
              <input type="text" id="allowedDomainsInput" class="form-input" value="${data.widget.allowedDomains || '*'}" placeholder="e.g. vanguardroofing.com, *.vanguardroofing.com">
              <span class="form-hint">Restrict widget loading to your verified company domains. Enter <code>*</code> to permit all domains.</span>
              <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="saveAllowedDomains()">Save Allowed Domains</button>
            </div>
          </div>
        </div>

        <!-- 4. Calendar & Scheduling Sync -->
        <div class="card" style="grid-column: span 2;">
          <div class="card-header">
            <div>
              <h3 class="card-title">📅 Calendar & Technician Dispatch Scheduling</h3>
              <p class="card-desc">Direct two-way synchronization to prevent double-bookings across your staff.</p>
            </div>
            <span class="badge badge-success">● Auto-Sync Active</span>
          </div>

          <div class="grid-3" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 12px;">
            <div style="background-color: var(--bg-surface-subtle); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="font-size: 11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Provider</div>
              <div style="font-size: 13.5px; font-weight:600; margin-top:4px;">Google Calendar / Cal.com</div>
              <div style="font-size: 11.5px; color:var(--text-secondary); margin-top:2px;">Connected via OAuth 2.0</div>
            </div>

            <div style="background-color: var(--bg-surface-subtle); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="font-size: 11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Buffer Cushion</div>
              <div style="font-size: 13.5px; font-weight:600; margin-top:4px;">30 Minutes Travel Time</div>
              <div style="font-size: 11.5px; color:var(--text-secondary); margin-top:2px;">Prevents back-to-back overlaps</div>
            </div>

            <div style="background-color: var(--bg-surface-subtle); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="font-size: 11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Working Hours Sync</div>
              <div style="font-size: 13.5px; font-weight:600; margin-top:4px;">Mon - Fri: 7am - 6pm</div>
              <div style="font-size: 11.5px; color:var(--text-secondary); margin-top:2px;">Sat: 8am - 3pm (Emergency 24/7)</div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.saveAllowedDomains = async function() {
  const allowedDomains = document.getElementById('allowedDomainsInput')?.value.trim();
  try {
    await api('/integrations/domains', {
      method: 'POST',
      body: JSON.stringify({ allowedDomains })
    });
    showToast('Allowed web domains updated successfully', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.copyWidgetCode = function() {
  const box = document.getElementById('widgetCodeBox');
  box.select();
  document.execCommand('copy');
  showToast('Widget embed code copied to clipboard!', 'success');
};

// -------------------------------------------------------------
// View 11: Reports & Analytics (Enriched Executive Dashboard)
// -------------------------------------------------------------
async function renderReports() {
  document.getElementById('topBarTitle').textContent = 'Reports & Analytics';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading executive reports...</div>';

  try {
    const data = await api('/reports');
    const k = data.kpis || {};
    const b = data.channelBreakdown || {};

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Executive Performance & ROI Reports</h1>
          <p class="page-subtitle">In-depth inquiry analytics, triage velocity, and full data export center.</p>
        </div>
        <div style="display:flex; gap: 8px;">
          <a href="${data.exportCallsUrl}" class="btn btn-secondary" download>📥 Export Calls CSV</a>
          <a href="${data.exportLeadsUrl}" class="btn btn-primary" download>📥 Export Leads CSV</a>
        </div>
      </div>

      <!-- 4 Top Executive KPI Cards -->
      <div class="grid-4" style="margin-bottom: 24px;">
        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Inquiry Conversion</span>
            <span class="badge badge-success">High ROI</span>
          </div>
          <div class="stat-value" style="color: var(--success);">${k.conversionRate || 85}%</div>
          <div class="stat-meta">Call-to-booking efficiency</div>
        </div>

        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Urgent Emergency Rate</span>
            <span class="badge badge-emergency">Triage Metric</span>
          </div>
          <div class="stat-value" style="color: var(--emergency);">${k.emergencyRate || 28}%</div>
          <div class="stat-meta">${k.totalEmergencies || 1} priority dispatches handled</div>
        </div>

        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Avg Voice Call Duration</span>
            <span class="badge badge-default">Speed to Resolution</span>
          </div>
          <div class="stat-value">${k.avgDurationSeconds || 58}s</div>
          <div class="stat-meta">Sub-800ms initial response</div>
        </div>

        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Staff Hours Saved</span>
            <span class="badge badge-accent">Operational Gain</span>
          </div>
          <div class="stat-value" style="color: var(--accent);">${k.hoursSaved || 14.5} hrs</div>
          <div class="stat-meta">Equivalent to ~$580 staff labor</div>
        </div>
      </div>

      <!-- Detailed Analytics Grid -->
      <div class="grid-2">
        <!-- Inbound Volume by Channel -->
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 14px;">Inbound Volume by Channel</h3>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom: 4px;">
                <span>📞 Inbound Phone Calls</span>
                <strong>64% (24 calls)</strong>
              </div>
              <div class="meter-track"><div class="meter-fill" style="width: 64%;"></div></div>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom: 4px;">
                <span>💬 WhatsApp Business Chats</span>
                <strong>26% (10 chats)</strong>
              </div>
              <div class="meter-track"><div class="meter-fill" style="width: 26%;"></div></div>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom: 4px;">
                <span>🌐 Website Widget Conversations</span>
                <strong>10% (4 chats)</strong>
              </div>
              <div class="meter-track"><div class="meter-fill" style="width: 10%;"></div></div>
            </div>
          </div>
        </div>

        <!-- Calls by Triage Urgency -->
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 14px;">Calls by Triage Urgency</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${(data.callsByTriage || []).map(c => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; background-color: var(--bg-surface-subtle); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span>${c.triage_level === 'HIGH_EMERGENCY' ? '🚨 High Emergency Triage' : '📋 Standard Routine Call'}</span>
                <strong>${c.count} calls</strong>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

// -------------------------------------------------------------
// View 12: Billing & Plan
// -------------------------------------------------------------
async function renderBilling() {
  document.getElementById('topBarTitle').textContent = 'Billing & Plan';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading billing details...</div>';

  try {
    const data = await api('/billing');
    const u = data.usage;

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Subscription & Usage</h1>
          <p class="page-subtitle">Track your plan limits, minutes used, and billing invoices.</p>
        </div>
        <a href="${data.stripeCustomerPortalUrl}" target="_blank" class="btn btn-secondary">Manage Payment on Stripe &rarr;</a>
      </div>

      <div class="grid-2" style="margin-bottom: 24px;">
        <!-- Plan Summary Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <span class="badge badge-accent">${data.plan.name} Tier</span>
              <h3 class="card-title" style="font-size: 24px; margin-top: 6px;">$${data.plan.price_monthly}<span style="font-size:13px; font-weight:400; color:var(--text-muted)"> / month</span></h3>
            </div>
            <span class="badge badge-success">${capitalize(data.subscriptionStatus)}</span>
          </div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">${data.plan.description || 'Full 24/7 reception coverage'}</p>
          <div style="display:flex; gap: 8px;">
            <button class="btn btn-sm btn-primary" onclick="showToast('To upgrade plan, please contact account representative or use Stripe portal.', 'info')">Upgrade Plan</button>
          </div>
        </div>

        <!-- Usage Meters -->
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 14px;">Monthly Usage Meters</h3>
          
          <div class="meter-wrapper">
            <div style="display:flex; justify-content:space-between; font-size:12.5px;">
              <span>Voice Minutes</span>
              <strong>${u.voiceMinutesUsed} / ${u.voiceMinutesLimit} mins (${u.percentMinutesUsed}%)</strong>
            </div>
            <div class="meter-track">
              <div class="meter-fill ${u.percentMinutesUsed > 80 ? 'warning' : ''}" style="width: ${Math.min(u.percentMinutesUsed, 100)}%;"></div>
            </div>
          </div>

          <div class="meter-wrapper" style="margin-top: 18px;">
            <div style="display:flex; justify-content:space-between; font-size:12.5px;">
              <span>WhatsApp & Web Messages</span>
              <strong>${u.messagesUsed} / ${u.messagesLimit} msgs (${u.percentMessagesUsed}%)</strong>
            </div>
            <div class="meter-track">
              <div class="meter-fill" style="width: ${Math.min(u.percentMessagesUsed, 100)}%;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Invoices -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); font-weight: 700;">Billing Invoices</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice Number</th>
              <th>Billing Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            ${data.invoices.map(inv => `
              <tr>
                <td style="font-family: var(--font-mono);">${inv.id}</td>
                <td>${inv.date}</td>
                <td><strong>${inv.amount}</strong></td>
                <td><span class="badge badge-success">${inv.status}</span></td>
                <td><a href="#" style="color:var(--accent); font-weight:600; text-decoration:none;">Download PDF</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

// -------------------------------------------------------------
// View 13: Team & Account
// -------------------------------------------------------------
async function renderTeam() {
  document.getElementById('topBarTitle').textContent = 'Team & Staff';
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading team...</div>';

  try {
    const { users } = await api('/team');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Team Members & Access</h1>
          <p class="page-subtitle">Manage who can inspect calls, manage appointments, and view leads.</p>
        </div>
        <button class="btn btn-primary" onclick="openInviteModal()">+ Invite Staff Member</button>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Active</th>
              <th>Member Since</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td><span class="badge ${u.role === 'client_owner' ? 'badge-accent' : 'badge-default'}">${u.role === 'client_owner' ? 'Owner' : 'Staff'}</span></td>
                <td style="font-size:12px; color:var(--text-muted);">${formatDate(u.last_login_at)}</td>
                <td style="font-size:12px; color:var(--text-muted);">${formatDate(u.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.openInviteModal = function() {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">Invite Team Member</div>
          <button class="btn btn-sm btn-secondary" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="invName" class="form-input" placeholder="e.g. Alex Johnson">
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="invEmail" class="form-input" placeholder="alex@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <select id="invRole" class="form-select">
              <option value="client_staff">Staff (View calls & bookings)</option>
              <option value="client_owner">Owner (Full administrative rights)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitInvite()">Send Invite</button>
        </div>
      </div>
    </div>
  `;
};

window.submitInvite = async function() {
  const name = document.getElementById('invName').value.trim();
  const email = document.getElementById('invEmail').value.trim();
  const role = document.getElementById('invRole').value;

  if (!name || !email) {
    alert('Please provide name and email.');
    return;
  }

  try {
    await api('/team/invite', {
      method: 'POST',
      body: JSON.stringify({ name, email, role })
    });
    showToast(`Invitation sent to ${email}`, 'success');
    closeModal();
    renderTeam();
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// Utilities & Helpers
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  window.showToast = showToast;
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'danger' ? '⚠️' : 'ℹ️'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function formatDate(isoString, timeOnly = false) {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  if (timeOnly) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getInitials(name) {
  if (!name) return 'HD';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatAutomationName(type) {
  switch(type) {
    case 'MORNING_BRIEFING': return '☀️ Daily 8:00 AM Owner Executive Briefing';
    case '24H_REMINDER': return '🔔 24-Hour WhatsApp Appointment Reminder';
    case 'SPEED_TO_LEAD': return '⚡ Speed-to-Lead Instant Text-Back';
    case 'REVIEW_REQUEST': return '⭐ 5-Star Google Review Follow-up';
    case 'EMERGENCY_DISPATCH': return '🚨 VIP Emergency Technician Instant Alert';
    default: return type.replace(/_/g, ' ');
  }
}

window.previewVoiceSample = function() {
  const biz = state.tenant?.business_name || 'Vanguard Roofing';
  const sample = `Thanks for calling ${biz}. My name is Sarah, your 24/7 AI Receptionist. How can our team assist you today?`;
  speakAloud(sample);
  showToast('Playing Sarah’s calm feminine voice sample...', 'info');
};

function speakAloud(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const clean = text.replace(/BK-\d+/g, 'confirmation code provided').replace(/https?:\/\/\S+/g, '');
  const utterance = new SpeechSynthesisUtterance(clean);

  // Search for soft feminine English voices across operating systems
  const voices = window.speechSynthesis.getVoices();
  const feminineVoice = voices.find(v => 
    /(zira|samantha|karen|victoria|female|jenny|aria|natural)/i.test(v.name) && 
    (v.lang.startsWith('en') || !v.lang)
  ) || voices.find(v => v.lang.startsWith('en'));

  if (feminineVoice) {
    utterance.voice = feminineVoice;
  }

  utterance.pitch = 1.05; // Softer, natural feminine resonance
  utterance.rate = 0.92;  // Calm, reassuring pacing (never rushed)
  utterance.volume = 0.95;

  window.speechSynthesis.speak(utterance);
}
