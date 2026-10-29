module.exports = function renderAdminApp() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FitNest Admin Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/feather-icons"></script>
  <style>
    :root {
      --primary: #7957F5; --secondary: #FF795B; --accent: #70E1B1; --bg: #F7F5FF;
      --surface: #FFFFFF; --text-main: #20203A; --text-muted: #77758D;
      --clay-radius: 20px;
      --clay-shadow: inset 4px 4px 8px rgba(255,255,255,0.7), inset -4px -4px 8px rgba(200,200,220,0.3), 6px 6px 12px rgba(200,200,220,0.4), -6px -6px 12px rgba(255,255,255,0.8);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text-main); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .hidden { display: none !important; }
    
    .clay-card { background: var(--surface); border-radius: var(--clay-radius); box-shadow: var(--clay-shadow); padding: 24px; }
    .clay-input { width: 100%; padding: 12px 16px; border-radius: 12px; border: none; background: var(--bg); box-shadow: inset 4px 4px 8px rgba(200,200,220,0.4), inset -4px -4px 8px rgba(255,255,255,0.9); margin-bottom: 16px; outline: none; }
    .clay-btn { background: var(--primary); color: white; border: none; border-radius: 12px; padding: 10px 20px; font-weight: bold; cursor: pointer; box-shadow: 2px 2px 4px rgba(121,87,245,0.4); transition: transform 0.1s; }
    .clay-btn:active { transform: scale(0.95); }
    .clay-btn.small { padding: 6px 12px; font-size: 0.8rem; }
    .clay-btn.danger { background: #E94B64; }
    
    #loginScreen { display: flex; align-items: center; justify-content: center; height: 100vh; }
    .login-box { width: 400px; text-align: center; }
    
    #dashboardScreen { display: flex; height: 100vh; }
    .sidebar { width: 250px; padding: 24px; background: var(--surface); box-shadow: 4px 0 10px rgba(0,0,0,0.05); z-index: 10; display: flex; flex-direction: column; }
    .sidebar h2 { color: var(--primary); margin-bottom: 32px; display: flex; align-items: center; gap: 8px; }
    .nav-item { padding: 12px 16px; margin-bottom: 8px; border-radius: 12px; cursor: pointer; font-weight: 600; color: var(--text-muted); transition: 0.3s; }
    .nav-item:hover, .nav-item.active { background: var(--bg); color: var(--primary); box-shadow: inset 2px 2px 4px rgba(200,200,220,0.4); }
    
    .main-content { flex: 1; padding: 32px; overflow-y: auto; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 32px; }
    .stat-val { font-size: 2rem; font-weight: 800; color: var(--primary); }
    
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(200,200,220,0.4); }
    th { color: var(--text-muted); font-size: 0.9rem; }
    
    .badge { padding: 4px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
    .badge.pending { background: rgba(255,215,106,0.3); color: #B38600; }
    .badge.confirmed { background: rgba(21,157,112,0.2); color: var(--success); }
    .badge.canceled { background: rgba(233,75,100,0.2); color: #E94B64; }
  </style>
</head>
<body>

  <!-- Login Screen -->
  <div id="loginScreen">
    <div class="clay-card login-box">
      <h2 style="color: var(--primary); margin-bottom: 24px;">FitNest Admin</h2>
      <form id="loginForm">
        <input type="text" id="username" class="clay-input" placeholder="Username" required>
        <input type="password" id="password" class="clay-input" placeholder="Password" required>
        <button type="submit" class="clay-btn" style="width: 100%;">Secure Login</button>
        <div id="loginError" style="color: #E94B64; margin-top: 16px; font-size: 0.9rem;"></div>
      </form>
    </div>
  </div>

  <!-- Dashboard Screen -->
  <div id="dashboardScreen" class="hidden">
    <div class="sidebar">
      <h2><i data-feather="shield"></i> Admin</h2>
      <div class="nav-item active" onclick="switchTab('overview')">Overview</div>
      <div class="nav-item" onclick="switchTab('bookings')">Bookings</div>
      <div class="nav-item" onclick="switchTab('sessions')">Class Schedule</div>
      <div style="flex:1;"></div>
      <div class="nav-item" onclick="logout()" style="color: #E94B64;"><i data-feather="log-out"></i> Logout</div>
    </div>
    
    <div class="main-content">
      <div class="topbar">
        <h1 id="pageTitle">Overview</h1>
      </div>
      
      <!-- Overview Tab -->
      <div id="tab-overview">
        <div class="stats-grid">
          <div class="clay-card"><div class="stat-val" id="st-total">0</div><div>Total Bookings</div></div>
          <div class="clay-card"><div class="stat-val" id="st-pending">0</div><div>Pending Bookings</div></div>
          <div class="clay-card"><div class="stat-val" id="st-programs">0</div><div>Active Programs</div></div>
        </div>
      </div>
      
      <!-- Bookings Tab -->
      <div id="tab-bookings" class="hidden">
        <div class="clay-card">
          <h3>Recent Bookings</h3>
          <table>
            <thead><tr><th>Ref</th><th>Customer</th><th>Program</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="bookingsTableBody"><tr><td colspan="6">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Sessions Tab -->
      <div id="tab-sessions" class="hidden">
        <div class="clay-card">
          <h3>Upcoming Class Sessions</h3>
          <table>
            <thead><tr><th>Program</th><th>Time</th><th>Capacity</th><th>Booked</th><th>Status</th></tr></thead>
            <tbody id="sessionsTableBody"><tr><td colspan="5">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>
      
    </div>
  </div>

  <script>
    feather.replace();

    // Utility: API call wrapper
    async function apiFetch(url, options = {}) {
      if(!options.headers) options.headers = {};
      options.headers['X-Requested-With'] = 'XMLHttpRequest'; // CSRF mitigation
      const res = await fetch(url, options);
      if(res.status === 401) { showLogin(); throw new Error('Unauthorized'); }
      return res;
    }

    // App Initialization
    async function initAdmin() {
      try {
        const res = await apiFetch('/api/admin/me');
        if(res.ok) showDashboard();
      } catch (e) { showLogin(); }
    }

    function showLogin() {
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('dashboardScreen').classList.add('hidden');
    }
    
    function showDashboard() {
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('dashboardScreen').classList.remove('hidden');
      loadOverview();
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('username').value;
      const p = document.getElementById('password').value;
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        if(res.ok) {
          document.getElementById('loginError').innerText = '';
          showDashboard();
        } else {
          const data = await res.json();
          document.getElementById('loginError').innerText = data.error || 'Login failed';
        }
      } catch(err) { document.getElementById('loginError').innerText = 'Network error'; }
    });

    async function logout() {
      await fetch('/api/admin/logout', { method: 'POST' });
      showLogin();
    }

    function switchTab(tabId) {
      document.querySelectorAll('.main-content > div[id^="tab-"]').forEach(el => el.classList.add('hidden'));
      document.getElementById('tab-' + tabId).classList.remove('hidden');
      document.querySelectorAll('.sidebar .nav-item').forEach(el => el.classList.remove('active'));
      event.currentTarget.classList.add('active');
      
      if(tabId === 'overview') { document.getElementById('pageTitle').innerText = 'Overview'; loadOverview(); }
      if(tabId === 'bookings') { document.getElementById('pageTitle').innerText = 'Manage Bookings'; loadBookings(); }
      if(tabId === 'sessions') { document.getElementById('pageTitle').innerText = 'Class Sessions'; loadSessions(); }
    }

    async function loadOverview() {
      const res = await apiFetch('/api/admin/dashboard');
      if(res.ok) {
        const data = await res.json();
        document.getElementById('st-total').innerText = data.totalBookings;
        document.getElementById('st-pending').innerText = data.pendingBookings;
        document.getElementById('st-programs').innerText = data.activePrograms;
      }
    }

    async function loadBookings() {
      const res = await apiFetch('/api/admin/bookings');
      if(res.ok) {
        const data = await res.json();
        const tbody = document.getElementById('bookingsTableBody');
        tbody.innerHTML = data.map(b => \`
          <tr>
            <td>\${b.bookingRef}</td>
            <td>\${b.customerName}<br><small style="color:var(--text-muted)">\${b.customerPhone}</small></td>
            <td>\${b.program ? b.program.name : 'N/A'}</td>
            <td>\${new Date(b.createdAt).toLocaleDateString()}</td>
            <td><span class="badge \${b.status}">\${b.status}</span></td>
            <td>
              <select onchange="updateBookingStatus('\${b._id}', this.value)" style="padding:4px; border-radius:4px;">
                <option value="" disabled selected>Change Status</option>
                <option value="confirmed">Confirm</option>
                <option value="canceled">Cancel</option>
              </select>
            </td>
          </tr>
        \`).join('');
      }
    }

    async function updateBookingStatus(id, newStatus) {
      if(!confirm(\`Change status to \${newStatus}?\`)) return;
      const res = await apiFetch(\`/api/admin/bookings/\${id}/status\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if(res.ok) { alert('Updated successfully.'); loadBookings(); }
      else { alert('Update failed.'); }
    }

    async function loadSessions() {
      const res = await apiFetch('/api/admin/sessions');
      if(res.ok) {
        const data = await res.json();
        const tbody = document.getElementById('sessionsTableBody');
        tbody.innerHTML = data.map(s => \`
          <tr>
            <td>\${s.program ? s.program.name : 'Unknown'}</td>
            <td>\${new Date(s.startTime).toLocaleString()}</td>
            <td>\${s.capacity}</td>
            <td>\${s.booked}</td>
            <td><span class="badge \${s.status}">\${s.status}</span></td>
          </tr>
        \`).join('');
      }
    }

    initAdmin();
  </script>
</body>
</html>`;
}
