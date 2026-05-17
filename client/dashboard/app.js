'use strict';

const API_BASE   = '/api/v1';
const REFRESH_MS = 30_000;
const PAGE_LIMIT = 20;

let authToken    = null;
let currentPage  = 1;
let totalPages   = 1;
let refreshTimer = null;
let donutChart   = null;
let barChart     = null;
let activeFilter = '';
let searchQuery  = '';
let drawerTicket = null;

const TOKEN_KEY = 'helpdesk_ops_token';

// DOM
const tbody         = document.getElementById('tickets-tbody');
const statusFilter  = document.getElementById('status-filter');
const searchInput   = document.getElementById('search-input');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');
const paginationEl  = document.getElementById('pagination');
const paginationInfo= document.getElementById('pagination-info');
const lastRefreshed = document.getElementById('last-refreshed');
const statusDot     = document.getElementById('status-dot');
const authBanner    = document.getElementById('auth-banner');
const btnManual     = document.getElementById('btn-manual-refresh');
const drawerOverlay = document.getElementById('drawer-overlay');
const drawer        = document.getElementById('ticket-drawer');
const drawerTitle   = document.getElementById('drawer-title');
const drawerBody    = document.getElementById('drawer-body');
const drawerResolveBtn  = document.getElementById('drawer-resolve-btn');
const drawerEscalateBtn = document.getElementById('drawer-escalate-btn');

// ── Utilities ──────────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

function showLoginModal() {
  document.getElementById('login-overlay').style.display = 'flex';
}
function hideLoginModal() {
  document.getElementById('login-overlay').style.display = 'none';
}

async function bootstrapAuth() {
  // 1. Try stored token
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    try {
      // quick parse to check expiry
      const payload = JSON.parse(atob(stored.split('.')[1]));
      if (payload.exp * 1000 > Date.now()) {
        authToken = stored;
        return;
      }
    } catch { /* invalid token, fall through */ }
    localStorage.removeItem(TOKEN_KEY);
  }

  // 2. Dev: try demo-token
  try {
    const res = await fetch(`${API_BASE}/auth/demo-token`);
    if (res.ok) {
      authToken = (await res.json()).token;
      localStorage.setItem(TOKEN_KEY, authToken);
      return;
    }
  } catch { /* production — demo-token is disabled */ }

  // 3. Production: show login modal
  showLoginModal();
}

async function handleLogin(password) {
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  errEl.textContent = '';
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid password');
    authToken = data.token;
    localStorage.setItem(TOKEN_KEY, authToken);
    hideLoginModal();
    await refresh();
    startAutoRefresh();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  authToken = null;
  clearInterval(refreshTimer);
  showLoginModal();
}

// ── Metrics ────────────────────────────────────────────────────────────────────

const STATUS_LIST = ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'];
const metricCounts = { OPEN: 0, IN_PROGRESS: 0, ESCALATED: 0, RESOLVED: 0 };

async function loadMetrics() {
  await Promise.all(STATUS_LIST.map(async (s) => {
    try {
      const res  = await fetch(`${API_BASE}/tickets?status=${s}&page=1&limit=1`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const n    = data.pagination.total;
      metricCounts[s] = n;
      const el = document.getElementById(`count-${s}`);
      if (el) el.textContent = n;
    } catch {
      const el = document.getElementById(`count-${s}`);
      if (el) el.textContent = '?';
    }
  }));
  updateCharts();
}

// ── Charts ─────────────────────────────────────────────────────────────────────

function initCharts() {
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { labels: { color: '#8d93b0', font: { family: 'Inter', size: 12 } } } },
  };

  donutChart = new Chart(document.getElementById('donut-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Open', 'In Progress', 'Escalated', 'Resolved'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: ['rgba(99,122,255,0.7)', 'rgba(245,166,35,0.7)', 'rgba(245,101,101,0.7)', 'rgba(52,211,153,0.7)'],
        borderColor: '#131620',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: { ...baseOpts, cutout: '68%' },
  });

  barChart = new Chart(document.getElementById('bar-chart'), {
    type: 'bar',
    data: {
      labels: ['Low', 'Medium', 'High', 'Critical'],
      datasets: [{
        label: 'Tickets',
        data: [0, 0, 0, 0],
        backgroundColor: ['rgba(74,80,112,0.7)', 'rgba(34,211,238,0.7)', 'rgba(245,166,35,0.7)', 'rgba(245,101,101,0.7)'],
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8d93b0', font: { family: 'Inter' } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8d93b0', font: { family: 'Inter' }, precision: 0 }, beginAtZero: true },
      },
      plugins: { ...baseOpts.plugins, legend: { display: false } },
    },
  });
}

async function updateCharts() {
  if (donutChart) {
    donutChart.data.datasets[0].data = [
      metricCounts.OPEN, metricCounts.IN_PROGRESS, metricCounts.ESCALATED, metricCounts.RESOLVED,
    ];
    donutChart.update('active');
  }

  // Priority counts
  if (barChart) {
    try {
      const res  = await fetch(`${API_BASE}/tickets?limit=100`, { headers: authHeaders() });
      const data = await res.json();
      const tickets = data.data || [];
      const pc   = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      tickets.forEach((t) => { if (pc[t.priority] !== undefined) pc[t.priority]++; });
      barChart.data.datasets[0].data = [pc.LOW, pc.MEDIUM, pc.HIGH, pc.CRITICAL];
      barChart.update('active');
    } catch { /* silent */ }
  }
}

// ── Ticket Table ───────────────────────────────────────────────────────────────

function renderRow(ticket) {
  const tr = document.createElement('tr');
  const isResolved  = ticket.status === 'RESOLVED';
  const issueLabel  = ticket.issueType.replace(/_/g, ' ');
  const desc        = ticket.description || '';

  tr.innerHTML = `
    <td class="td-id">#${ticket.id}</td>
    <td class="td-user">${escapeHtml(ticket.userId)}</td>
    <td style="color:var(--text-secondary)">${escapeHtml(issueLabel)}</td>
    <td class="td-desc">${escapeHtml(desc)}</td>
    <td><span class="badge badge-${ticket.status}">${ticket.status.replace('_', ' ')}</span></td>
    <td><span class="priority priority-${ticket.priority}">${ticket.priority}</span></td>
    <td style="color:var(--text-muted);font-size:12px">${formatDate(ticket.createdAt)}</td>
    <td>
      <button class="btn-resolve" id="resolve-btn-${ticket.id}" data-id="${ticket.id}" ${isResolved ? 'disabled' : ''}>
        ${isResolved ? '✓ Done' : '✓ Resolve'}
      </button>
    </td>
  `;

  // Row click → drawer
  tr.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openDrawer(ticket);
  });

  tr.querySelector('.btn-resolve').addEventListener('click', (e) => {
    e.stopPropagation();
    resolveTicket(ticket.id);
  });

  return tr;
}

async function loadTickets(page = 1) {
  const params = new URLSearchParams({ page, limit: PAGE_LIMIT });
  if (activeFilter) params.set('status', activeFilter);

  tbody.innerHTML = `<tr class="state-row"><td colspan="8"><span class="spinner"></span> Loading…</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/tickets?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);

    const data    = await res.json();
    let tickets   = data.data;
    const pg      = data.pagination;

    currentPage = pg.page;
    totalPages  = pg.totalPages;

    // Client-side search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tickets = tickets.filter((t) =>
        t.userId.toLowerCase().includes(q) ||
        t.issueType.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    tbody.innerHTML = '';
    if (tickets.length === 0) {
      tbody.innerHTML = `<tr class="state-row"><td colspan="8">No tickets found${activeFilter ? ` with status "${activeFilter}"` : ''}${searchQuery ? ` matching "${searchQuery}"` : ''}</td></tr>`;
    } else {
      tickets.forEach((t) => tbody.appendChild(renderRow(t)));
    }

    if (pg.totalPages > 1) {
      paginationEl.style.display = 'flex';
      paginationInfo.textContent = `Page ${pg.page} of ${pg.totalPages} (${pg.total} total)`;
      btnPrev.disabled = pg.page <= 1;
      btnNext.disabled = pg.page >= pg.totalPages;
    } else {
      paginationEl.style.display = 'none';
    }

    lastRefreshed.textContent  = `Last updated: ${new Date().toLocaleTimeString()}`;
    statusDot.style.background = 'var(--green)';

  } catch (err) {
    tbody.innerHTML = `<tr class="state-row"><td colspan="8" style="color:var(--rose)">⚠ Failed to load: ${escapeHtml(err.message)}</td></tr>`;
    statusDot.style.background = 'var(--rose)';
    lastRefreshed.textContent  = 'Update failed';
  }
}

// ── Resolve ────────────────────────────────────────────────────────────────────

async function resolveTicket(ticketId) {
  const btn = document.getElementById(`resolve-btn-${ticketId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Resolving…'; }

  try {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/resolve`, { method: 'PATCH', headers: authHeaders() });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).message) || `HTTP ${res.status}`);
    toast(`Ticket #${ticketId} resolved ✓`, 'success');
    closeDrawer();
    await refresh();
  } catch (err) {
    toast(`Failed: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Resolve'; }
  }
}

// ── Escalate ───────────────────────────────────────────────────────────────────

async function escalateTicket(ticketId) {
  try {
    drawerEscalateBtn.disabled = true;
    drawerEscalateBtn.textContent = 'Escalating…';
    const res = await fetch(`/webhooks/escalation`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ticketId, reason: 'Manually escalated from Ops Dashboard' }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).message) || `HTTP ${res.status}`);
    toast(`Ticket #${ticketId} escalated 🚨`, 'success');
    closeDrawer();
    await refresh();
  } catch (err) {
    toast(`Escalation failed: ${err.message}`, 'error');
    drawerEscalateBtn.disabled = false;
    drawerEscalateBtn.textContent = '🚨 Escalate';
  }
}

// ── Drawer ─────────────────────────────────────────────────────────────────────

function openDrawer(ticket) {
  drawerTicket = ticket;
  drawerTitle.textContent = `Ticket #${ticket.id}`;

  const isResolved  = ticket.status === 'RESOLVED';
  const isEscalated = ticket.status === 'ESCALATED';

  drawerBody.innerHTML = `
    <div class="drawer-field">
      <label>User ID</label>
      <p class="mono">${escapeHtml(ticket.userId)}</p>
    </div>
    <div class="drawer-field">
      <label>Issue Type</label>
      <p>${escapeHtml(ticket.issueType.replace(/_/g, ' '))}</p>
    </div>
    <div class="drawer-field">
      <label>Status</label>
      <p><span class="badge badge-${ticket.status}">${ticket.status.replace('_', ' ')}</span></p>
    </div>
    <div class="drawer-field">
      <label>Priority</label>
      <p><span class="priority priority-${ticket.priority}">${ticket.priority}</span></p>
    </div>
    <div class="drawer-field">
      <label>Description</label>
      <p>${escapeHtml(ticket.description || '—')}</p>
    </div>
    <div class="drawer-field">
      <label>Created At</label>
      <p>${formatDate(ticket.createdAt)}</p>
    </div>
    <div class="drawer-field">
      <label>Last Updated</label>
      <p>${formatDate(ticket.updatedAt)}</p>
    </div>
    ${ticket.resolvedAt ? `<div class="drawer-field"><label>Resolved At</label><p>${formatDate(ticket.resolvedAt)}</p></div>` : ''}
  `;

  drawerResolveBtn.disabled  = isResolved;
  drawerResolveBtn.textContent = isResolved ? '✓ Already Resolved' : '✓ Mark as Resolved';
  drawerEscalateBtn.disabled = isResolved || isEscalated;
  drawerEscalateBtn.textContent = isEscalated ? '🚨 Already Escalated' : '🚨 Escalate';

  drawerOverlay.classList.add('open');
  drawer.classList.add('open');
}

function closeDrawer() {
  drawerOverlay.classList.remove('open');
  drawer.classList.remove('open');
  drawerTicket = null;
}

// ── Sidebar nav ────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item[data-filter]').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    activeFilter = item.dataset.filter;
    statusFilter.value = activeFilter;
    currentPage = 1;
    loadTickets(1);
  });
});

document.getElementById('nav-dashboard').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  document.getElementById('nav-dashboard').classList.add('active');
  activeFilter = '';
  statusFilter.value = '';
  currentPage = 1;
  loadTickets(1);
});

document.getElementById('nav-tickets').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  document.getElementById('nav-tickets').classList.add('active');
  activeFilter = '';
  statusFilter.value = '';
  currentPage = 1;
  loadTickets(1);
});

// ── Events ─────────────────────────────────────────────────────────────────────

statusFilter.addEventListener('change', () => {
  activeFilter = statusFilter.value;
  currentPage  = 1;
  loadTickets(1);
});

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = searchInput.value.trim();
    loadTickets(currentPage);
  }, 300);
});

btnManual.addEventListener('click', () => {
  btnManual.textContent = '↻ Refreshing…';
  refresh().then(() => { btnManual.textContent = '↻ Refresh Now'; });
});

btnPrev.addEventListener('click', () => { if (currentPage > 1) loadTickets(currentPage - 1); });
btnNext.addEventListener('click', () => { if (currentPage < totalPages) loadTickets(currentPage + 1); });

document.getElementById('drawer-close').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

drawerResolveBtn.addEventListener('click', () => {
  if (drawerTicket) resolveTicket(drawerTicket.id);
});
drawerEscalateBtn.addEventListener('click', () => {
  if (drawerTicket) escalateTicket(drawerTicket.id);
});

// ── Refresh cycle ──────────────────────────────────────────────────────────────

async function refresh() {
  await Promise.all([loadTickets(currentPage), loadMetrics()]);
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, REFRESH_MS);
}

// ── Mobile sidebar toggle ──────────────────────────────────────────────────────

const sidebar        = document.querySelector('.sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const btnHamburger   = document.getElementById('btn-hamburger');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarBackdrop.classList.add('open');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('open');
}

btnHamburger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
sidebarBackdrop.addEventListener('click', closeSidebar);

// Close sidebar when a nav item is clicked on mobile
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
  });
});

// ── Login form events ──────────────────────────────────────────────────────────


document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = document.getElementById('login-password').value;
  if (pw) handleLogin(pw);
});

document.getElementById('logout-btn').addEventListener('click', logout);

// ── Init ───────────────────────────────────────────────────────────────────────

(async function init() {
  initCharts();
  await bootstrapAuth();
  if (authToken) {
    await refresh();
    startAutoRefresh();
  }
})();
