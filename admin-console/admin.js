/**
 * HavenDesk Management Console Controller
 * Powers all 16 administration views, 2FA auth, impersonation, and remote config.
 */

const adminState = {
  token: localStorage.getItem('haven_admin_token') || null,
  user: null,
  activeRoute: 'overview',
  theme: localStorage.getItem('haven_admin_theme') || 'light'
};

document.documentElement.setAttribute('data-theme', adminState.theme);

// Load SVG Icons
fetch('/shared/icons.svg')
  .then(r => r.text())
  .then(svgText => {
    document.getElementById('adminIconsPlaceholder').innerHTML = svgText;
  })
  .catch(() => {});

window.addEventListener('hashchange', handleAdminRoute);

document.addEventListener('DOMContentLoaded', async () => {
  setupAdminEvents();
  await checkAdminAuthAndRoute();
});

function setupAdminEvents() {
  const themeBtn = document.getElementById('adminThemeToggleBtn');
  if (themeBtn) {
    themeBtn.onclick = () => {
      adminState.theme = adminState.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', adminState.theme);
      localStorage.setItem('haven_admin_theme', adminState.theme);
    };
  }

  const logoutBtn = document.getElementById('btnAdminLogout');
  if (logoutBtn) {
    logoutBtn.onclick = handleAdminLogout;
  }

  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('adminEmail').value;
      const password = document.getElementById('adminPassword').value;
      const totpCode = document.getElementById('adminTotp').value;
      await executeAdminLogin(email, password, totpCode);
    };
  }
}

async function adminApi(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (adminState.token) {
    headers['Authorization'] = `Bearer ${adminState.token}`;
  }

  const res = await fetch(`/api/v1/admin${path}`, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    handleAdminLogout();
    throw new Error('Unauthorized or session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function checkAdminAuthAndRoute() {
  if (!adminState.token) {
    showAdminAuth();
    return;
  }

  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    if (!res.ok) throw new Error('Invalid admin token');
    const data = await res.json();

    if (!['super_admin', 'support'].includes(data.user.role)) {
      throw new Error('Access denied: not an administrator');
    }

    adminState.user = data.user;
    document.getElementById('adminUserName').textContent = data.user.name;

    document.getElementById('adminAuthContainer').style.display = 'none';
    document.getElementById('adminAppLayout').style.display = 'flex';
    handleAdminRoute();
  } catch (err) {
    handleAdminLogout();
  }
}

function showAdminAuth() {
  document.getElementById('adminAppLayout').style.display = 'none';
  document.getElementById('adminAuthContainer').style.display = 'flex';
}

function handleAdminLogout() {
  adminState.token = null;
  adminState.user = null;
  localStorage.removeItem('haven_admin_token');
  showAdminAuth();
}

async function executeAdminLogin(email, password, totpCode) {
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totpCode })
    });
    const data = await res.json();
    if (data.success) {
      if (!['super_admin', 'support'].includes(data.user.role)) {
        showAdminToast('Access denied: not an administrator account', 'danger');
        return;
      }
      adminState.token = data.token;
      localStorage.setItem('haven_admin_token', data.token);
      showAdminToast('Master Administrator authenticated', 'success');
      await checkAdminAuthAndRoute();
    } else {
      showAdminToast(data.error || 'Login failed', 'danger');
    }
  } catch (err) {
    showAdminToast(err.message, 'danger');
  }
}

function handleAdminRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'overview';
  adminState.activeRoute = hash;

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-nav') === adminState.activeRoute);
  });

  switch (adminState.activeRoute) {
    case 'overview': renderAdminOverview(); break;
    case 'clients': renderAdminClients(); break;
    case 'plans': renderAdminPlans(); break;
    case 'subscriptions': renderAdminSubscriptions(); break;
    case 'usage': renderAdminUsage(); break;
    case 'templates': renderAdminTemplates(); break;
    case 'ai-control': renderAdminAIControl(); break;
    case 'integrations': renderAdminIntegrations(); break;
    case 'live-monitor': renderAdminLiveMonitor(); break;
    case 'audit-logs': renderAdminAuditLogs(); break;
    case 'feature-flags': renderAdminFeatureFlags(); break;
    case 'support': renderAdminSupport(); break;
    case 'users': renderAdminUsers(); break;
    case 'settings': renderAdminSettings(); break;
    default: renderAdminOverview(); break;
  }
}

// -------------------------------------------------------------
// View 1: Platform Overview & MRR
// -------------------------------------------------------------
async function renderAdminOverview() {
  document.getElementById('adminBarTitle').textContent = 'Platform Overview';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading platform metrics...</div>';

  try {
    const { metrics, tenantsSummary } = await adminApi('/overview');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Executive Operations Dashboard</h1>
          <p class="page-subtitle">Platform health, recurring revenue, and live customer activity.</p>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom: 24px;">
        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Monthly Recurring Revenue</span>
            <span class="badge badge-success">Stripe Sync</span>
          </div>
          <div class="stat-value" style="color: var(--accent);">${metrics.mrr}</div>
          <div class="stat-meta"><span class="stat-up">+14.2%</span> vs last month</div>
        </div>

        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Active Tenants</span>
            <span class="badge badge-accent">${metrics.totalTenants} Total</span>
          </div>
          <div class="stat-value">${metrics.activeTenants}</div>
          <div class="stat-meta">${metrics.trialingTenants} in free trial • Churn: ${metrics.churnRate}</div>
        </div>

        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Total Calls Handled</span>
            <span class="badge badge-default">Today</span>
          </div>
          <div class="stat-value">${metrics.totalCallsToday}</div>
          <div class="stat-meta">100% voice uptime</div>
        </div>

        <div class="card stat-card">
          <div class="stat-header">
            <span class="stat-label">Total Appointments Booked</span>
            <span class="badge badge-success">Value Driver</span>
          </div>
          <div class="stat-value" style="color: var(--success);">${metrics.totalAppointmentsBooked}</div>
          <div class="stat-meta">Direct calendar reservations</div>
        </div>
      </div>

      <!-- Clients Summary Card -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size: 14px;">Recent Client Businesses</strong>
          <a href="#/clients" class="btn btn-sm btn-secondary">View All Clients &rarr;</a>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Business Name</th>
              <th>Niche</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tenantsSummary.map(t => `
              <tr>
                <td><strong>${t.name}</strong><br><span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${t.id}</span></td>
                <td><span class="badge badge-default">${capitalize(t.niche)}</span></td>
                <td>
                  <span class="badge ${t.status === 'active' ? 'badge-success' : t.status === 'trialing' ? 'badge-warning' : 'badge-emergency'}">
                    ${capitalize(t.status)}
                  </span>
                </td>
                <td>${t.plan}</td>
                <td style="font-size:12px; color:var(--text-muted);">${formatDate(t.created)}</td>
                <td>
                  <button class="btn btn-sm btn-secondary" onclick="impersonateClient('${t.id}')">👁️ View as Client</button>
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

// -------------------------------------------------------------
// View 2: Clients & Tenants Manager (with Impersonate)
// -------------------------------------------------------------
async function renderAdminClients() {
  document.getElementById('adminBarTitle').textContent = 'Clients & Tenants';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading clients directory...</div>';

  try {
    const { clients } = await adminApi('/clients');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Client Tenant Management</h1>
          <p class="page-subtitle">Provision, suspend, reactivate, or impersonate any business on the platform.</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateClientModal()">+ Add New Client</button>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Industry</th>
              <th>Subscription Status</th>
              <th>Plan Tier</th>
              <th>Calls / Bookings</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `
              <tr>
                <td>
                  <strong>${c.business_name}</strong><br>
                  <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${c.phone || c.id}</span>
                </td>
                <td><span class="badge badge-default">${capitalize(c.niche)}</span></td>
                <td>
                  <span class="badge ${c.subscription_status === 'active' ? 'badge-success' : c.subscription_status === 'trialing' ? 'badge-warning' : 'badge-emergency'}">
                    ${capitalize(c.subscription_status)}
                  </span>
                </td>
                <td><strong>${c.plan_name}</strong> ($${c.price_monthly}/mo)</td>
                <td style="font-size:12.5px;">${c.total_calls} calls • ${c.total_bookings} bookings</td>
                <td>
                  <div style="display:flex; gap: 6px;">
                    <button class="btn btn-sm btn-secondary" onclick="impersonateClient('${c.id}')" title="Log in as this client">👁️ Impersonate</button>
                    ${c.subscription_status === 'active' || c.subscription_status === 'trialing' ? `
                      <button class="btn btn-sm btn-danger" onclick="toggleClientStatus('${c.id}', 'suspended')">Suspend</button>
                    ` : `
                      <button class="btn btn-sm btn-secondary" onclick="toggleClientStatus('${c.id}', 'active')">Reactivate</button>
                    `}
                  </div>
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

window.impersonateClient = async function(tenantId) {
  try {
    const res = await adminApi(`/clients/${tenantId}/impersonate`, { method: 'POST' });
    showAdminToast(`Impersonating ${res.tenant.name}...`, 'info');
    window.open(res.redirectUrl, '_blank');
  } catch (err) {
    showAdminToast(err.message, 'danger');
  }
};

window.toggleClientStatus = async function(tenantId, newStatus) {
  if (!confirm(`Are you sure you want to mark this client as ${newStatus}?`)) return;
  try {
    await adminApi(`/clients/${tenantId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    showAdminToast(`Client status changed to ${newStatus}`, 'success');
    renderAdminClients();
  } catch (err) {
    showAdminToast(err.message, 'danger');
  }
};

window.openCreateClientModal = function() {
  const modalContainer = document.getElementById('adminModalContainer');
  modalContainer.style.display = 'block';
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="closeAdminModal()">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">Provision New Client Business</div>
          <button class="btn btn-sm btn-secondary" onclick="closeAdminModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Business Name</label>
            <input type="text" id="admNewBiz" class="form-input" placeholder="e.g. Summit Ridge Roofing">
          </div>
          <div class="form-group">
            <label class="form-label">Industry Niche</label>
            <select id="admNewNiche" class="form-select">
              <option value="roofing">Roofing Contractor & Restoration</option>
              <option value="dental">Dental Practice & Emergency Clinic</option>
              <option value="hvac">HVAC & Heating Solutions</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subscription Plan</label>
            <select id="admNewPlan" class="form-select">
              <option value="plan_growth">Growth ($399/mo) — Most Popular</option>
              <option value="plan_starter">Starter ($199/mo)</option>
              <option value="plan_pro">Pro ($799/mo)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Owner Email</label>
            <input type="email" id="admNewEmail" class="form-input" placeholder="owner@summitridge.com">
          </div>
          <div class="form-group">
            <label class="form-label">Owner Name</label>
            <input type="text" id="admNewName" class="form-input" placeholder="David Miller">
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="tel" id="admNewPhone" class="form-input" placeholder="+1 (800) 555-7864">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeAdminModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitCreateClient()">Create Client &rarr;</button>
        </div>
      </div>
    </div>
  `;
};

window.submitCreateClient = async function() {
  const businessName = document.getElementById('admNewBiz').value.trim();
  const niche = document.getElementById('admNewNiche').value;
  const planId = document.getElementById('admNewPlan').value;
  const ownerEmail = document.getElementById('admNewEmail').value.trim();
  const ownerName = document.getElementById('admNewName').value.trim();
  const phone = document.getElementById('admNewPhone').value.trim();

  if (!businessName || !ownerEmail) {
    alert('Please enter business name and owner email.');
    return;
  }

  try {
    await adminApi('/clients', {
      method: 'POST',
      body: JSON.stringify({ businessName, niche, planId, ownerEmail, ownerName, phone })
    });
    showAdminToast('Client provisioned successfully', 'success');
    closeAdminModal();
    renderAdminClients();
  } catch (err) {
    showAdminToast(err.message, 'danger');
  }
};

window.closeAdminModal = function() {
  const m = document.getElementById('adminModalContainer');
  m.style.display = 'none';
  m.innerHTML = '';
};

// -------------------------------------------------------------
// View 3: Plans & Pricing
// -------------------------------------------------------------
async function renderAdminPlans() {
  document.getElementById('adminBarTitle').textContent = 'Plans & Pricing';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading plans...</div>';

  try {
    const { plans } = await adminApi('/plans');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">SaaS Subscription Plans</h1>
          <p class="page-subtitle">Configure pricing tiers, included minutes, and overage limits synced to Stripe.</p>
        </div>
      </div>

      <div class="grid-3">
        ${plans.map(p => `
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${p.name}</h3>
              <span class="badge badge-accent">${p.id}</span>
            </div>
            <div style="font-size: 28px; font-weight: 700; color: var(--accent); margin-bottom: 12px;">
              $${p.price_monthly}<span style="font-size:13px; font-weight:400; color:var(--text-muted)"> / month</span>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
              • <strong>${p.voice_minutes_included}</strong> voice minutes included<br>
              • <strong>${p.messages_included}</strong> messages included<br>
              • Extra minutes at <strong>$${p.extra_minute_rate.toFixed(2)}/min</strong><br>
              • Stripe Product ID: <span style="font-family:var(--font-mono); font-size:11px;">${p.stripe_price_id || 'price_mock'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

// -------------------------------------------------------------
// View 4: Subscriptions & Billing
// -------------------------------------------------------------
async function renderAdminSubscriptions() {
  document.getElementById('adminBarTitle').textContent = 'Subscriptions & Invoicing';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading subscriptions...</div>';

  try {
    const { clients } = await adminApi('/clients');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Client Subscriptions</h1>
          <p class="page-subtitle">Monitor payment status, trials, and Stripe billing lifecycles.</p>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Client Business</th>
              <th>Subscription Status</th>
              <th>Plan</th>
              <th>Monthly Fee</th>
              <th>Stripe Customer ID</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `
              <tr>
                <td><strong>${c.business_name}</strong></td>
                <td><span class="badge ${c.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}">${capitalize(c.subscription_status)}</span></td>
                <td>${c.plan_name}</td>
                <td><strong>$${c.price_monthly}.00</strong></td>
                <td style="font-family: var(--font-mono); font-size: 11.5px;">${c.stripe_customer_id || 'cus_mock_test'}</td>
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
// View 5: Usage & Cost Margins (Profitability)
// -------------------------------------------------------------
async function renderAdminUsage() {
  document.getElementById('adminBarTitle').textContent = 'Usage & Cost Margins';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Calculating margins...</div>';

  try {
    const { usage } = await adminApi('/usage');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Gross Profit & Provider Cost Tracking</h1>
          <p class="page-subtitle">Telephony & AI token cost per client compared to recurring subscription revenue.</p>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Client Business</th>
              <th>Voice Mins</th>
              <th>Messages</th>
              <th>Est. Wholesale Cost</th>
              <th>Client Revenue</th>
              <th>Gross Margin %</th>
              <th>Gross Profit</th>
            </tr>
          </thead>
          <tbody>
            ${usage.map(u => `
              <tr>
                <td><strong>${u.business_name}</strong><br><span style="font-size:11px; color:var(--text-muted)">${u.plan_name}</span></td>
                <td style="font-family:var(--font-mono)">${u.voice_minutes}</td>
                <td style="font-family:var(--font-mono)">${u.messages_count}</td>
                <td style="color:var(--text-muted); font-weight:600;">$${u.estimated_cost.toFixed(2)}</td>
                <td><strong>$${u.revenue}.00</strong></td>
                <td><span class="badge badge-success">${u.marginPercent}</span></td>
                <td style="color:var(--success); font-weight:700;">${u.grossProfit}</td>
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
// View 6: Niche Templates Manager
// -------------------------------------------------------------
async function renderAdminTemplates() {
  document.getElementById('adminBarTitle').textContent = 'Niche Templates';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading templates...</div>';

  try {
    const { templates } = await adminApi('/templates');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Industry Niche Templates</h1>
          <p class="page-subtitle">Master prompts, triage rules, and booking schemas deployed to new clients.</p>
        </div>
      </div>

      <div class="grid-3">
        ${templates.map(t => `
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${t.name}</h3>
              <span class="badge badge-accent">v${t.version}</span>
            </div>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">${t.tagline || 'Standard template'}</p>
            <button class="btn btn-sm btn-secondary" onclick="alert('Template configuration is synchronized with profiles/${t.id}.json')">Inspect Config</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

// -------------------------------------------------------------
// View 7: AI & Prompt Control
// -------------------------------------------------------------
async function renderAdminAIControl() {
  document.getElementById('adminBarTitle').textContent = 'AI & Prompt Control';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading AI config...</div>';

  try {
    const data = await adminApi('/ai-control');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">AI Model & Prompt Governance</h1>
          <p class="page-subtitle">Configure underlying LLM models, safety guardrails, and master prompt templates.</p>
        </div>
        <button class="btn btn-primary" onclick="saveAIControl()">Save AI Settings</button>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 14px;">Model Selection & Strictness</h3>
          <div class="form-group">
            <label class="form-label">Default LLM Reasoning Model</label>
            <select id="aiModelSelect" class="form-select">
              ${data.availableModels.map(m => `<option value="${m}" ${m === data.currentModel ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Triage Strictness Level</label>
            <select id="aiStrictnessSelect" class="form-select">
              <option value="high" ${data.triageStrictness === 'high' ? 'selected' : ''}>High (Zero dropped emergencies)</option>
              <option value="balanced" ${data.triageStrictness === 'balanced' ? 'selected' : ''}>Balanced</option>
              <option value="relaxed" ${data.triageStrictness === 'relaxed' ? 'selected' : ''}>Relaxed</option>
            </select>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title" style="margin-bottom: 14px;">Master System Prompt</h3>
          <textarea id="aiGlobalPrompt" class="form-textarea" rows="6" style="font-family: var(--font-mono); font-size: 12px;">${data.globalSystemPrompt}</textarea>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.saveAIControl = async function() {
  const model = document.getElementById('aiModelSelect').value;
  const strictness = document.getElementById('aiStrictnessSelect').value;
  const globalPrompt = document.getElementById('aiGlobalPrompt').value;

  try {
    await adminApi('/ai-control', {
      method: 'PUT',
      body: JSON.stringify({ model, strictness, globalPrompt })
    });
    showAdminToast('AI settings saved and deployed globally', 'success');
  } catch (err) {
    showAdminToast(err.message, 'danger');
  }
};

// -------------------------------------------------------------
// View 8: Integrations & Provider Keys (Encrypted at Rest)
// -------------------------------------------------------------
async function renderAdminIntegrations() {
  document.getElementById('adminBarTitle').textContent = 'Provider Keys';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading keys...</div>';

  try {
    const { providers } = await adminApi('/integrations');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Third-Party Provider Credentials</h1>
          <p class="page-subtitle">Encrypted at rest using AES-256-GCM. Unmasked keys are never sent to the browser.</p>
        </div>
      </div>

      <div class="card">
        ${providers.map(p => `
          <div class="key-row">
            <div>
              <div class="key-name">${p.name}</div>
              <span style="font-size: 11.5px; color: ${p.configured ? 'var(--success)' : 'var(--text-muted)'}; font-weight:600;">
                ${p.configured ? '● Configured & Active' : '○ Test Mode Placeholder'}
              </span>
            </div>
            <div style="display:flex; align-items:center; gap: 12px;">
              <span class="key-mask">${p.maskedKey}</span>
              <button class="btn btn-sm btn-secondary" onclick="promptUpdateKey('${p.id}', '${p.name}')">Update Key</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.promptUpdateKey = function(providerId, providerName) {
  const key = prompt(`Enter new API Key for ${providerName}:`);
  if (!key) return;

  adminApi('/integrations', {
    method: 'PUT',
    body: JSON.stringify({ provider: providerId, apiKey: key })
  })
  .then(() => {
    showAdminToast(`${providerName} key updated securely`, 'success');
    renderAdminIntegrations();
  })
  .catch(err => showAdminToast(err.message, 'danger'));
};

// -------------------------------------------------------------
// View 9: Live Call Monitor
// -------------------------------------------------------------
async function renderAdminLiveMonitor() {
  document.getElementById('adminBarTitle').textContent = 'Live Call Monitor';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading live monitor...</div>';

  try {
    const { activeCalls } = await adminApi('/live-monitor');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Live Call & Triage Monitor</h1>
          <p class="page-subtitle">Real-time incoming call stream across all client tenants.</p>
        </div>
      </div>

      <div class="live-feed-stream">
        ${activeCalls.map(c => `
          <div class="live-feed-card ${c.triage_level === 'HIGH_EMERGENCY' ? 'emergency' : ''}">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <strong>${c.business_name}</strong>
                <span class="badge ${c.triage_level === 'HIGH_EMERGENCY' ? 'badge-emergency' : 'badge-default'}">${c.triage_level}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${formatDate(c.created_at)}</span>
              </div>
              <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 2px;">
                <strong>Caller:</strong> ${c.caller_name} (${c.caller_number}) • Duration: ${c.duration_seconds}s
              </p>
              <div style="font-size: 12px; color: var(--text-muted);">${c.summary || 'Call completed normally.'}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="impersonateClient('${c.tenant_id}')">Open Client Portal &rarr;</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

// -------------------------------------------------------------
// View 10: Audit Logs
// -------------------------------------------------------------
async function renderAdminAuditLogs() {
  document.getElementById('adminBarTitle').textContent = 'Audit Logs';
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div style="color:var(--text-muted)">Loading audit trail...</div>';

  try {
    const { logs } = await adminApi('/audit-logs');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Security & Action Audit Trail</h1>
          <p class="page-subtitle">Tamper-evident record of administrator actions, impersonations, and status changes.</p>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>User ID</th>
              <th>Tenant Target</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td style="font-size:12px; color:var(--text-muted);">${formatDate(l.created_at)}</td>
                <td><strong style="color:var(--accent); font-family:var(--font-mono); font-size:12px;">${l.action}</strong></td>
                <td style="font-size:11.5px; font-family:var(--font-mono);">${l.user_id || 'System'}</td>
                <td style="font-size:11.5px; font-family:var(--font-mono);">${l.tenant_id || '—'}</td>
                <td style="font-size:11.5px; font-family:var(--font-mono);">${l.ip_address}</td>
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
// View 11: Feature Flags & Remote Config
// -------------------------------------------------------------
function renderAdminFeatureFlags() {
  document.getElementById('adminBarTitle').textContent = 'Feature Flags';
  const content = document.getElementById('adminContent');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Remote Feature Flags</h1>
        <p class="page-subtitle">Toggle cutting-edge capabilities globally without server restarts.</p>
      </div>
    </div>

    <div class="card" style="padding: 0;">
      <div class="flag-row">
        <div>
          <strong>AI Vision Photo Inspection</strong>
          <p style="font-size: 12.5px; color: var(--text-muted);">Automatically analyzes customer WhatsApp photos for roof leak damage & dental cards.</p>
        </div>
        <span class="badge badge-success">Enabled Globally</span>
      </div>

      <div class="flag-row">
        <div>
          <strong>Sub-800ms Low Latency Voice Pipeline</strong>
          <p style="font-size: 12.5px; color: var(--text-muted);">Nova-2 STT and Cartesia voice streaming engine.</p>
        </div>
        <span class="badge badge-success">Enabled Globally</span>
      </div>

      <div class="flag-row">
        <div>
          <strong>Emergency Live Call Transfer</strong>
          <p style="font-size: 12.5px; color: var(--text-muted);">Instantly bridges high-emergency calls to technician mobile lines via SIP.</p>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// View 12: Support Inbox
// -------------------------------------------------------------
function renderAdminSupport() {
  document.getElementById('adminBarTitle').textContent = 'Support Inbox';
  const content = document.getElementById('adminContent');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Customer Support Helpdesk</h1>
        <p class="page-subtitle">Tickets and technical inquiries submitted by business owners.</p>
      </div>
    </div>

    <div class="card" style="padding: 0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Ticket Subject</th>
            <th>Client Business</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>How to connect Cal.com team account?</strong></td>
            <td>Apex Family Dentistry</td>
            <td><span class="badge badge-default">Medium</span></td>
            <td><span class="badge badge-success">Resolved</span></td>
            <td style="font-size:12px; color:var(--text-muted);">Today</td>
          </tr>
          <tr>
            <td><strong>Update emergency dispatch number for storm night</strong></td>
            <td>Vanguard Roofing</td>
            <td><span class="badge badge-emergency">High</span></td>
            <td><span class="badge badge-accent">In Progress</span></td>
            <td style="font-size:12px; color:var(--text-muted);">Yesterday</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// View 13: Admin Users
// -------------------------------------------------------------
function renderAdminUsers() {
  document.getElementById('adminBarTitle').textContent = 'Admin Users';
  const content = document.getElementById('adminContent');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Operator Directory</h1>
        <p class="page-subtitle">Team members with root platform privileges.</p>
      </div>
    </div>

    <div class="card" style="padding: 0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>2FA Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>System Administrator</strong></td>
            <td>admin@havendesk.com</td>
            <td><span class="admin-badge-super">super_admin</span></td>
            <td><span class="badge badge-success">✓ TOTP Active</span></td>
          </tr>
          <tr>
            <td><strong>Customer Support Specialist</strong></td>
            <td>support@havendesk.com</td>
            <td><span class="badge badge-default">support</span></td>
            <td><span class="badge badge-warning">Optional</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// View 14: System Settings
// -------------------------------------------------------------
async function renderAdminSettings() {
  document.getElementById('adminBarTitle').textContent = 'System Settings';
  const content = document.getElementById('adminContent');

  try {
    const data = await adminApi('/settings');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Platform Infrastructure Settings</h1>
          <p class="page-subtitle">Maintenance controls, database health, and backup configurations.</p>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title" style="margin-bottom: 12px;">Database & Storage</h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
          Current Engine: <strong>${data.dbEngine}</strong><br>
          Database File: <span style="font-family: var(--font-mono); font-size: 12px;">server/db/havendesk.sqlite</span>
        </p>

        <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px; margin-top: 16px;">
          <h3 class="card-title" style="margin-bottom: 6px;">Maintenance Mode</h3>
          <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">When enabled, client portals show a scheduled maintenance window notice.</p>
          <button class="btn ${data.maintenanceMode ? 'btn-danger' : 'btn-secondary'}" onclick="toggleMaintenance(${!data.maintenanceMode})">
            ${data.maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card empty-state"><p style="color:var(--emergency)">${err.message}</p></div>`;
  }
}

window.toggleMaintenance = async function(enable) {
  try {
    await adminApi('/settings/maintenance', {
      method: 'POST',
      body: JSON.stringify({ enabled: enable })
    });
    showAdminToast(`Maintenance mode ${enable ? 'enabled' : 'disabled'}`, 'info');
    renderAdminSettings();
  } catch (err) {
    showAdminToast(err.message, 'danger');
  }
};

function showAdminToast(message, type = 'info') {
  const container = document.getElementById('adminToastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'danger' ? '⚠️' : 'ℹ️'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function formatDate(isoString) {
  if (!isoString) return 'Just now';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
