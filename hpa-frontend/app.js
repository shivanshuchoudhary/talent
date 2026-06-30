// ====================== DATA (API) ======================
let ALL = [];
let AUTH = {};
let PAYLOAD_DEFAULT = { records: [], auth: {} };
let apiToken = sessionStorage.getItem('sobha_token') || '';
let pendingIdentityProfiles = [];
let selectedIdentityUsername = null;

async function loadDashboardData() {
  const [bookingsRes, usersRes, mappingRes, metaRes] = await Promise.all([
    API.getBookings(),
    API.getUsers(),
    API.getTeamMapping(),
    API.getMeta(),
  ]);
  ALL = bookingsRes.records;
  AUTH = {};
  usersRes.users.forEach(u => { AUTH[u.username] = u; });
  PAYLOAD_DEFAULT = { records: ALL, auth: AUTH };
  if (mappingRes && mappingRes.headers) {
    mappingData = mappingRes;
    window.TEAM_MAPPING_DEFAULT = mappingRes;
  }
  if (metaRes && metaRes.sbtr_as_of) {
    const el = document.getElementById('dataAsOf');
    if (el) el.textContent = metaRes.sbtr_as_of;
  }
  _personIndex = null;
  _orgTree = null;
  _mappingCols = null;
}

if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);
Chart.defaults.font.family = "Calibri, 'Trebuchet MS', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#4a4438';
Chart.defaults.borderColor = '#e8e3d7';

let currentUser = null;
let baseRecords = [];
let viewAsPerson = null;   // {name, role} when management is impersonating a person's footprint
let selectedLocs = new Set(['Dubai','UAQ','Abu Dhabi']);
let vpSdFilters = {};
let recentFilters = {};
let charts = {};
let mappingData = null;   // { headers:[], rows:[[]], fileName:'' } for Sales Team Mapping
const MAPPING_STORAGE = 'sobha_team_mapping_v1';

// ====================== MOBILE CONTROLS TOGGLE ======================
function toggleControls() {
  try {
    const el = document.getElementById('ctrlCollapsible');
    const btn = document.getElementById('ctrlToggle');
    if (!el || !btn) return;
    
    const collapsed = el.classList.toggle('collapsed');
    btn.innerHTML = collapsed
      ? `<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/></svg> Filters &amp; Date Range`
      : `<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/></svg> Hide Filters`;
    
    // Also swap display style so it works without the class on desktop
    if (window.innerWidth > 768) { 
      el.classList.remove('collapsed'); 
      el.style.display = 'flex'; 
    }
  } catch (e) {
    console.error('Error in toggleControls:', e);
  }
}

// Re-show controls panel when resizing to desktop
window.addEventListener('resize', () => {
  const el = document.getElementById('ctrlCollapsible');
  if (!el) return;
  if (window.innerWidth > 768) {
    el.classList.remove('collapsed');
    el.style.removeProperty('display');
  }
});

// ====================== LOGIN ======================
async function doLogin() {
  const user = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPin').value.trim();
  const err = document.getElementById('loginErr');
  err.classList.remove('show');
  try {
    const res = await API.login(user, password);
    apiToken = res.token;
    sessionStorage.setItem('sobha_token', apiToken);
    
    currentUser = {
      username: res.username,
      name: res.name,
      role: res.role,
      scope_type: res.scope_type,
      scope_value: res.scope_value,
      email: res.email || '',
    };
    sessionStorage.setItem('sobha_user_v5', JSON.stringify(currentUser));
    sessionStorage.removeItem('sobha_identity');
    
    if (res.role === 'admin') {
      window.location.href = '/admin';
      return;
    }
    
    await beginViewerSession();
  } catch (e) {
    err.textContent = 'Invalid username or password';
    err.classList.add('show');
  }
}

// Microsoft SSO Login
async function microsoftSSO() {
  const ssoBtn = document.getElementById('microsoftSSOBtn');
  if (ssoBtn && ssoBtn.dataset.busy === '1') return;
  if (ssoBtn) ssoBtn.dataset.busy = '1';
  if (ssoBtn) ssoBtn.disabled = true;
  try {
    const response = await fetch('/api/v1/auth/microsoft/login');
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    const data = await response.json();
    if (!data || !data.auth_url) {
      throw new Error('Missing Microsoft authentication URL');
    }
    // Redirect to Microsoft login
    window.location.href = data.auth_url;
  } catch (error) {
    const err = document.getElementById('loginErr');
    err.textContent = 'Failed to initiate Microsoft login: ' + error.message;
    err.classList.add('show');
    if (ssoBtn) ssoBtn.disabled = false;
    if (ssoBtn) ssoBtn.dataset.busy = '0';
  }
}

function bindMicrosoftSSOClickHandler() {
  if (window.__sobhaMicrosoftSSOBound) return;
  window.__sobhaMicrosoftSSOBound = true;

  document.addEventListener('click', (event) => {
    const btn = event.target && event.target.closest
      ? event.target.closest('#microsoftSSOBtn,[data-microsoft-sso="1"]')
      : null;
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();
    microsoftSSO();
  }, true);
}

function clearSsoSession() {
  ['sobha_token', 'sobha_user_v5', 'sobha_user', 'sobha_identity'].forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

function resetSsoButton() {
  const ssoBtn = document.getElementById('microsoftSSOBtn');
  if (!ssoBtn) return;
  ssoBtn.disabled = false;
  ssoBtn.dataset.busy = '0';
}

// Handle Microsoft OAuth callback
async function handleMicrosoftCallback() {
  const params = new URLSearchParams(window.location.search);
  const authCode = params.get('code');
  const state = params.get('state');
  
  if (!authCode) return;
  
  try {
    const response = await fetch('/api/v1/auth/microsoft/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authCode, state: state })
    });
    
    if (!response.ok) {
      throw new Error('Authentication failed');
    }
    
    const data = await response.json();
    
    // Store token and user info
    apiToken = data.token;
    sessionStorage.setItem('sobha_token', apiToken);
    
    currentUser = {
      username: data.username,
      name: data.name,
      role: data.role,
      scope_type: data.scope_type,
      scope_value: data.scope_value,
      email: data.email || ''
    };
    sessionStorage.setItem('sobha_user_v5', JSON.stringify(currentUser));
    sessionStorage.setItem('sobha_user', JSON.stringify(currentUser));
    sessionStorage.removeItem('sobha_identity');

    // Prevent replay of one-time auth codes on refresh/navigation.
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (_) {}
    
    if (data.role === 'admin') {
      window.location.href = '/admin';
      return;
    }
    
    await beginViewerSession();
  } catch (error) {
    const err = document.getElementById('loginErr');
    err.textContent = 'Microsoft login failed: ' + error.message;
    err.classList.add('show');
  }
}

// Check for OAuth callback on page load
if (window.location.search.includes('code=')) {
  handleMicrosoftCallback();
}

// Initialize page on load - restore session or show login
async function initializePage() {
  try {
    // Check if required elements exist before proceeding
    if (!document.getElementById('loginWrap')) {
      console.log('Page still loading, deferring initialization');
      return;
    }
    
    const token = sessionStorage.getItem('sobha_token');
    const userJson = sessionStorage.getItem('sobha_user_v5');
    
    // Only proceed if we have both token and user data
    if (token && userJson) {
      try {
        currentUser = JSON.parse(userJson);
        apiToken = token;
        
        // Admin users go to admin panel
        if (currentUser && currentUser.role === 'admin') {
          console.log('Restoring admin session');
          await enterAdminPanel();
          return;
        }
        
        // Regular users go to home
        if (currentUser) {
          console.log('Restoring regular user session');
          await beginViewerSession();
          return;
        }
      } catch (e) {
        console.error('Failed to parse session data:', e);
        sessionStorage.removeItem('sobha_token');
        sessionStorage.removeItem('sobha_user_v5');
      }
    }
    
    // No valid session - show login form (it's already visible by default)
    console.log('No valid session, showing login form');
  } catch (e) {
    console.error('Error in initializePage:', e);
  }
}

// Run initialization on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindMicrosoftSSOClickHandler);
} else {
  bindMicrosoftSSOClickHandler();
}

async function beginViewerSession() {
  try {
    await loadDashboardData();
    const loginWrap = document.getElementById('loginWrap');
    if (loginWrap) loginWrap.style.display = 'none';
    
    if (currentUser) {
      enterHome();
    } else {
      showIdentityPicker();
    }
  } catch (e) {
    console.error('Error in beginViewerSession:', e);
  }
}

function showIdentityPicker() {
  try {
    const wrap = document.getElementById('identityWrap');
    if (!wrap) return;
    
    wrap.style.display = 'grid';
    const logo = document.querySelector('#loginWrap .login-brand img');
    const identityLogo = document.getElementById('identityLogoImg');
    if (logo && identityLogo) identityLogo.src = logo.src;
    
    pendingIdentityProfiles = Object.values(AUTH).filter(u => u.role !== 'Management');
    pendingIdentityProfiles.sort((a, b) => a.name.localeCompare(b.name));
    selectedIdentityUsername = sessionStorage.getItem('sobha_identity') || null;
    
    const idSearch = document.getElementById('identitySearch');
    if (idSearch) {
      renderIdentityList(idSearch.value.trim());
      idSearch.oninput = (e) => renderIdentityList(e.target.value.trim());
    }
  } catch (e) {
    console.error('Error in showIdentityPicker:', e);
  }
}

function renderIdentityList(q) {
  try {
    const list = document.getElementById('identityList');
    if (!list) return;
    
    const ql = q.toLowerCase();
    const items = pendingIdentityProfiles.filter(u =>
      !ql || u.name.toLowerCase().includes(ql) || u.role.toLowerCase().includes(ql)
    ).slice(0, 80);
    list.innerHTML = items.map(u => `
      <div class="identity-item${selectedIdentityUsername === u.username ? ' selected' : ''}" data-u="${escapeHtml(u.username)}">
        ${escapeHtml(u.name)}
        <small>${escapeHtml(u.role)}</small>
      </div>`).join('') || '<div class="identity-item">No matches</div>';
    
    list.querySelectorAll('.identity-item[data-u]').forEach(el => {
      el.onclick = () => pickIdentity(el.getAttribute('data-u'));
    });
  } catch (e) {
    console.error('Error in renderIdentityList:', e);
  }
}

function pickIdentity(username) {
  selectedIdentityUsername = username;
  renderIdentityList(document.getElementById('identitySearch').value.trim());
}

async function confirmIdentity() {
  const err = document.getElementById('identityErr');
  if (!selectedIdentityUsername || !AUTH[selectedIdentityUsername]) {
    err.classList.add('show');
    return;
  }
  err.classList.remove('show');
  currentUser = { username: selectedIdentityUsername, ...AUTH[selectedIdentityUsername] };
  sessionStorage.setItem('sobha_user_v5', JSON.stringify(currentUser));
  sessionStorage.setItem('sobha_identity', selectedIdentityUsername);
  document.getElementById('identityWrap').style.display = 'none';
  enterHome();
}

// ====================== HOME LAUNCHER & APP NAVIGATION ======================
function syncBrandLogos() {
  const srcImg = document.querySelector('#app .header-logo img');
  const src = srcImg ? srcImg.getAttribute('src') : '';
  ['homeLogoImg','mappingLogoImg'].forEach(id => {
    const el = document.getElementById(id);
    if (el && src) el.setAttribute('src', src);
  });
}

function enterHome() {
  syncBrandLogos();
  const loginWrap = document.getElementById('loginWrap');
  if (loginWrap) loginWrap.style.display = 'none';
  
  const identityWrap = document.getElementById('identityWrap');
  if (identityWrap) identityWrap.style.display = 'none';
  
  const app = document.getElementById('app');
  if (app) app.classList.remove('show');
  
  const mappingView = document.getElementById('mappingView');
  if (mappingView) mappingView.classList.remove('show');
  
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) adminPanel.classList.remove('show');
  
  const home = document.getElementById('home');
  if (home) home.classList.add('show');
  
  if (currentUser) {
    const dispName = currentUser.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : currentUser.name;
    const roleDisplay = currentUser.role === 'Ashish Parakh' ? 'Head of Sales' : currentUser.role;
    const firstName = (dispName || 'there').split(' ')[0];
    
    const homeGreetEl = document.getElementById('homeGreetName');
    if (homeGreetEl) homeGreetEl.textContent = firstName;
    
    const homeUserEl = document.getElementById('homeUserName');
    if (homeUserEl) homeUserEl.textContent = dispName;
    
    const homeRoleEl = document.getElementById('homeUserRole');
    if (homeRoleEl) homeRoleEl.textContent = roleDisplay;
  }
  
  // Show admin tile for admin users
  const adminTile = document.getElementById('adminTile');
  if (adminTile) {
    adminTile.style.display = currentUser && currentUser.role === 'admin' ? '' : 'none';
  }
}

function openPerformance() {
  const home = document.getElementById('home');
  if (home) home.classList.remove('show');
  
  const mappingView = document.getElementById('mappingView');
  if (mappingView) mappingView.classList.remove('show');
  
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) adminPanel.classList.remove('show');
  
  enterDashboard();   // shows #app and (re)initialises the dashboard
}

function openTeamMapping() {
  syncBrandLogos();
  const home = document.getElementById('home');
  if (home) home.classList.remove('show');
  
  const app = document.getElementById('app');
  if (app) app.classList.remove('show');
  
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) adminPanel.classList.remove('show');
  
  const mappingView = document.getElementById('mappingView');
  if (mappingView) mappingView.classList.add('show');
  
  loadMappingFromStorage();
  // Management isn't a real person → no personal view; default to full org.
  const isMgmt = currentUser && currentUser.role === 'Management';
  const meTab = document.querySelector('.mtab[data-tab="me"]');
  if (meTab) meTab.classList.toggle('hidden', isMgmt);
  // Only Management can manage (upload/replace) the mapping file; others view-only.
  const fileTab = document.querySelector('.mtab[data-tab="file"]');
  if (fileTab) fileTab.classList.toggle('hidden', !isMgmt);
  switchMappingTab(isLeadership() ? 'all' : 'me');
}

let mappingTab = 'me';
function switchMappingTab(tab) {
  mappingTab = tab;
  document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  
  const orgPanel = document.getElementById('orgPanel');
  if (orgPanel) orgPanel.style.display = (tab === 'file') ? 'none' : '';
  
  const filePanel = document.getElementById('filePanel');
  if (filePanel) filePanel.style.display = (tab === 'file') ? '' : 'none';
  
  const searchWrap = document.querySelector('.mapping-tab-search');
  if (searchWrap) searchWrap.style.display = (tab === 'file') ? 'none' : '';
  
  if (tab === 'file') { 
    renderMappingState(); 
    if (mappingData) renderMappingTable(); 
    return; 
  }
  
  const sb = document.getElementById('orgSearch');
  if (sb) sb.value = '';
  
  loadMappingFromStorage();
  if (!buildOrgTreeFromMapping()) buildOrgTree();   // mapping file preferred; SBTR fallback
  renderOrgLegend();
  if (tab === 'me') renderPersonalOrg(currentUser.name);
  else renderFullOrg();
}

function openAdminPanel() {
  syncBrandLogos();
  const home = document.getElementById('home');
  if (home) home.classList.remove('show');
  
  const app = document.getElementById('app');
  if (app) app.classList.remove('show');
  
  const mappingView = document.getElementById('mappingView');
  if (mappingView) mappingView.classList.remove('show');
  
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) {
    adminPanel.classList.add('show');
  }
  
  // Show upload button
  const uploadBtn = document.getElementById('btnUpload');
  if (uploadBtn) uploadBtn.style.display = '';
  
  // Update admin header
  if (currentUser) {
    const dispName = currentUser.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : currentUser.name;
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = dispName;
    
    const userRoleEl = document.getElementById('userRole');
    if (userRoleEl) userRoleEl.textContent = 'Admin';
  }
}

// Show admin upload panel on page load/init
async function enterAdminPanel() {
  try {
    // Hide other sections - check if they exist first
    const loginWrap = document.getElementById('loginWrap');
    if (loginWrap) loginWrap.style.display = 'none';
    
    const home = document.getElementById('home');
    if (home) home.classList.remove('show');
    
    const app = document.getElementById('app');
    if (app) app.classList.remove('show');
    
    const mappingView = document.getElementById('mappingView');
    if (mappingView) mappingView.classList.remove('show');
    
    // Show admin panel
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) {
      adminPanel.classList.add('show');
    }
    
    // Load dashboard data
    await loadDashboardData();
    
    // Show upload button
    const uploadBtn = document.getElementById('btnUpload');
    if (uploadBtn) {
      uploadBtn.style.display = '';
    }
    
    // Update header info
    if (currentUser) {
      const dispName = currentUser.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : currentUser.name;
      const userNameEl = document.getElementById('userName');
      if (userNameEl) userNameEl.textContent = dispName;
      
      const userRoleEl = document.getElementById('userRole');
      if (userRoleEl) userRoleEl.textContent = 'Admin';
    }
    
    console.log('Admin panel initialized');
  } catch (e) {
    console.error('Error in enterAdminPanel:', e);
  }
}

function goHome() {
  enterHome();
}

// ====================== SALES TEAM MAPPING ======================
// Generic .xlsx → table viewer. Stored in localStorage so it persists across sessions
// and is shared by everyone opening this file. Order-preserving (shows every column).
function parseMappingXlsx(file) {
  return file.arrayBuffer().then(buf => {
    const bytes = new Uint8Array(buf);
    const u16 = o => bytes[o] | (bytes[o+1] << 8);
    const u32 = o => (bytes[o] | (bytes[o+1] << 8) | (bytes[o+2] << 16) | (bytes[o+3] << 24)) >>> 0;
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) { if (u32(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('Not a valid .xlsx file.');
    const cdOff = u32(eocd + 16), total = u16(eocd + 10);
    let p = cdOff; const files = {};
    for (let i = 0; i < total; i++) {
      const compMethod = u16(p+10), compSize = u32(p+20), nameLen = u16(p+28), extraLen = u16(p+30), commentLen = u16(p+32), localHdrOff = u32(p+42);
      const name = new TextDecoder().decode(bytes.subarray(p+46, p+46+nameLen));
      const lhNameLen = u16(localHdrOff+26), lhExtraLen = u16(localHdrOff+28);
      const dataStart = localHdrOff + 30 + lhNameLen + lhExtraLen;
      files[name] = { compMethod, compData: bytes.subarray(dataStart, dataStart + compSize) };
      p += 46 + nameLen + extraLen + commentLen;
    }
    async function inflate(c) {
      if (c.compMethod === 0) return c.compData;
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter(); w.write(c.compData); w.close();
      const reader = ds.readable.getReader(); const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
      const len = chunks.reduce((s,c)=>s+c.length,0); const out = new Uint8Array(len); let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      return out;
    }
    const decodeXml = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    return (async () => {
      const strings = [];
      if (files['xl/sharedStrings.xml']) {
        const ss = new TextDecoder().decode(await inflate(files['xl/sharedStrings.xml']));
        let m; const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
        while ((m = re.exec(ss))) {
          const ts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decodeXml(x[1]));
          strings.push(ts.join(''));
        }
      }
      let sheetKey;
      for (const k of Object.keys(files)) { if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) { sheetKey = k; break; } }
      if (!sheetKey) throw new Error('No worksheet found.');
      const sheet = new TextDecoder().decode(await inflate(files[sheetKey]));
      const colIdx = ref => { const letters = ref.match(/^([A-Z]+)/)[1]; let n = 0; for (const c of letters) n = n*26 + (c.charCodeAt(0)-64); return n - 1; };
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
      const allRows = []; let maxCol = 0; let m;
      while ((m = rowRe.exec(sheet))) {
        const rowArr = [];
        for (const cm of m[1].matchAll(cellRe)) {
          const attrs = cm[1], inner = cm[2] || '';
          const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
          const ref = (attrs.match(/\br="([^"]+)"/) || [])[1];
          const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          const isStr = (inner.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/) || [])[1];
          let val;
          if (t === 's' && v != null) val = strings[parseInt(v)];
          else if (t === 'inlineStr' && isStr != null) val = decodeXml(isStr);
          else if (t === 'str' && v != null) val = decodeXml(v);
          else val = v != null ? v : '';
          const ci = ref ? colIdx(ref) : rowArr.length;
          rowArr[ci] = val == null ? '' : String(val);
          if (ci + 1 > maxCol) maxCol = ci + 1;
        }
        allRows.push(rowArr);
      }
      if (!allRows.length) throw new Error('The sheet is empty.');
      // Normalise width, drop fully-empty trailing rows
      const norm = allRows.map(r => { const a = []; for (let i = 0; i < maxCol; i++) a[i] = r[i] != null ? r[i] : ''; return a; });
      while (norm.length && norm[norm.length-1].every(c => c === '')) norm.pop();
      const headers = norm[0].map((h, i) => (h && h.trim()) ? h : `Column ${i+1}`);
      const rows = norm.slice(1).filter(r => r.some(c => c !== ''));
      return { headers, rows };
    })();
  });
}

function onMappingUpload(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const drop = document.getElementById('mappingDrop');
  if (drop) drop.querySelector('h3').textContent = 'Parsing…';
  parseMappingXlsx(file).then(({ headers, rows }) => {
    mappingData = { headers, rows, fileName: file.name };
    try { localStorage.setItem(MAPPING_STORAGE, JSON.stringify(mappingData)); } catch (e) {}
    _mapTree = null;   // invalidate leaderboard mapping tree
    _mappingCols = null; // invalidate column index cache
    renderMappingState();
    renderMappingTable();
    // Rebuild the org chart from the new mapping so it's live immediately.
    if (buildOrgTreeFromMapping()) { renderOrgLegend(); if (mappingTab === 'all') renderFullOrg(); else if (mappingTab === 'me') renderPersonalOrg(currentUser.name); }
  }).catch(err => {
    if (drop) drop.querySelector('h3').textContent = 'Upload the Sales Team Mapping file';
    alert('Could not read this file:\n\n' + (err.message || err));
  });
}

function loadMappingFromStorage() {
  if (mappingData) return;
  _mappingCols = null;
  if (window.TEAM_MAPPING_DEFAULT) {
    mappingData = JSON.parse(JSON.stringify(window.TEAM_MAPPING_DEFAULT));
  }
}

function renderMappingState() {
  const empty = document.getElementById('mappingEmpty');
  const loaded = document.getElementById('mappingLoaded');
  if (mappingData && mappingData.headers) {
    empty.style.display = 'none';
    loaded.style.display = '';
  } else {
    empty.style.display = '';
    loaded.style.display = 'none';
    const drop = document.getElementById('mappingDrop');
    if (drop) drop.querySelector('h3').textContent = 'Upload the Sales Team Mapping file';
  }
}

function renderMappingTable() {
  if (!mappingData) return;
  const q = (document.getElementById('mappingSearch').value || '').trim().toLowerCase();
  const { headers, rows } = mappingData;
  document.getElementById('mappingHeaderRow').innerHTML =
    '<th style="width:46px;text-align:right;color:var(--muted);">#</th>' +
    headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const filtered = q ? rows.filter(r => r.some(c => String(c).toLowerCase().includes(q))) : rows;
  const body = document.getElementById('mappingBody');
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="${headers.length + 1}" class="empty">No rows match "${escapeHtml(q)}"</td></tr>`;
  } else {
    body.innerHTML = filtered.map((r, i) =>
      `<tr><td class="num" style="color:var(--muted);">${i+1}</td>` +
      headers.map((_, ci) => `<td>${escapeHtml(r[ci] || '')}</td>`).join('') +
      '</tr>'
    ).join('');
  }
  document.getElementById('mappingMeta').textContent =
    `${filtered.length}${q ? ' of ' + rows.length : ''} row${filtered.length === 1 ? '' : 's'} · ${headers.length} columns`;
  document.getElementById('mappingFileName').textContent = mappingData.fileName || '';
}

function clearMapping() {
  if (!confirm('Reset to the mapping shipped with this file? Any uploaded replacement will be removed.')) return;
  mappingData = null;
  _mappingCols = null;
  try { localStorage.removeItem(MAPPING_STORAGE); } catch (e) {}
  const s = document.getElementById('mappingSearch'); if (s) s.value = '';
  loadMappingFromStorage();   // restores the embedded default
  renderMappingState();
  if (mappingData) renderMappingTable();
}

// ====================== ORG CHART (derived from SBTR hierarchy) ======================
const ORG_LEVELS = [
  { key: 'r_cso',  label: 'CSO' },
  { key: 'r_srvp', label: 'Sr. VP' },
  { key: 'r_th',   label: 'Vice President' },
  { key: 'r_sd',   label: 'Sales Director' },
  { key: 'r_sm',   label: 'Sales Manager' }
];
let _orgTree = null;

function buildOrgTree() {
  // Derive a reporting tree by linking each booking's role chain (top→bottom),
  // then assigning every person their single most-frequent parent (dominant manager).
  const levelOf = new Map();          // name -> highest level index they occupy
  const parentCounts = new Map();     // child -> Map(parent -> count)
  const setLvl = (name, lvl) => { if (name && (!levelOf.has(name) || lvl < levelOf.get(name))) levelOf.set(name, lvl); };
  for (const r of ALL) {
    const seq = [];
    for (let i = 0; i < ORG_LEVELS.length; i++) { const v = r[ORG_LEVELS[i].key]; if (v) seq.push({ name: v, lvl: i }); }
    for (const s of seq) setLvl(s.name, s.lvl);
    for (let i = 1; i < seq.length; i++) {
      const child = seq[i].name, parent = seq[i-1].name;
      if (child === parent) continue;
      if (!parentCounts.has(child)) parentCounts.set(child, new Map());
      const m = parentCounts.get(child);
      m.set(parent, (m.get(parent) || 0) + 1);
    }
  }
  const domParent = new Map(), children = new Map();
  for (const [child, m] of parentCounts) {
    let best = null, bestC = -1;
    for (const [p, c] of m) { if (c > bestC) { bestC = c; best = p; } }
    // guard: parent must rank above child
    if (best != null && (levelOf.get(best) ?? 99) < (levelOf.get(child) ?? 99)) {
      domParent.set(child, best);
      if (!children.has(best)) children.set(best, new Set());
      children.get(best).add(child);
    }
  }
  _orgTree = { levelOf, domParent, children };
}

// Detect a person's highest-level column in the mapping (0=CSO, 2=VP, 3=SD, 4=SM)
function getMappingPersonLevel(name) {
  if (!name) return 4;
  loadMappingFromStorage();
  if (!mappingData || !mappingData.rows) return 4;
  const c = getMappingCols();
  if (!c) return 4;
  let lvl = 4;
  for (const row of mappingData.rows) {
    const g = ci => ci >= 0 ? (row[ci]||'').trim() : '';
    if (c.cso >= 0 && g(c.cso) === name && lvl > 0) lvl = 0;
    else if (c.vp >= 0 && g(c.vp) === name && lvl > 2) lvl = 2;
    else if (c.sd >= 0 && g(c.sd) === name && lvl > 3) lvl = 3;
    if (lvl === 0) break;
  }
  return lvl;
}
// Columns are detected by header name and mapped onto the 5 ORG_LEVELS indices:
//   0 CSO · 1 Sr. VP · 2 Vice President (VP) · 3 Sales Director (Sales Head) · 4 Sales Manager (employee)
// Returns the tree object {levelOf, domParent, children} or null if no mapping is available.
function buildMapTreeObj() {
  if (!mappingData || !mappingData.headers || !mappingData.rows || !mappingData.rows.length) return null;
  const H = mappingData.headers.map(h => (h || '').toLowerCase());
  const findCol = test => H.findIndex(test);
  const colOf = {
    0: findCol(s => s.includes('cso') || s.includes('chief')),
    1: findCol(s => (s.includes('sr') || s.includes('senior')) && s.includes('vp')),
    2: findCol(s => (s === 'vp' || s.includes('vice president') || s.includes('team head') || (s.includes('vp') && !s.includes('sr') && !s.includes('senior')))),
    3: findCol(s => s.includes('sales head') || s.includes('sales director')),
    4: findCol(s => s.includes('name') || s.includes('employee') || s.includes('sales manager'))
  };
  if (colOf[4] < 0) colOf[4] = 0; // employee column defaults to first column
  const levelOf = new Map(), parentCounts = new Map();
  const setLvl = (name, lvl) => { if (name && (!levelOf.has(name) || lvl < levelOf.get(name))) levelOf.set(name, lvl); };
  for (const row of mappingData.rows) {
    const seq = [];
    for (let lvl = 0; lvl <= 4; lvl++) {
      const ci = colOf[lvl];
      if (ci >= 0) { const v = (row[ci] || '').trim(); if (v) seq.push({ name: v, lvl }); }
    }
    for (const s of seq) setLvl(s.name, s.lvl);
    for (let i = 1; i < seq.length; i++) {
      const child = seq[i].name, parent = seq[i-1].name;
      if (child === parent) continue;
      if (!parentCounts.has(child)) parentCounts.set(child, new Map());
      const m = parentCounts.get(child);
      m.set(parent, (m.get(parent) || 0) + 1);
    }
  }
  const domParent = new Map(), children = new Map();
  for (const [child, m] of parentCounts) {
    let best = null, bestC = -1;
    for (const [p, c] of m) { if (c > bestC) { bestC = c; best = p; } }
    if (best != null && (levelOf.get(best) ?? 99) < (levelOf.get(child) ?? 99)) {
      domParent.set(child, best);
      if (!children.has(best)) children.set(best, new Set());
      children.get(best).add(child);
    }
  }
  return { levelOf, domParent, children };
}

// ---- Direct mapping lookups (no tree, reads rows directly) ----
let _mappingCols = null;
function getMappingCols() {
  if (_mappingCols) return _mappingCols;
  loadMappingFromStorage();
  if (!mappingData) return (_mappingCols = null);
  const H = mappingData.headers.map(h => (h||'').toLowerCase());
  const i = test => H.findIndex(test);
  _mappingCols = {
    sm:   i(s => s.includes('name') || s.includes('employee') || s.includes('sales manager')),
    sd:   i(s => s.includes('sales head') || s.includes('sales director')),
    vp:   i(s => s==='vp' || s.includes('vice president') || s.includes('team head') || (s.includes('vp')&&!s.includes('sr')&&!s.includes('senior'))),
    cso:  i(s => s.includes('cso') || s.includes('chief')),
    team: i(s => s==='team' || s==='region' || s.includes('location'))
  };
  return _mappingCols;
}

// Returns direct reports for any person, reading mapping rows directly.
// Only returns people at the single most-common level directly below the querying person
// to prevent cross-level contamination (e.g. VP names leaking into SM leaderboard).
function mappingDirectReports(name) {
  if (!name) return [];
  loadMappingFromStorage();
  if (!mappingData || !mappingData.rows) return [];
  const c = getMappingCols();
  if (!c) return [];
  const isVinit = name === 'Vinit Manishbhai Parikh' || name === 'Vinit Parikh';
  const isMani  = name === 'Mani Tyagi';
  const isCso   = isVinit || isMani;
  // Bucket results by which target column they came from
  const vpBucket = new Set(), sdBucket = new Set(), smBucket = new Set();
  for (const row of mappingData.rows) {
    const getC = ci => ci >= 0 ? (row[ci]||'').trim() : '';
    const team = getC(c.team);
    const isAD = /abu\s*dhabi/i.test(team);
    // CSO → VPs (explicit CSO column)
    if (c.cso >= 0 && getC(c.cso) === name) {
      const v = getC(c.vp); if (v && v !== name) vpBucket.add(v);
    }
    // VP → SDs
    if (c.vp >= 0 && getC(c.vp) === name) {
      const v = getC(c.sd); if (v && v !== name) sdBucket.add(v);
    }
    // SD → SMs (skip for CSO-level)
    if (!isCso && c.sd >= 0 && getC(c.sd) === name) {
      const v = getC(c.sm); if (v && v !== name) smBucket.add(v);
    }
    // Vinit CSO fallback (no CSO column) → collect distinct VPs from non-AD rows
    if (c.cso < 0 && isVinit && !isAD) {
      const v = getC(c.vp);
      if (v && !/vinit/i.test(v) && !/mani/i.test(v)) vpBucket.add(v);
    }
    // Mani CSO fallback (no CSO column) → collect SDs from AD rows
    if (c.cso < 0 && isMani && isAD) {
      const v = getC(c.sd); if (v && v !== name) sdBucket.add(v);
    }
  }
  // Return the most specific non-empty bucket in priority: VP > SD > SM
  // This prevents VPs bleeding into SM leaderboard
  if (vpBucket.size) return [...vpBucket].sort();
  if (sdBucket.size) return [...sdBucket].sort();
  return [...smBucket].sort();
}

function buildOrgTreeFromMapping() {
  const t = buildMapTreeObj();
  if (!t) return false;
  _orgTree = { levelOf: t.levelOf, domParent: t.domParent, children: t.children, fromMapping: true };
  return true;
}
function orgDisplay(name) { return name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : name; }
function orgKids(name) {
  const t = _orgTree;
  return [...(t.children.get(name) || [])].sort((a, b) =>
    ((t.levelOf.get(a) ?? 9) - (t.levelOf.get(b) ?? 9)) || a.localeCompare(b));
}
function orgDescendantCount(name, guard) {
  guard = guard || new Set();
  if (guard.has(name)) return 0; guard.add(name);
  let n = 0;
  for (const k of (_orgTree.children.get(name) || [])) n += 1 + orgDescendantCount(k, guard);
  return n;
}

function renderOrgLegend() {
  const colors = ['#7c3aed', '#2563eb', '#b08a4e', '#0d9488', '#9ca3af'];
  document.getElementById('orgLegend').innerHTML = ORG_LEVELS.map((L, i) =>
    `<span class="lg"><span class="sw" style="background:${colors[i]};"></span>${L.label}</span>`
  ).join('');
}

// Render a single node's <li>. opts: { me, expandDepth, depth }
function orgNodeLi(name, opts) {
  const t = _orgTree;
  const lvl = t.levelOf.get(name) ?? 4;
  const kids = orgKids(name);
  const depth = opts.depth || 0;
  const hasKids = kids.length > 0;
  const collapsed = hasKids && depth >= opts.expandDepth;
  const totalReports = hasKids ? orgDescendantCount(name) : 0;
  const me = opts.me === name;
  const childUl = hasKids ? `<ul>${kids.map(k => orgNodeLi(k, { ...opts, depth: depth + 1 })).join('')}</ul>` : '';
  const toggle = hasKids ? `<button class="org-toggle" onclick="toggleOrgNode(this)">${collapsed ? '+' : '\u2212'}</button>` : '';
  const countLine = hasKids ? `<div class="org-count">${kids.length} direct \u00b7 ${totalReports} total</div>` : '';
  return `<li class="org-li ${collapsed ? 'collapsed' : ''}">
    <div class="org-node org-lvl-${lvl} ${me ? 'me' : ''} ${hasKids ? 'clickable' : ''}"${hasKids ? ' onclick="toggleOrgNode(this.querySelector(\'.org-toggle\'))"' : ''}>
      <div class="org-role">${ORG_LEVELS[lvl] ? ORG_LEVELS[lvl].label : ''}</div>
      <div class="org-name">${escapeHtml(orgDisplay(name))}</div>
      ${countLine}
      ${toggle}
    </div>
    ${childUl}
  </li>`;
}

// Build a clean {dubai:{vps:[{name,sds:[{name,sms:[]}]}]}, abudhabi:{sds:[{name,sms:[]}]}}
// from mappingData rows. Does NOT require a CSO column — uses Team column instead.
function getMappingHierarchy() {
  loadMappingFromStorage();
  if (!mappingData || !mappingData.rows || !mappingData.rows.length) return null;
  const H = mappingData.headers.map(h => (h || '').toLowerCase());
  const idxOf = test => H.findIndex(test);
  const smC  = idxOf(s => s.includes('name') || s.includes('employee') || s.includes('sales manager'));
  const sdC  = idxOf(s => s.includes('sales head') || s.includes('sales director'));
  const vpC  = idxOf(s => s === 'vp' || s.includes('vice president') || s.includes('team head') || (s.includes('vp') && !s.includes('sr') && !s.includes('senior')));
  const teamC = idxOf(s => s === 'team' || s === 'region' || s.includes('location') || s.includes('city'));
  const csoC  = idxOf(s => s.includes('cso') || s.includes('chief'));
  const dubaiVPs = new Map();   // VP → Map<SD, Set<SM>>
  const adSDs    = new Map();   // SD → Set<SM>
  const dubaiDirect = new Set(); // SMs who report directly to Vinit
  for (const row of mappingData.rows) {
    const sm   = smC  >= 0 ? (row[smC]  || '').trim() : '';
    const sd   = sdC  >= 0 ? (row[sdC]  || '').trim() : '';
    const vp   = vpC  >= 0 ? (row[vpC]  || '').trim() : '';
    const team = teamC >= 0 ? (row[teamC] || '').trim() : '';
    const cso  = csoC >= 0 ? (row[csoC]  || '').trim() : '';
    const isAD = /abu dhabi/i.test(team) || /mani/i.test(cso);
    const isVintDirect = /^vinit/i.test(sd) || /^vinit/i.test(vp);
    if (isAD) {
      // Abu Dhabi: SD → SMs
      if (sd) { if (!adSDs.has(sd)) adSDs.set(sd, new Set()); if (sm && sm !== sd) adSDs.get(sd).add(sm); }
    } else if (!isVintDirect) {
      // Dubai: VP → SD → SM
      if (vp) {
        if (!dubaiVPs.has(vp)) dubaiVPs.set(vp, new Map());
        if (sd && sd !== vp) {
          if (!dubaiVPs.get(vp).has(sd)) dubaiVPs.get(vp).set(sd, new Set());
          if (sm && sm !== sd && sm !== vp) dubaiVPs.get(vp).get(sd).add(sm);
        }
      }
    } else {
      if (sm) dubaiDirect.add(sm);
    }
  }
  const vpList = [...dubaiVPs.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([vp, sdMap]) => ({
      name: vp,
      sds: [...sdMap.entries()].sort(([a],[b]) => a.localeCompare(b))
           .map(([sd, sms]) => ({ name: sd, sms: [...sms].sort() }))
    }));
  const sdList = [...adSDs.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([sd, sms]) => ({ name: sd, sms: [...sms].sort() }));
  return { vps: vpList, adSDs: sdList, dubaiDirect: [...dubaiDirect].sort() };
}

// Count direct reports at each level below a person (depth-limited to 3 levels for speed)
function mappingHeadcount(name) {
  const l1 = mappingDirectReports(name);
  let l2total = 0, l3total = 0;
  for (const p of l1) {
    const l2 = mappingDirectReports(p);
    l2total += l2.length;
    for (const p2 of l2) {
      l3total += mappingDirectReports(p2).length;
    }
  }
  return { l1: l1.length, l2: l2total, l3: l3total };
}

// Format headcount summary for org rows (e.g. "6 VPs · 45 SDs · 253 SMs")
function fmtHeadcount(depth, hc) {
  const lvlLabels = ['CSOs','VPs','Sales Directors','Sales Managers'];
  const parts = [];
  // depth 0 = VP level (its reports are SDs); depth 1 = SD level (its reports are SMs); depth 2 = SM
  if (depth === 0) {
    if (hc.l1) parts.push(`${hc.l1} SD${hc.l1===1?'':'s'}`);
    if (hc.l2) parts.push(`${hc.l2} SM${hc.l2===1?'':'s'}`);
  } else if (depth === 1) {
    if (hc.l1) parts.push(`${hc.l1} SM${hc.l1===1?'':'s'}`);
  }
  return parts.join(' · ');
}

let _orgExpandedRows = new Set();

function toggleOrgRow(name) {
  if (_orgExpandedRows.has(name)) _orgExpandedRows.delete(name);
  else _orgExpandedRows.add(name);
  if (mappingTab === 'all') renderFullOrg();
  else renderPersonalOrg(currentPersonName() || (currentUser ? currentUser.name : ''));
}

function buildHierarchyRows(items, depth, allGet) {
  return items.map(item => {
    const kids = allGet(item);
    const expanded = _orgExpandedRows.has(item.name);
    const safeN = escapeHtml(item.name).replace(/'/g, "\\'");
    const roleLbl = depth === 0 ? 'Vice President' : depth === 1 ? 'Sales Director' : 'Sales Manager';
    const lvl = depth === 0 ? 2 : depth === 1 ? 3 : 4;
    const hasKids = kids.length > 0;
    // Compute headcount summary for non-SM levels
    let hcStr = '';
    if (depth <= 1) {
      const hc = mappingHeadcount(item.name);
      hcStr = fmtHeadcount(depth, hc);
    }
    const subHtml = (expanded && hasKids)
      ? `<div class="org-sub-rows">${buildHierarchyRows(kids, depth + 1, allGet).join('')}</div>`
      : '';
    return `<div class="org-row">
      <div class="org-row-head" onclick="${hasKids ? `toggleOrgRow('${safeN}')` : ''}">
        <span class="org-row-toggle">${hasKids ? (expanded ? '▾' : '▸') : '·'}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="org-row-name">${escapeHtml(orgDisplay(item.name))}</span>
            <span class="org-row-role lvl-${lvl}">${roleLbl}</span>
          </div>
          ${hcStr ? `<div style="font-size:10px;color:var(--muted);font-weight:600;margin-top:2px;letter-spacing:0.3px;">${hcStr}</div>` : ''}
        </div>
        ${hasKids ? `<span class="org-row-count">${kids.length} direct</span>` : ''}
      </div>
      ${subHtml}
    </div>`;
  });
}

function renderFullOrg() {
  const canvas = document.getElementById('orgCanvas');
  loadMappingFromStorage();
  const vinitVPs = mappingDirectReports('Vinit Manishbhai Parikh');
  const maniSDs  = mappingDirectReports('Mani Tyagi');
  if (!vinitVPs.length && !maniSDs.length) {
    canvas.innerHTML = `<div class="org-empty">No hierarchy found. Upload a Sales Team Mapping file via Manage File.</div>`; return;
  }
  // Compute headcounts for CSO headers — use actual level of direct reports for labels
  const vinitHc = mappingHeadcount('Vinit Manishbhai Parikh');
  const maniHc  = mappingHeadcount('Mani Tyagi');
  function csoHcStr(hc, startLabel) {
    // startLabel = the level of direct reports: 'VP' or 'SD'
    const labels = startLabel === 'VP'
      ? ['VP','SD','SM']
      : ['SD','SM',''];
    const parts = [];
    if (hc.l1) parts.push(`${hc.l1} ${labels[0]}${hc.l1===1?'':'s'}`);
    if (hc.l2) parts.push(`${hc.l2} ${labels[1]}${hc.l2===1?'':'s'}`);
    if (hc.l3 && labels[2]) parts.push(`${hc.l3} ${labels[2]}${hc.l3===1?'':'s'}`);
    return parts.join(' · ');
  }
  // Determine Vinit's direct-report level (VPs) and Mani's (SDs)
  const vinitHcStr = csoHcStr(vinitHc, 'VP');
  const maniHcStr  = csoHcStr(maniHc, 'SD');
  // Build items for the hierarchy renderer using mappingDirectReports recursively
  function toItem(name) { return { name, sds: mappingDirectReports(name).map(toItem) }; }
  const vinitItems = vinitVPs.map(vp => ({
    name: vp,
    sds: mappingDirectReports(vp).map(sd => ({ name: sd, sms: mappingDirectReports(sd).map(sm => ({ name: sm })) }))
  }));
  const maniItems = maniSDs.map(sd => ({
    name: sd, sds: mappingDirectReports(sd).map(sm => ({ name: sm }))
  }));
  const allGet = item => item.sds || item.sms || [];
  const vinitRows = buildHierarchyRows(vinitItems, 0, allGet).join('');
  const maniRows  = buildHierarchyRows(maniItems, 1, allGet).join('');
  canvas.innerHTML = `
    <div class="org-v2">
      <div class="org-root-wrap">
        <div class="org-root-card">
          <div class="org-root-title">GCSMO</div>
          <div class="org-root-name">Ashish Parakh</div>
        </div>
      </div>
      <div class="org-connector-row"></div>
      <div class="org-cso-grid">
        <div class="org-cso-col">
          <div class="org-cso-head dubai">
            <div class="org-cso-lbl dubai">CSO — Dubai</div>
            <div class="org-cso-nm">Vinit Parikh</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:4px;font-weight:600;">${vinitHcStr}</div>
          </div>
          <div>${vinitRows}</div>
        </div>
        <div class="org-cso-col">
          <div class="org-cso-head abudhabi">
            <div class="org-cso-lbl abudhabi">CSO — Abu Dhabi</div>
            <div class="org-cso-nm">Mani Tyagi</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:4px;font-weight:600;">${maniHcStr}</div>
          </div>
          <div>${maniRows}</div>
        </div>
      </div>
    </div>`;
  document.getElementById('orgNote').innerHTML =
    `From the Sales Team Mapping (09 Jun 2026). ▸ click any row to expand. Management can update via <em>Manage File</em>.`;
}

function toggleOrgNode(btn) {
  if (!btn) return;
  const li = btn.closest('.org-li');
  if (!li) return;
  const nowCollapsed = li.classList.toggle('collapsed');
  btn.textContent = nowCollapsed ? '+' : '\u2212';
}

function renderPersonalOrg(name) {
  const canvas = document.getElementById('orgCanvas');
  loadMappingFromStorage();
  if (!_orgTree && !buildOrgTreeFromMapping()) buildOrgTree();
  const t = _orgTree;
  if (!name) { canvas.innerHTML = `<div class="org-empty">Log in to see your position.</div>`; return; }

  // Build ancestor chain from mapping tree
  const chain = [name]; const guard = new Set([name]); let cur = name;
  while (t && t.domParent.get(cur)) {
    const p = t.domParent.get(cur); if (guard.has(p)) break;
    chain.unshift(p); guard.add(p); cur = p;
  }
  const myReports = mappingDirectReports(name);

  // Spine of ancestors
  const spineHtml = chain.slice(0, -1).map(anc => {
    const lvl = Math.min(t ? (t.levelOf.get(anc) ?? 4) : 4, 4);
    const roleLbl = ORG_LEVELS[lvl] ? ORG_LEVELS[lvl].label : '';
    return `<div class="org-row" style="background:var(--bg-2);">
      <div class="org-row-head" style="cursor:default;opacity:0.7;">
        <span class="org-row-toggle" style="color:transparent;">·</span>
        <span class="org-row-name">${escapeHtml(orgDisplay(anc))}</span>
        <span class="org-row-role lvl-${lvl}">${roleLbl}</span>
        <span class="org-row-count" style="background:var(--border);color:var(--muted);">manager</span>
      </div>
    </div>`;
  }).join('');

  // "You" card with headcount
  const myLvl = Math.min(t ? (t.levelOf.get(name) ?? 4) : 4, 4);
  const myRole = ORG_LEVELS[myLvl] ? ORG_LEVELS[myLvl].label : '';
  const myHc = mappingHeadcount(name);
  const myHcStr = fmtHeadcount(Math.max(0, myLvl - 2), myHc);
  const youHtml = `<div class="org-row" style="border-left:3px solid var(--gold);background:var(--gold-bg);">
    <div class="org-row-head" style="cursor:default;">
      <span class="org-row-toggle" style="color:var(--gold);">★</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="org-row-name" style="color:var(--gold-dark);font-weight:700;">${escapeHtml(orgDisplay(name))}</span>
          <span class="org-row-role lvl-${myLvl}">${myRole}</span>
        </div>
        ${myHcStr ? `<div style="font-size:10px;color:var(--gold-dark);font-weight:600;margin-top:2px;">${myHcStr}</div>` : ''}
      </div>
      ${myReports.length ? `<span class="org-row-count">${myReports.length} direct</span>` : ''}
    </div>
  </div>`;

  // My direct reports — use buildHierarchyRows (depth = myLvl >= 3 ? 1 : 0)
  const depthForReports = (myLvl >= 3) ? 1 : 0;
  const allGet = item => item.sds || item.sms || [];
  const reportsItems = myReports.map(r => {
    const sub = mappingDirectReports(r);
    return depthForReports === 0
      ? { name: r, sds: sub.map(s => ({ name: s, sds: mappingDirectReports(s).map(sm => ({ name: sm, sds: [] })) })) }
      : { name: r, sds: sub.map(s => ({ name: s, sds: [] })) };
  });
  const reportsHtml = buildHierarchyRows(reportsItems, depthForReports, allGet).join('');

  canvas.innerHTML = `
    <div class="org-cso-col" style="max-width:640px;margin:0 auto;">
      ${spineHtml}${youHtml}
      ${reportsHtml ? `<div class="org-sub-rows">${reportsHtml}</div>` : ''}
    </div>`;

  const reportsLine = myReports.length
    ? `You have <strong>${myReports.length}</strong> direct report${myReports.length === 1 ? '' : 's'} — click any to expand.`
    : `You have no direct reports in the current mapping.`;
  const ancestorStr = chain.slice(0, -1).map(a => escapeHtml(orgDisplay(a))).join(' → ');
  document.getElementById('orgNote').innerHTML =
    `${ancestorStr ? `<strong>Your chain:</strong> ${ancestorStr} → <strong>you</strong>. ` : ''}${reportsLine}`;
}

function onOrgSearch() {
  const q = (document.getElementById('orgSearch').value || '').trim().toLowerCase();
  _orgExpandedRows = new Set();
  if (!q) {
    if (mappingTab === 'me') renderPersonalOrg(currentPersonName() || (currentUser ? currentUser.name : ''));
    else renderFullOrg();
    return;
  }
  loadMappingFromStorage();
  const canvas = document.getElementById('orgCanvas');
  // Collect all unique names from mapping data directly
  const allNames = new Set();
  if (mappingData && mappingData.rows) {
    const c = getMappingCols();
    if (c) {
      for (const row of mappingData.rows) {
        for (const ci of [c.sm, c.sd, c.vp, c.cso]) {
          if (ci >= 0) { const v = (row[ci]||'').trim(); if (v) allNames.add(v); }
        }
      }
    }
  }
  const match = [...allNames]
    .filter(n => orgDisplay(n).toLowerCase().includes(q))
    .sort((a,b) => a.localeCompare(b))[0];
  if (!match) {
    canvas.innerHTML = `<div class="org-empty">No one matches "${escapeHtml(q)}".</div>`;
    document.getElementById('orgNote').textContent = '';
    return;
  }
  renderPersonalOrg(match);
}

function doLogout() {
  try {
    clearSsoSession();
    apiToken = '';
    currentUser = null;
    // Reset ALL transient view state so the next login starts clean
    viewAsPerson = null;
    personalRoleFilter = 'all';
    lbRoleFilter = 'all';
    vpRoleFilters = {};
    vpSdFilters = {};
    recentFilters = {};
    sevenDayExpanded = new Set();
    selectedLocs = new Set(['Dubai','UAQ','Abu Dhabi']);
    Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; }});
    
    const app = document.getElementById('app');
    if (app) app.classList.remove('show');
    
    const home = document.getElementById('home');
    if (home) home.classList.remove('show');
    
    const mappingView = document.getElementById('mappingView');
    if (mappingView) mappingView.classList.remove('show');
    
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.classList.remove('show');
    
    const identityWrap = document.getElementById('identityWrap');
    if (identityWrap) identityWrap.style.display = 'none';
    
    const loginWrap = document.getElementById('loginWrap');
    if (loginWrap) loginWrap.style.display = 'grid';

    const loginErr = document.getElementById('loginErr');
    if (loginErr) loginErr.classList.remove('show');
    
    const loginUser = document.getElementById('loginUser');
    if (loginUser) loginUser.value = '';
    
    const loginPin = document.getElementById('loginPin');
    if (loginPin) loginPin.value = '';

    // Reset SSO button state when returning to login screen.
    if (typeof window.sobhaReinjectMicrosoftSSO === 'function') {
      window.sobhaReinjectMicrosoftSSO();
    } else {
      clearSsoSession();
      resetSsoButton();
      bindMicrosoftSSOClickHandler();
    }
  } catch (e) {
    console.error('Error in doLogout:', e);
  }
}

// Renders the logged-in user's OWN "career footprint" note (with role pills + export),
// or hides the note entirely for leadership in their direct (non-impersonating) view.
function renderOwnFootprintNote() {
  const note = document.getElementById('footprintNote');
  if (!isLeadership() && currentUser && ['CSO','VP','SD','SM'].includes(currentUser.role)) {
    const fc = getFootprintCounts(currentUser.name);
    const parts = [];
    if (fc.sm > 0)   parts.push(`<strong>${fc.sm}</strong> as Sales Manager`);
    if (fc.sd > 0)   parts.push(`<strong>${fc.sd}</strong> as Sales Director`);
    if (fc.th > 0)   parts.push(`<strong>${fc.th}</strong> as Vice President`);
    if (fc.srvp > 0) parts.push(`<strong>${fc.srvp}</strong> as Sr. VP`);
    if (fc.cso > 0)  parts.push(`<strong>${fc.cso}</strong> as CSO`);
    document.getElementById('footprintNoteText').innerHTML =
      `<strong>Your career footprint:</strong> Every booking where your name appears in any role. Use the role pills below to narrow the view to a specific role. ` +
      (parts.length ? `Across roles: ${parts.join(' · ')}.` : '');
    note.style.display = 'flex';
  } else {
    note.style.display = 'none';
  }
}

(async function autoRestore(){
  const token = sessionStorage.getItem('sobha_token');
  if (!token) return;
  apiToken = token;
  try {
    const saved = sessionStorage.getItem('sobha_user_v5') || sessionStorage.getItem('sobha_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      if (currentUser && currentUser.role === 'admin') return;
    }

    await loadDashboardData();

    if (currentUser && AUTH[currentUser.username]) {
      enterHome();
      return;
    }

    const loginWrap = document.getElementById('loginWrap');
    if (loginWrap) loginWrap.style.display = 'none';
    showIdentityPicker();
  } catch(e) {
    console.error('autoRestore failed:', e);
    sessionStorage.removeItem('sobha_token');
    sessionStorage.removeItem('sobha_user_v5');
    sessionStorage.removeItem('sobha_user');
  }
})();

const loginPinEl = document.getElementById('loginPin');
if (loginPinEl) loginPinEl.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

const loginUserEl = document.getElementById('loginUser');
if (loginUserEl) loginUserEl.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

// Drag-and-drop for the Sales Team Mapping drop zone
(function wireMappingDrop(){
  const drop = document.getElementById('mappingDrop');
  if (!drop) return;
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave','dragend'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { alert('Please drop a .xlsx file.'); return; }
    onMappingUpload({ files: [f], value: '' });
  });
})();

// ====================== SCOPING (UNION FOOTPRINT) ======================
// SM: r_sm OR r_sd
// SD: r_sm OR r_sd OR r_th
// VP: r_sm OR r_sd OR r_th OR r_srvp OR r_cso
// CSO: same as VP
function unionFootprint(name, level) {
  // level = 'CSO' | 'VP' | 'SD' | 'SM' — controls which role columns count
  const entry = personEntry(name);
  if (!entry) return [];
  let allowed;
  if (level === 'CSO' || level === 'VP') allowed = ['r_cso','r_srvp','r_th','r_sd','r_sm'];
  else if (level === 'SD')               allowed = ['r_th','r_sd','r_sm'];
  else if (level === 'SM')               allowed = ['r_sd','r_sm'];
  else return [];
  const out = [];
  for (const r of entry.records) {
    for (const f of allowed) { if (r[f] === name) { out.push(r); break; } }
  }
  return out;
}

function getScopedRecords() {
  // If management is impersonating, return that person's full union footprint.
  // If a non-leadership user is impersonating, narrow to the INTERSECTION of
  // their own footprint and the target's footprint — i.e. only bookings where
  // BOTH the logged-in user AND the impersonated person appear.
  if (viewAsPerson) {
    let recs = unionFootprint(viewAsPerson.name, viewAsPerson.role);
    const isLeader = currentUser && ['Management', 'Ashish Parakh'].includes(currentUser.role);
    if (!isLeader) {
      const myRecs = personAllRecords(currentUser.name);
      if (myRecs) recs = recs.filter(r => myRecs.has(r));
      else recs = [];
    }
    return recs;
  }
  const t = currentUser.scope_type;
  const name = currentUser.name;
  if (t === 'all') return ALL;
  if (t === 'cso') return unionFootprint(name, 'CSO');
  if (t === 'vp')  return unionFootprint(name, 'VP');
  if (t === 'sd')  return unionFootprint(name, 'SD');
  if (t === 'sm')  return unionFootprint(name, 'SM');
  return [];
}

// Compute footprint counts for a specific person — iterates only that person's rows via the index.
function getFootprintCounts(name) {
  const entry = personEntry(name);
  const c = { sm: 0, sd: 0, th: 0, srvp: 0, cso: 0 };
  if (!entry) return c;
  for (const r of entry.records) {
    if (r.r_sm === name)   c.sm++;
    if (r.r_sd === name)   c.sd++;
    if (r.r_th === name)   c.th++;
    if (r.r_srvp === name) c.srvp++;
    if (r.r_cso === name)  c.cso++;
  }
  return c;
}

function isLeadership() {
  if (viewAsPerson) return false;
  return ['Management', 'Ashish Parakh'].includes(currentUser.role);
}
function effectiveRole() {
  if (viewAsPerson) return viewAsPerson.role;
  return currentUser.role;
}
function showsPNS() {
  const r = effectiveRole();
  return ['Management', 'Ashish Parakh', 'CSO', 'VP'].includes(r);
}

function getDrilldownConfig() {
  const r = effectiveRole();
  if (r === 'Management' || r === 'Ashish Parakh') {
    return { label: 'CSO Filter', field: 'cso',
      options: ['All', ...Array.from(new Set(baseRecords.map(x=>x.cso))).filter(Boolean).sort()] };
  }
  if (r === 'CSO') {
    return { label: 'VP Filter', field: 'vp',
      options: ['All', ...Array.from(new Set(baseRecords.map(x=>x.vp))).filter(Boolean).sort()] };
  }
  if (r === 'VP') {
    return { label: 'SD Filter', field: 'sd',
      options: ['All', ...Array.from(new Set(baseRecords.map(x=>x.sd))).filter(Boolean).sort()] };
  }
  if (r === 'SD') {
    return { label: 'SM Filter', field: 'sm',
      options: ['All', ...Array.from(new Set(baseRecords.map(x=>x.sm))).filter(Boolean).sort()] };
  }
  return null;
}

function getLeaderboardGroup() {
  const r = effectiveRole();
  if (r === 'Management' || r === 'Ashish Parakh' || r === 'CSO') return { field: 'vp', label: 'Vice President' };
  if (r === 'VP')  return { field: 'sd', label: 'Sales Director' };
  if (r === 'SD')  return { field: 'sm', label: 'Sales Manager' };
  if (r === 'SM')  return { field: 'p', label: 'Project' };
  return null;
}

// ====================== ENTER ======================
function enterDashboard() {
  try {
    const loginWrap = document.getElementById('loginWrap');
    if (loginWrap) loginWrap.style.display = 'none';
    
    const app = document.getElementById('app');
    if (app) app.classList.add('show');
    
    if (currentUser) {
      const dispName = currentUser.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : currentUser.name;
      const userNameEl = document.getElementById('userName');
      if (userNameEl) userNameEl.textContent = dispName;
      
      let roleDisplay = currentUser.role;
      if (currentUser.role === 'Ashish Parakh') roleDisplay = 'Head of Sales';
      const userRoleEl = document.getElementById('userRole');
      if (userRoleEl) userRoleEl.textContent = roleDisplay;
    }

    baseRecords = getScopedRecords();
    // Reset personal role filter on (re)entry
    personalRoleFilter = 'all';

    // SBTR upload is admin-only via /admin
    const uploadBtn = document.getElementById('btnUpload');
    if (uploadBtn) uploadBtn.style.display = 'none';

    // Personal footprint info note (for non-Management users)
    renderOwnFootprintNote();

    // Location pills
    const locs = ['Dubai','UAQ','Abu Dhabi'];
    const visibleLocs = new Set(baseRecords.map(r=>r.l));
    const pillBox = document.getElementById('locPills');
    if (pillBox) {
      pillBox.innerHTML = '';
      selectedLocs = new Set();
      locs.forEach(loc => { if (visibleLocs.has(loc)) selectedLocs.add(loc); });
      locs.forEach(loc => {
        const pill = document.createElement('div');
        pill.className = 'pill' + (selectedLocs.has(loc) ? ' active' : '');
        pill.textContent = loc;
        if (!visibleLocs.has(loc)) { pill.style.opacity = '0.35'; pill.style.pointerEvents = 'none'; }
        pill.onclick = () => {
          if (selectedLocs.has(loc)) {
            if (selectedLocs.size === 1) return;
            selectedLocs.delete(loc);
            pill.classList.remove('active');
          } else {
            selectedLocs.add(loc);
            pill.classList.add('active');
          }
          applyFilters();
        };
        pillBox.appendChild(pill);
      });
    }

  // Dates
  const dates = baseRecords.map(r=>r.d).filter(Boolean).sort();
  if (dates.length) {
    document.getElementById('dateFrom').value = dates[0];
    document.getElementById('dateTo').value = dates[dates.length-1];
    document.getElementById('dateFrom').min = dates[0];
    document.getElementById('dateFrom').max = dates[dates.length-1];
    document.getElementById('dateTo').min = dates[0];
    document.getElementById('dateTo').max = dates[dates.length-1];
  }
  document.getElementById('dateFrom').onchange = applyFilters;
  document.getElementById('dateTo').onchange = applyFilters;

  // View-As (Leadership + any user with a downline) — populate person picker
  const viewAsGroup = document.getElementById('viewAsGroup');
  const viewAsSel = document.getElementById('viewAsSelect');
  const downline = getDownlineByLevel(currentUser.name, currentUser.role);
  const hasDownline = Object.values(downline).some(arr => arr.length);
  if (isLeadership() || hasDownline) {
    viewAsGroup.style.display = 'flex';
    document.querySelector('#viewAsGroup .ctrl-label').textContent =
      isLeadership() ? 'View Footprint Of' : 'View Footprint Of My';
    viewAsSel.innerHTML = `<option value="">— Off (my own view) —</option>`;
    for (const lvl of ['CSO','Sr. VP','Team Head','SD','SM']) {
      if (!downline[lvl].length) continue;
      const og = document.createElement('optgroup');
      og.label = ({ 'Team Head':'Vice President', 'SD':'Sales Director', 'SM':'Sales Manager' })[lvl] || lvl;
      for (const n of downline[lvl]) {
        const opt = document.createElement('option');
        opt.value = downlineGroupToAuthRole(lvl) + '::' + n;
        opt.textContent = (n === 'Vinit Manishbhai Parikh') ? 'Vinit Parikh' : n;
        og.appendChild(opt);
      }
      viewAsSel.appendChild(og);
    }
    if (viewAsPerson) viewAsSel.value = viewAsPerson.role + '::' + viewAsPerson.name;
  } else {
    viewAsGroup.style.display = 'none';
  }

  buildLeaderboardHeader();
  buildRecentHeader();
  // VP Breakdown only when management AND NOT impersonating a sub-level
  document.getElementById('vpBreakdownBlock').style.display = (isLeadership() && !viewAsPerson) ? '' : 'none';
  // 7-day PNS only for management AND not impersonating
  const sevenDayBlock = document.getElementById('sevenDayBlock');
  if (sevenDayBlock) sevenDayBlock.style.display = (isLeadership() && !viewAsPerson) ? '' : 'none';
  applyFilters();
  } catch (e) {
    console.error('Error in enterDashboard:', e);
  }
}

function onViewAsChange(sel) {
  const v = sel.value;
  if (!v) { viewAsPerson = null; }
  else {
    const [role, name] = v.split('::');
    viewAsPerson = { role, name };
  }
  // Reset personal role filter when target changes
  personalRoleFilter = 'all';
  // Re-initialize baseRecords and full UI
  baseRecords = getScopedRecords();
  // Update header chip to reflect impersonation
  if (viewAsPerson) {
    document.getElementById('userName').textContent = (viewAsPerson.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : viewAsPerson.name);
    document.getElementById('userRole').textContent = 'VIEWING AS ' + viewAsPerson.role;
  } else {
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role === 'Ashish Parakh' ? 'Head of Sales' : currentUser.role;
  }
  // Refresh footprint note
  const note = document.getElementById('footprintNote');
  if (viewAsPerson) {
    const fc = getFootprintCounts(viewAsPerson.name);
    const parts = [];
    if (fc.sm > 0)   parts.push(`<strong>${fc.sm}</strong> as Sales Manager`);
    if (fc.sd > 0)   parts.push(`<strong>${fc.sd}</strong> as Sales Director`);
    if (fc.th > 0)   parts.push(`<strong>${fc.th}</strong> as Vice President`);
    if (fc.srvp > 0) parts.push(`<strong>${fc.srvp}</strong> as Sr. VP`);
    if (fc.cso > 0)  parts.push(`<strong>${fc.cso}</strong> as CSO`);
    const dn = viewAsPerson.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : viewAsPerson.name;
    const isLeader = ['Management','Ashish Parakh'].includes(currentUser.role);
    const myName  = currentUser.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : currentUser.name;
    const scopeNote = isLeader
      ? `Every booking where their name appears in any role. Use the role pills below to narrow the view.`
      : `Showing only the bookings where <strong>both you and ${dn}</strong> appear in any role — your shared transactions. Use the role pills below to narrow by ${dn}'s role.`;
    document.getElementById('footprintNoteText').innerHTML =
      `<strong>Viewing footprint of ${dn}:</strong> ${scopeNote} ` +
      (parts.length ? `${dn}'s full company-wide footprint: ${parts.join(' · ')}.` : '');
    note.style.display = 'flex';
  } else {
    // Back to own view — restore the user's own footprint note (leadership: hidden)
    renderOwnFootprintNote();
  }
  document.getElementById('vpBreakdownBlock').style.display = (isLeadership() && !viewAsPerson) ? '' : 'none';
  const sevenDayBlock = document.getElementById('sevenDayBlock');
  if (sevenDayBlock) sevenDayBlock.style.display = (isLeadership() && !viewAsPerson) ? '' : 'none';
  // Reset date bounds based on new base
  const dates = baseRecords.map(r=>r.d).filter(Boolean).sort();
  if (dates.length) {
    document.getElementById('dateFrom').value = dates[0];
    document.getElementById('dateTo').value = dates[dates.length-1];
    document.getElementById('dateFrom').min = dates[0];
    document.getElementById('dateFrom').max = dates[dates.length-1];
    document.getElementById('dateTo').min = dates[0];
    document.getElementById('dateTo').max = dates[dates.length-1];
  }
  // Reset all locs to whatever is visible
  const locs = ['Dubai','UAQ','Abu Dhabi'];
  const visibleLocs = new Set(baseRecords.map(r=>r.l));
  const pillBox = document.getElementById('locPills');
  pillBox.innerHTML = '';
  selectedLocs = new Set();
  locs.forEach(loc => { if (visibleLocs.has(loc)) selectedLocs.add(loc); });
  locs.forEach(loc => {
    const pill = document.createElement('div');
    pill.className = 'pill' + (selectedLocs.has(loc) ? ' active' : '');
    pill.textContent = loc;
    if (!visibleLocs.has(loc)) { pill.style.opacity = '0.35'; pill.style.pointerEvents = 'none'; }
    pill.onclick = () => {
      if (selectedLocs.has(loc)) {
        if (selectedLocs.size === 1) return;
        selectedLocs.delete(loc); pill.classList.remove('active');
      } else { selectedLocs.add(loc); pill.classList.add('active'); }
      applyFilters();
    };
    pillBox.appendChild(pill);
  });
  // Rebuild table headers and filters in case role-based columns changed (e.g. broker visibility)
  buildLeaderboardHeader();
  buildRecentHeader();
  applyFilters();
}

// ====================== FILTERS ======================
function setRange(kind, e) {
  if (e && e.target) {
    document.querySelectorAll('.quick-dates .pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
  }
  // Anchor quick-ranges to the GLOBAL report date (latest booking across the whole
  // SBTR), not the currently-scoped person's latest — so "30D" means the same calendar
  // window in every view. Without this, viewing a person whose last booking was months
  // ago would make "30D" reach back to that old activity instead of the recent period.
  const allDates = ALL.map(r => r.d).filter(Boolean).sort();
  if (!allDates.length) return;
  const maxDate = new Date(allDates[allDates.length-1] + 'T00:00:00');
  const scopedDates = baseRecords.map(r=>r.d).filter(Boolean).sort();
  let from;
  if (kind === 'ytd') from = new Date(maxDate.getFullYear(),0,1);
  else if (kind === 'mtd') from = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  else if (kind === '30d') { from = new Date(maxDate); from.setDate(from.getDate()-30); }
  else if (kind === '90d') { from = new Date(maxDate); from.setDate(from.getDate()-90); }
  else from = new Date((scopedDates[0] || allDates[0]) + 'T00:00:00');
  document.getElementById('dateFrom').value = fmtDate(from);
  document.getElementById('dateTo').value = fmtDate(maxDate);
  applyFilters();
}

function fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

function applyFilters() {
  renderPersonalRolePills();
  const from = document.getElementById('dateFrom').value;
  const to = document.getElementById('dateTo').value;
  const dd = getDrilldownConfig();
  const ddVal = document.getElementById('drilldownSelect')?.value || 'All';
  let recs = baseRecords.filter(r => selectedLocs.has(r.l));
  if (from) recs = recs.filter(r => r.d >= from);
  if (to)   recs = recs.filter(r => r.d <= to);
  if (dd && ddVal !== 'All') recs = recs.filter(r => r[dd.field] === ddVal);
  // Narrow by personal role pill (no-op in leadership direct view)
  recs = applyPersonalRoleFilter(recs);
  const locStr = selectedLocs.size === 3 ? 'All Regions' : Array.from(selectedLocs).join(' / ');
  // Append role context to the overview meta when a personal role is active
  let metaText = locStr;
  if (currentPersonName() && personalRoleFilter !== 'all') {
    const lbl = (VP_ROLE_PILLS.find(p => p.key === personalRoleFilter) || VP_ROLE_PILLS[0]).label;
    metaText += ` · ${lbl}`;
  }
  document.getElementById('overviewMeta').textContent = metaText;
  renderKPIs(recs);
  if (isLeadership()) renderVPBreakdown(recs);
  if (isLeadership()) renderSevenDay();
  renderTrend(recs);
  renderRegion(recs);
  renderTeam(recs);
  renderProjects(recs);
  renderLeaderboard(recs);
  renderBrokerLeaderboard(recs);
  renderRecent(recs);
}

// ====================== UTILS ======================
function nfmt(n, dec=0) {
  if (n == null || isNaN(n)) return '0';
  const intPart = Math.trunc(Math.abs(n));
  if (intPart >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false });
}
function fmtMn(aed) {
  const mn = aed / 1_000_000;
  if (Math.abs(mn) >= 100) return nfmt(mn, 0);
  if (Math.abs(mn) >= 10)  return nfmt(mn, 1);
  return nfmt(mn, 2);
}
function fmtPct(num, den, dec=1) { return den ? (num/den*100).toFixed(dec) + '%' : '0.0%'; }
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function agg(recs) {
  const r = { units: 0, sv: 0, pns: 0, qsv: 0, nsv: 0, csv: 0, q_units: 0, n_units: 0, c_units: 0 };
  for (const rec of recs) {
    r.units += rec.uc; r.sv += rec.sv; r.pns += rec.pns;
    if (rec.s === 'Q') { r.qsv += rec.sv; r.q_units += rec.uc; }
    else if (rec.s === 'N') { r.nsv += rec.sv; r.n_units += rec.uc; }
    else if (rec.s === 'C') { r.csv += rec.sv; r.c_units += rec.uc; }
  }
  return r;
}

// ====================== KPI ======================
function renderKPIs(recs) {
  const a = agg(recs);
  const grid = document.getElementById('kpiGrid');
  const tiles = [];
  tiles.push({ cls: 'gold', label: 'Total Declaration', value: fmtMn(a.sv), unit: 'Mn AED',
    sub: `<strong>${nfmt(Math.round(a.units))}</strong> units booked` });
  tiles.push({ cls: 'good', label: 'Qualified Sales', value: fmtMn(a.qsv), unit: 'Mn AED',
    sub: `<strong>${fmtPct(a.qsv, a.sv)}</strong> of declaration · <strong>${nfmt(Math.round(a.q_units))}</strong> units` });
  tiles.push({ cls: 'warn', label: 'Not Qualified', value: fmtMn(a.nsv), unit: 'Mn AED',
    sub: `<strong>${fmtPct(a.nsv, a.sv)}</strong> of declaration · <strong>${nfmt(Math.round(a.n_units))}</strong> units` });
  tiles.push({ cls: 'bad',  label: 'Cancellation', value: fmtMn(a.csv), unit: 'Mn AED',
    sub: `<strong>${fmtPct(a.csv, a.sv)}</strong> of declaration · <strong>${nfmt(Math.round(a.c_units))}</strong> units` });
  if (showsPNS()) {
    tiles.push({ cls: 'neutral', label: 'PNS', value: nfmt(a.pns, 1), unit: 'Mn AED', sub: `Net of cancellations` });
  }
  grid.className = showsPNS() ? 'kpi-grid with-pns' : 'kpi-grid';
  grid.innerHTML = tiles.map(t => `
    <div class="kpi ${t.cls}">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value">${t.value}<span class="kpi-unit">${t.unit}</span></div>
      <div class="kpi-sub">${t.sub}</div>
    </div>`).join('');

  // Logic note explaining the numbers
  const noteEl = document.getElementById('kpiLogicNote');
  if (noteEl) {
    let scopeNote;
    if (viewAsPerson) {
      const dn = viewAsPerson.name === 'Vinit Manishbhai Parikh' ? 'Vinit Parikh' : viewAsPerson.name;
      scopeNote = `the union of every booking where <strong>${dn}</strong> appears in any role column (Sales Manager / Sales Director / Vice President / Sr. VP / CSO).`;
    } else if (isLeadership()) {
      scopeNote = `<strong>all bookings in the system</strong>. Each booking is counted exactly once.`;
    } else {
      const r = currentUser.role;
      let cols = '';
      if (r === 'SM')  cols = 'Sales Manager OR Sales Director';
      if (r === 'SD')  cols = 'Sales Manager OR Sales Director OR Vice President';
      if (r === 'VP' || r === 'CSO') cols = 'Sales Manager OR Sales Director OR Vice President OR Sr. VP OR CSO';
      scopeNote = `every booking where your name appears in <strong>${cols}</strong> — your full career footprint across roles.`;
    }
    noteEl.innerHTML = `<em><strong>How these numbers are computed:</strong> Scope = ${scopeNote} <strong>Total Declaration</strong> = sum of Sale Value (AED). <strong>Qualified</strong> = bookings with Collection 10% = Yes (not cancelled). <strong>Cancelled</strong> = bookings flagged as cancelled. <strong>Not Qualified</strong> = the rest (not cancelled, no 10% collection yet). Percentages are share of Sale Value, not unit count.</em>`;
  }
}

// ====================== VP BREAKDOWN ======================
const VP_ORDER = [
  'Vivek Ram', 'Mohit Gupta', 'Philip Yousef', 'Hooriya Rahimi',
  'Manoj Vidhani', 'Deepak Khera', 'Vinit Manishbhai Parikh', 'London Team',
  'Mani Tyagi', 'Ashish Parakh'
];

const VP_ROLE_PILLS = [
  { key: 'all', label: 'All Roles',    fields: ['r_sm','r_sd','r_th','r_srvp','r_cso'] },
  { key: 'sm',  label: 'As Sales Manager',  fields: ['r_sm']    },
  { key: 'sd',  label: 'As Sales Director', fields: ['r_sd']    },
  { key: 'th',  label: 'As VP',             fields: ['r_th']    },
  { key: 'svp', label: 'As Sr. VP',         fields: ['r_srvp']  },
  { key: 'cso', label: 'As CSO',       fields: ['r_cso']   },
];

// Memoised per-person index: name -> { roles: Set<pillKey>, records: Set<record> }
// Built lazily on first access; invalidated whenever ALL is swapped.
let _personIndex = null;
const ROLE_FIELD_TO_PILL = { r_sm: 'sm', r_sd: 'sd', r_th: 'th', r_srvp: 'svp', r_cso: 'cso' };
function buildPersonIndex() {
  _personIndex = new Map();
  for (const r of ALL) {
    for (const f in ROLE_FIELD_TO_PILL) {
      const name = r[f];
      if (!name) continue;
      let entry = _personIndex.get(name);
      if (!entry) { entry = { roles: new Set(), records: new Set() }; _personIndex.set(name, entry); }
      entry.roles.add(ROLE_FIELD_TO_PILL[f]);
      entry.records.add(r);
    }
  }
}
function personEntry(name) {
  if (!name) return null;
  if (!_personIndex) buildPersonIndex();
  return _personIndex.get(name) || null;
}
function personRoles(name) {
  const e = personEntry(name);
  return e ? e.roles : new Set();
}
function personAllRecords(name) {
  // Every booking where this person appears in ANY role column. O(rows for that person).
  const e = personEntry(name);
  return e ? e.records : null;
}

// Real person name behind a VP-card bucket. null = not a single person (London Team).
function vpPersonName(vp) {
  if (vp === 'London Team') return null;
  return vp;
}

function vpRegion(vp) {
  if (vp === 'Mani Tyagi') return 'Abu Dhabi';
  if (vp === 'Ashish Parakh') return 'Head Office';
  return 'Dubai · UAQ';
}
function vpDisplayName(vp) {
  if (vp === 'Vinit Manishbhai Parikh') return 'Vinit Parikh';
  return vp;
}

let vpRoleFilters = {};  // vp key -> role pill key (default 'all')

function renderVPBreakdown(recs) {
  const container = document.getElementById('vpCards');
  const recSet = new Set(recs);   // O(N) once, lookup O(1)
  const cards = VP_ORDER.map(vp => {
    const personName = vpPersonName(vp);
    const role = vpRoleFilters[vp] || 'all';
    const roleDef = VP_ROLE_PILLS.find(p => p.key === role) || VP_ROLE_PILLS[0];

    // Build VP card record set:
    //  - London Team: keep original attribution (r.vp === 'London Team')
    //  - Real person: union footprint across the selected role columns
    let vpRecs;
    if (personName) {
      const entry = personEntry(personName);
      if (!entry) { return ''; }
      vpRecs = [];
      const fields = roleDef.fields;
      for (const r of entry.records) {
        if (!recSet.has(r)) continue;
        for (const f of fields) { if (r[f] === personName) { vpRecs.push(r); break; } }
      }
    } else {
      vpRecs = recs.filter(r => r.vp === vp);
    }
    if (!vpRecs.length) return '';   // skip empty cards entirely

    const sdFilter = vpSdFilters[vp] || 'All';
    const filtered = sdFilter === 'All' ? vpRecs : vpRecs.filter(r => r.sd === sdFilter);
    const a = agg(filtered);
    const sds = Array.from(new Set(vpRecs.map(r => r.sd))).filter(Boolean).sort();
    const qPctV = fmtPct(a.qsv, a.sv);
    const cPctV = fmtPct(a.csv, a.sv);

    // Role-filter pills only for real people, only roles they've played
    const roles = personName ? personRoles(personName) : new Set();
    const availablePills = VP_ROLE_PILLS.filter(p => p.key === 'all' || roles.has(p.key));
    const pills = (personName && availablePills.length > 1) ? `
      <div class="vp-role-pills" title="Filter this card's footprint by role column">
        ${availablePills.map(p => `<button type="button" class="vp-role-pill${role === p.key ? ' active' : ''}" onclick="onVPRoleChange('${escapeHtml(vp).replace(/'/g, "\\'")}','${p.key}')">${p.label}</button>`).join('')}
      </div>` : '';

    const headlineLabel = personName
      ? (role === 'all' ? 'Total Declaration · All Roles' : `Total Declaration · ${roleDef.label}`)
      : 'Total Declaration';

    return `
      <div class="vp-tile">
        <div class="vp-tile-head">
          <div class="vp-tile-name">${escapeHtml(vpDisplayName(vp))}</div>
          <div class="vp-tile-region">${vpRegion(vp)}</div>
        </div>
        ${pills}
        <div class="vp-tile-headline">
          <div class="vp-headline-label">${headlineLabel}</div>
          <div class="vp-headline-val">${fmtMn(a.sv)}<span class="u">Mn AED · ${nfmt(Math.round(a.units))} units</span></div>
        </div>
        <div class="vp-tile-stats">
          <div class="vp-stat-row"><span class="lbl">Qualified</span><span class="val good">${fmtMn(a.qsv)} Mn<span class="pct">(${qPctV})</span></span></div>
          <div class="vp-stat-row"><span class="lbl">Not Qualified</span><span class="val">${fmtMn(a.nsv)} Mn</span></div>
          <div class="vp-stat-row"><span class="lbl">Cancelled</span><span class="val bad">${fmtMn(a.csv)} Mn<span class="pct">(${cPctV})</span></span></div>
        </div>
        <div class="vp-tile-footer">
          <select class="vp-sd-select" data-vp="${escapeHtml(vp)}" onchange="onVPSDChange(this)">
            <option value="All"${sdFilter === 'All' ? ' selected' : ''}>All Sales Directors (${sds.length})</option>
            ${sds.map(sd => `<option value="${escapeHtml(sd)}"${sdFilter === sd ? ' selected' : ''}>${escapeHtml(sd)}</option>`).join('')}
          </select>
        </div>
      </div>`;
  }).filter(Boolean);
  container.innerHTML = cards.join('');
}

function onVPRoleChange(vp, roleKey) {
  vpRoleFilters[vp] = roleKey;
  // Reset SD filter when role changes (SD list may differ)
  delete vpSdFilters[vp];
  applyFilters();
}
function onVPSDChange(sel) { vpSdFilters[sel.dataset.vp] = sel.value; applyFilters(); }

// ====================== DOWNLINE (cascading impersonation) ======================
// For a logged-in user, list everyone beneath them in the org so they can step
// into that person's footprint via the View-Footprint-Of selector.
function getDownlineByLevel(name, role) {
  const result = { CSO: [], 'Sr. VP': [], 'Team Head': [], SD: [], SM: [] };
  if (!name) return result;
  // Source of records to inspect:
  //   Leadership: every booking
  //   CSO: bookings where r_cso === me
  //   VP:  bookings where r_srvp === me or r_th === me
  //   SD:  bookings where r_sd === me
  let myRecs;
  if (role === 'Management' || role === 'Ashish Parakh') myRecs = ALL;
  else {
    const entry = personEntry(name);
    if (!entry) return result;
    if (role === 'CSO') myRecs = [...entry.records].filter(r => r.r_cso === name);
    else if (role === 'VP') myRecs = [...entry.records].filter(r => r.r_srvp === name || r.r_th === name);
    else if (role === 'SD') myRecs = [...entry.records].filter(r => r.r_sd === name);
    else return result;   // SM has no downline
  }
  const sets = { CSO: new Set(), 'Sr. VP': new Set(), 'Team Head': new Set(), SD: new Set(), SM: new Set() };
  for (const r of myRecs) {
    if (role === 'CSO' || role === 'Management' || role === 'Ashish Parakh') {
      if (r.r_cso)  sets.CSO.add(r.r_cso);
      if (r.r_srvp) sets['Sr. VP'].add(r.r_srvp);
      if (r.r_th)   sets['Team Head'].add(r.r_th);
      if (r.r_sd)   sets.SD.add(r.r_sd);
      if (r.r_sm)   sets.SM.add(r.r_sm);
    } else if (role === 'VP') {
      if (r.r_th && r.r_th !== name) sets['Team Head'].add(r.r_th);
      if (r.r_sd) sets.SD.add(r.r_sd);
      if (r.r_sm) sets.SM.add(r.r_sm);
    } else if (role === 'SD') {
      if (r.r_sm) sets.SM.add(r.r_sm);
    }
  }
  // Each person is shown at their highest level under this user (and never themselves).
  const seen = new Set([name]);
  for (const lvl of ['CSO','Sr. VP','Team Head','SD','SM']) {
    for (const n of [...sets[lvl]].sort()) {
      if (seen.has(n)) continue;
      result[lvl].push(n); seen.add(n);
    }
  }
  return result;
}

// Map a downline group label back to the AUTH-role used by viewAsPerson
function downlineGroupToAuthRole(label) {
  if (label === 'CSO') return 'CSO';
  if (label === 'Sr. VP' || label === 'Team Head') return 'VP';
  if (label === 'SD') return 'SD';
  if (label === 'SM') return 'SM';
  return 'SM';
}

// ====================== UPLOAD SBTR (XLSX parser, in-browser) ======================
async function parseXlsxFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const u16 = (o) => bytes[o] | (bytes[o+1] << 8);
  const u32 = (o) => (bytes[o] | (bytes[o+1] << 8) | (bytes[o+2] << 16) | (bytes[o+3] << 24)) >>> 0;
  // Find EOCD record
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) { if (u32(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Not a valid .xlsx file (zip end-of-central-directory not found)');
  const cdOff = u32(eocd + 16);
  const total = u16(eocd + 10);
  let p = cdOff;
  const files = {};
  for (let i = 0; i < total; i++) {
    const compMethod = u16(p+10);
    const compSize = u32(p+20);
    const nameLen = u16(p+28);
    const extraLen = u16(p+30);
    const commentLen = u16(p+32);
    const localHdrOff = u32(p+42);
    const name = new TextDecoder().decode(bytes.subarray(p+46, p+46+nameLen));
    const lhNameLen = u16(localHdrOff+26);
    const lhExtraLen = u16(localHdrOff+28);
    const dataStart = localHdrOff + 30 + lhNameLen + lhExtraLen;
    files[name] = { compMethod, compData: bytes.subarray(dataStart, dataStart + compSize) };
    p += 46 + nameLen + extraLen + commentLen;
  }
  async function inflate(c) {
    if (c.compMethod === 0) return c.compData;
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(c.compData); w.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    const len = chunks.reduce((s,c)=>s+c.length,0);
    const out = new Uint8Array(len); let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  // Shared strings
  const strings = [];
  if (files['xl/sharedStrings.xml']) {
    const ss = new TextDecoder().decode(await inflate(files['xl/sharedStrings.xml']));
    let m; const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    while ((m = re.exec(ss))) {
      const inner = m[1];
      const ts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decodeXml(x[1]));
      strings.push(ts.join(''));
    }
  }
  function decodeXml(s) { return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"); }
  // Find a sheet
  let sheetKey;
  for (const k of Object.keys(files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) { sheetKey = k; break; }
  }
  if (!sheetKey) throw new Error('No worksheet found inside the xlsx archive');
  const sheet = new TextDecoder().decode(await inflate(files[sheetKey]));
  function colIdx(ref) {
    const letters = ref.match(/^([A-Z]+)/)[1];
    let n = 0; for (const c of letters) n = n*26 + (c.charCodeAt(0)-64);
    return n - 1;
  }
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  // Match BOTH self-closing cells (<c r="X1" s="6"/>) AND full cells (<c r="X1">…</c>).
  // The first capture group is the attributes; the second is the inner content (undefined
  // for self-closing). Without this, a self-closing cell preceding a real one would
  // confuse a naive `<c…>…</c>` regex and swallow the next cell's content.
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  let rowCount = 0;
  const headerCols = [];
  const out = [];
  while ((m = rowRe.exec(sheet))) {
    const cells = [...m[1].matchAll(cellRe)].map(cm => {
      const attrs = cm[1];
      const inner = cm[2] || '';   // '' for self-closing cells
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const r = (attrs.match(/\br="([^"]+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const isStr = (inner.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/) || [])[1];
      let val;
      if (t === 's' && v != null) val = strings[parseInt(v)];
      else if (t === 'inlineStr' && isStr != null) val = decodeXml(isStr);
      else if (t === 'str' && v != null) val = decodeXml(v);
      else val = v;
      return { col: colIdx(r), val };
    });
    if (rowCount === 0) {
      for (const c of cells) headerCols[c.col] = c.val;
    } else {
      const obj = {};
      for (const c of cells) obj[headerCols[c.col]] = c.val;
      out.push(obj);
    }
    rowCount++;
  }
  // Determine the "Full Sale Value" column: prefer an exact header match, else the
  // second-last column (PNS is always last). Column name has varied across SBTR
  // exports ("Full Sale Value" / "78"), so fall back to position for robustness.
  let fullSvKey = headerCols.find(h => h && h.trim().toLowerCase() === 'full sale value');
  if (!fullSvKey) fullSvKey = headerCols[headerCols.length - 2];
  out._fullSvKey = fullSvKey;
  out._headers = headerCols.filter(h => h != null && h !== '');
  return out;
}

function excelDateToISO(serial) {
  if (serial == null || serial === '') return null;
  const n = parseFloat(serial);
  if (isNaN(n)) return null;
  const d = new Date(Math.round((n - 25569) * 86400000));
  return d.toISOString().slice(0,10);
}

function regionFromProject(p) {
  if (!p) return 'Dubai';
  if (p === 'Sobha Siniya Island' || p === 'Downtown UAQ') return 'UAQ';
  if (p === 'Sobha City') return 'Abu Dhabi';
  return 'Dubai';
}

function mapSBTRRow(r, fullSvKey) {
  const d = excelDateToISO(r['Booked Date']);
  // SBTR uses Yes/No strings, not numbers. Cancelled Date is populated for every row
  // (it carries booking-form date when not actually cancelled), so the only reliable
  // cancellation flag is `Cancelled Units = Yes`.
  const cancelled = String(r['Cancelled Units'] || '').trim().toLowerCase() === 'yes';
  const collection10 = String(r['Collection 10%'] || '').trim().toLowerCase() === 'yes';
  let s;
  if (cancelled) s = 'C';
  else if (collection10) s = 'Q';
  else s = 'N';
  const salesHead = r['Sales Head'] || '';
  const isLondon = /^Gopeshwar Mahato$/i.test(salesHead) || (salesHead === 'Vinit Manishbhai Parikh' && (r['Attended by'] || '') !== 'Vinit Manishbhai Parikh');
  const teamHead = r['Team Head'] || '';
  const srVp     = r['Sr. VP']    || '';
  const cso      = r['CSO']       || '';
  // VP-card attribution fallback chain: Team Head → Sr. VP → CSO → Unassigned
  const vp = isLondon ? 'London Team' : (teamHead || srVp || cso || 'Unassigned');
  return {
    d,
    m: d ? d.slice(0,7) : '',
    p: r['Project Name'] || '',
    l: regionFromProject(r['Project Name']),
    sm: r['Attended by'] || '',
    sd: isLondon ? 'London Team' : salesHead,
    vp,
    cso,
    r_sm: r['Attended by'] || '',
    r_sd: salesHead,
    r_th: teamHead,
    r_srvp: srVp,
    r_cso: cso,
    // "Full Sale Value" (the gross deal value) — not the per-agent apportioned share.
    sv: parseFloat((fullSvKey && r[fullSvKey] != null ? r[fullSvKey] : r['Sale Value (AED)']) || 0) || 0,
    pns: parseFloat(r['PNS'] || 0) || 0,
    uc: parseFloat(r['Unit Count'] || 0) || 0,
    s,
    u: r['Unit No.'] || '',
    ut: r['No. of Bedrooms'] || '',
    pp: Math.round((parseFloat(r['Paid %'] || 0) || 0) * 1000) / 10,
    br: r['Broker Company Name'] || 'Direct',
    // Milestone tracking (shown in Recent Bookings for non-leadership views)
    d10: excelDateToISO(r['10%_Date']),
    d20: excelDateToISO(r['20%_Date']),
    spa: r['SPA Executed'] || '',
    dld: r['DLD Status'] || ''
  };
}

function onSBTRUpload(input) {
  // Only allow admin to upload
  if (!currentUser || currentUser.role !== 'admin') {
    alert('SBTR uploads are managed by Admin. Open /admin to upload a new file.');
    if (input) input.value = '';
    return;
  }

  // Admin can upload - proceed with file processing
  if (!input || !input.files || !input.files.length) {
    if (input) input.value = '';
    return;
  }

  const file = input.files[0];
  const btn = document.getElementById('btnUpload');
  if (btn) btn.disabled = true;
  
  parseAndApplySBTR(file)
    .then(result => {
      alert(`✓ Uploaded ${result.count} records (as of ${result.asOf})`);
      // Update the "as of" date
      const asOfEl = document.getElementById('dataAsOf');
      if (asOfEl) asOfEl.textContent = result.asOf;
    })
    .catch(err => {
      alert('Upload failed: ' + err.message);
    })
    .finally(() => {
      if (btn) btn.disabled = false;
      if (input) input.value = '';
    });
}

async function parseAndApplySBTR(file) {
  const rows = await parseXlsxFile(file);
  if (!rows.length) throw new Error('No data rows found.');
  const required = ['Booked Date','Project Name','Unit No.','Sales Head','Attended by','Team Head','Sr. VP','CSO','Sale Value (AED)','PNS','Unit Count','Collection 10%'];
  const sample = rows[0];
  const missing = required.filter(k => !(k in sample));
  if (missing.length) throw new Error('This file is missing required SBTR columns: ' + missing.join(', '));
  const fullSvKey = rows._fullSvKey;
  const records = rows.map(r => mapSBTRRow(r, fullSvKey)).filter(r => r.d && r.u);
  if (!records.length) throw new Error('No valid rows after parsing.');
  // Determine the latest booking date for the "as of" label
  const dates = records.map(r => r.d).sort();
  const latest = dates[dates.length - 1];
  const asOf = new Date(latest + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  // Swap in the new data
  ALL = records;
  _personIndex = null;            // invalidate person/roles cache
  _orgTree = null;                // invalidate org chart cache
  // Reset transient UI state so the dashboard starts fresh
  vpRoleFilters = {};
  vpSdFilters = {};
  lbRoleFilter = 'all';
  personalRoleFilter = 'all';
  selectedLocs = new Set(['Dubai','UAQ','Abu Dhabi']);
  sevenDayExpanded = new Set();
  viewAsPerson = null;
  // Rebuild dashboard chrome and re-render
  enterDashboard();
  return { count: records.length, asOf };
}

// ====================== LEADERSHIP LEADERBOARD (union footprint) ======================
let lbRoleFilter = 'all';
function setLbRole(key) { lbRoleFilter = key; applyFilters(); }

// Personal role filter — used in personal-login views AND management impersonation
let personalRoleFilter = 'all';
function setPersonalRole(key) { personalRoleFilter = key; applyFilters(); }

// Name of the person whose footprint is being viewed (null = leadership direct view)
function currentPersonName() {
  if (viewAsPerson) return viewAsPerson.name;
  if (currentUser && currentUser.scope_type && currentUser.scope_type !== 'all') return currentUser.name;
  return null;
}

function renderPersonalRolePills() {
  const bar = document.getElementById('personalRoleBar');
  const name = currentPersonName();
  if (!name) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const roles = personRoles(name);
  const available = VP_ROLE_PILLS.filter(p => p.key === 'all' || roles.has(p.key));
  document.getElementById('personalRolePills').innerHTML = available.map(p =>
    `<button type="button" class="vp-role-pill${personalRoleFilter === p.key ? ' active' : ''}" onclick="setPersonalRole('${p.key}')">${p.label}</button>`
  ).join('');
}

function applyPersonalRoleFilter(recs) {
  if (personalRoleFilter === 'all') return recs;
  const name = currentPersonName();
  if (!name) return recs;
  const fields = (VP_ROLE_PILLS.find(p => p.key === personalRoleFilter) || VP_ROLE_PILLS[0]).fields;
  // Hot path: iterate the (already-filtered) recs once.
  return recs.filter(r => { for (const f of fields) if (r[f] === name) return true; return false; });
}

// Compute one row per person in VP_ORDER, using union of selected role columns.
// Ashish Parakh and Vinit Parikh are company-wide heads, not VP/Team Heads, so they
// are excluded from the VP/Team Head leaderboard and its Team Performance chart.
const LEADERBOARD_EXCLUDE = new Set(['Ashish Parakh', 'Vinit Manishbhai Parikh']);
function getLeadershipPersonRows(recs, roleKey) {
  const roleDef = VP_ROLE_PILLS.find(p => p.key === roleKey) || VP_ROLE_PILLS[0];
  const fields = roleDef.fields;
  const recSet = new Set(recs);
  const rows = [];
  for (const vp of VP_ORDER) {
    const personName = vpPersonName(vp);
    if (!personName) {
      // London Team — keep original attribution since it isn't a single person
      const ltRecs = recs.filter(r => r.vp === vp);
      if (ltRecs.length) rows.push({ name: vpDisplayName(vp), key: vp, agg: agg(ltRecs), isTeam: true });
      continue;
    }
    if (LEADERBOARD_EXCLUDE.has(personName)) continue;
    // Skip if user picked a role this person has never played
    const entry = personEntry(personName);
    if (!entry) continue;
    if (roleKey !== 'all' && !entry.roles.has(roleKey)) continue;
    const personRecs = [];
    for (const r of entry.records) {
      if (!recSet.has(r)) continue;
      for (const f of fields) { if (r[f] === personName) { personRecs.push(r); break; } }
    }
    if (!personRecs.length) continue;
    rows.push({ name: vpDisplayName(vp), key: vp, agg: agg(personRecs), isTeam: false });
  }
  rows.sort((a, b) => b.agg.sv - a.agg.sv);
  return rows;
}

function renderLbRolePills() {
  const wrap = document.getElementById('lbRolePillsWrap');
  if (!isLeadership()) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const host = document.getElementById('lbRolePills');
  host.innerHTML = VP_ROLE_PILLS.map(p =>
    `<button type="button" class="vp-role-pill${lbRoleFilter === p.key ? ' active' : ''}" onclick="setLbRole('${p.key}')">${p.label}</button>`
  ).join('');
}

// ====================== 7-DAY PNS TABLE ======================
let sevenDayExpanded = new Set();   // VPs currently expanded

function renderSevenDay() {
  const block = document.getElementById('sevenDayBlock');
  if (!block || block.style.display === 'none') return;
  // Respect the Region filter, but ignore the date range — this widget always shows the latest window
  const sourceRecs = ALL.filter(r => selectedLocs.has(r.l));
  // Find the latest booking date in source records
  const dates = sourceRecs.map(r => r.d).filter(Boolean).sort();
  if (!dates.length) {
    document.getElementById('sevenDayHeader').innerHTML = '';
    document.getElementById('sevenDayBody').innerHTML = `<tr><td class="empty">No bookings in the selected region(s)</td></tr>`;
    return;
  }
  const latestStr = dates[dates.length - 1];
  // 1) Last 7 WORKING days (Mon–Fri, UAE weekend = Sat/Sun) ending on or before latest.
  const workingDays = []; // chronological: oldest -> newest
  let cursor = new Date(latestStr + 'T00:00:00');
  while (workingDays.length < 7) {
    const dow = cursor.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) workingDays.unshift(fmtDate(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  // 2) Additionally surface WEEKEND days within that span that actually have bookings
  //    (so e.g. a Sat/Sun with sales is shown rather than silently dropped).
  const datesWithData = new Set(sourceRecs.map(r => r.d));
  const daySet = new Set(workingDays);
  const latestDate = new Date(latestStr + 'T00:00:00');
  let wcur = new Date(workingDays[0] + 'T00:00:00');
  while (wcur <= latestDate) {
    const ds = fmtDate(wcur);
    const dow = wcur.getDay();
    if ((dow === 0 || dow === 6) && datesWithData.has(ds)) daySet.add(ds);
    wcur.setDate(wcur.getDate() + 1);
  }
  const days = [...daySet].sort();          // chronological oldest -> newest
  const N = days.length;
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const inWindow = sourceRecs.filter(r => dayIndex.has(r.d));

  // Per-CSO region split: daily columns show the CSO's HOME region; the extra
  // "Other Region" column shows the 7-day total for the complementary region.
  const CSO_REGION = {
    'Vinit Parikh': { home: new Set(['Dubai','UAQ']), otherLabel: 'Abu Dhabi'   },
    'Mani Tyagi':   { home: new Set(['Abu Dhabi']),   otherLabel: 'Dubai + UAQ' }
  };
  const csoOf = r => (r.cso === 'Mani Tyagi') ? 'Mani Tyagi' : 'Vinit Parikh';
  const CSO_ORDER = ['Vinit Parikh', 'Mani Tyagi'];
  const byCSO = { 'Vinit Parikh': {}, 'Mani Tyagi': {} };
  for (const r of inWindow) {
    const c = csoOf(r);
    const isHome = CSO_REGION[c].home.has(r.l);
    const vp = r.vp || 'Unassigned';
    if (!byCSO[c][vp]) byCSO[c][vp] = { total: 0, days: new Array(N).fill(0), other: 0, sds: {} };
    const di = dayIndex.get(r.d);
    if (isHome) { byCSO[c][vp].days[di] += r.pns; byCSO[c][vp].total += r.pns; }
    else        { byCSO[c][vp].other += r.pns; }
    const sd = r.sd || '—';
    if (!byCSO[c][vp].sds[sd]) byCSO[c][vp].sds[sd] = { total: 0, days: new Array(N).fill(0), other: 0 };
    if (isHome) { byCSO[c][vp].sds[sd].days[di] += r.pns; byCSO[c][vp].sds[sd].total += r.pns; }
    else        { byCSO[c][vp].sds[sd].other += r.pns; }
  }

  // Display columns: newest day on the LEFT
  const displayDays = days.slice().reverse();
  const displayIdx  = displayDays.map(d => dayIndex.get(d));

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const isWeekend = ds => { const d = new Date(ds + 'T00:00:00').getDay(); return d === 0 || d === 6; };
  const fmtHdr = ds => {
    const d = new Date(ds + 'T00:00:00');
    return `${DAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  };
  const header = document.getElementById('sevenDayHeader');
  header.innerHTML = `<th style="width:36px;"></th><th style="min-width:200px;">CSO / VP / Sales Director</th>` +
    displayDays.map((d, i) => {
      const bg = i === 0 ? 'background:var(--gold-bg);' : (isWeekend(d) ? 'background:rgba(181,58,58,0.07);' : '');
      const tag = i === 0 ? ' <span style="font-size:9px;color:var(--gold-dark);">LATEST</span>'
                          : (isWeekend(d) ? ' <span style="font-size:8px;color:var(--bad);">WKND</span>' : '');
      return `<th style="text-align:right;min-width:84px;${bg}">${fmtHdr(d)}${tag}</th>`;
    }).join('') +
    `<th style="text-align:right;min-width:96px;">Total</th>` +
    `<th style="text-align:right;min-width:104px;border-left:2px solid var(--border);">Other Region<br><span style="font-size:9px;color:var(--muted);font-weight:400;">7-day PNS</span></th>`;
  document.getElementById('sevenDayMeta').textContent = `${fmtHdr(displayDays[0])} \u2190 ${fmtHdr(displayDays[N-1])} \u00b7 PNS in Mn AED`;

  const body = document.getElementById('sevenDayBody');
  if (!inWindow.length) {
    body.innerHTML = `<tr><td colspan="${N + 4}" class="empty">No bookings in the last 7 working days for the selected region(s)</td></tr>`;
    return;
  }

  // Grand total across both CSOs
  const grandDays = new Array(N).fill(0); let grandTotal = 0, grandOther = 0;
  for (const c of CSO_ORDER) {
    for (const vp in byCSO[c]) {
      for (let i = 0; i < N; i++) grandDays[i] += byCSO[c][vp].days[i];
      grandTotal += byCSO[c][vp].total;
      grandOther += byCSO[c][vp].other;
    }
  }

  const cell = (v, extra='') => `<td class="num"${extra}>${v > 0 ? nfmt(v, 2) : '\u2014'}</td>`;
  const rows = [];
  rows.push(
    `<tr style="background:var(--gold-bg);font-weight:700;">
       <td></td><td class="name">All CSOs (Total)</td>
       ${displayIdx.map(i => cell(grandDays[i])).join('')}
       <td class="num">${nfmt(grandTotal, 2)}</td>
       <td class="num" style="border-left:2px solid var(--border);">${nfmt(grandOther, 2)}</td>
     </tr>`
  );

  for (const cso of CSO_ORDER) {
    const vpEntries = Object.entries(byCSO[cso]).sort((a,b) => b[1].total - a[1].total);
    const otherLabel = CSO_REGION[cso].otherLabel;
    const csoDays = new Array(N).fill(0); let csoTotal = 0, csoOther = 0;
    for (const [, v] of vpEntries) {
      for (let i = 0; i < N; i++) csoDays[i] += v.days[i];
      csoTotal += v.total; csoOther += v.other;
    }
    rows.push(
      `<tr style="background:linear-gradient(135deg,#1a1814 0%,#2a251c 100%);color:#fff;">
         <td></td>
         <td class="name" style="color:#fff;letter-spacing:1px;text-transform:uppercase;font-size:11px;font-weight:700;">
           <span style="color:var(--gold-light);">CSO</span> &nbsp; ${escapeHtml(cso)}
           <span style="color:rgba(255,255,255,0.5);font-weight:400;font-size:10px;margin-left:6px;">(${vpEntries.length} VP${vpEntries.length===1?'':'s'})</span>
         </td>
         ${displayIdx.map(i => `<td class="num" style="color:${csoDays[i] > 0 ? 'var(--gold-light)' : 'rgba(255,255,255,0.35)'};">${csoDays[i] > 0 ? nfmt(csoDays[i], 2) : '\u2014'}</td>`).join('')}
         <td class="num" style="color:var(--gold-light);font-weight:700;">${nfmt(csoTotal, 2)}</td>
         <td class="num" style="border-left:2px solid rgba(255,255,255,0.2);color:#fff;font-weight:700;">${csoOther > 0 ? nfmt(csoOther, 2) : '\u2014'} <span style="font-size:9px;color:rgba(255,255,255,0.55);font-weight:400;display:block;">${otherLabel}</span></td>
       </tr>`
    );

    if (!vpEntries.length) {
      rows.push(`<tr><td></td><td colspan="${N + 3}" style="color:var(--muted);font-style:italic;padding-left:16px;">No bookings for ${escapeHtml(cso)} in this window</td></tr>`);
      continue;
    }

    for (const [vp, v] of vpEntries) {
      const expKey = cso + '|' + vp;
      const isExp = sevenDayExpanded.has(expKey);
      const arrow = isExp ? '\u25be' : '\u25b8';
      const sdCount = Object.keys(v.sds).length;
      rows.push(
        `<tr class="vp-row" style="cursor:pointer;background:var(--bg-2);" onclick="toggleSevenDayVP('${escapeHtml(expKey).replace(/'/g, "\\\\'")}')">
           <td style="text-align:center;color:var(--muted);">${arrow}</td>
           <td class="name" style="padding-left:16px;">${escapeHtml(vp)} <span style="color:var(--muted);font-weight:400;font-size:11px;">(${sdCount} SD${sdCount===1?'':'s'})</span></td>
           ${displayIdx.map(i => cell(v.days[i])).join('')}
           <td class="num">${nfmt(v.total, 2)}</td>
           <td class="num" style="border-left:2px solid var(--border);color:var(--text-2);">${v.other > 0 ? nfmt(v.other, 2) : '\u2014'}</td>
         </tr>`
      );
      if (isExp) {
        const sdList = Object.entries(v.sds).sort((a,b) => b[1].total - a[1].total);
        for (const [sd, sv] of sdList) {
          rows.push(
            `<tr class="sd-row">
               <td></td>
               <td style="padding-left:42px;color:var(--text-2);">${escapeHtml(sd)}</td>
               ${displayIdx.map(i => `<td class="num" style="font-weight:500;color:var(--text-2);">${sv.days[i] > 0 ? nfmt(sv.days[i], 2) : '\u2014'}</td>`).join('')}
               <td class="num" style="color:var(--text-2);">${nfmt(sv.total, 2)}</td>
               <td class="num" style="border-left:2px solid var(--border);color:var(--muted);">${sv.other > 0 ? nfmt(sv.other, 2) : '\u2014'}</td>
             </tr>`
          );
        }
      }
    }
  }
  body.innerHTML = rows.join('');
}

function toggleSevenDayVP(key) {
  if (sevenDayExpanded.has(key)) sevenDayExpanded.delete(key);
  else sevenDayExpanded.add(key);
  renderSevenDay();
}

// ====================== TREND ======================
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function renderTrend(recs) {
  destroyChart('trend');
  const byMonth = {};
  for (const r of recs) {
    if (!r.m) continue;
    if (!byMonth[r.m]) byMonth[r.m] = { Q: 0, N: 0, C: 0 };
    byMonth[r.m][r.s] += r.sv;
  }
  const keys = Object.keys(byMonth).sort();
  const labels = keys.map(k => { const [y, mo] = k.split('-'); return MONTHS[parseInt(mo)-1] + " '" + y.slice(-2); });
  const qData = keys.map(k => +(byMonth[k].Q / 1_000_000).toFixed(1));
  const nData = keys.map(k => +(byMonth[k].N / 1_000_000).toFixed(1));
  const cData = keys.map(k => +(byMonth[k].C / 1_000_000).toFixed(1));
  const ctx = document.getElementById('trendChart').getContext('2d');
  charts['trend'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Qualified',     data: qData, backgroundColor: '#2d7a4f', borderColor: '#225e3c', borderWidth: 1, stack: 'sv' },
      { label: 'Not Qualified', data: nData, backgroundColor: '#d4a74c', borderColor: '#a8842f', borderWidth: 1, stack: 'sv' },
      { label: 'Cancelled',     data: cData, backgroundColor: '#b53a3a', borderColor: '#922e2e', borderWidth: 1, stack: 'sv' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#4a4438', font: { size: 13, weight: '600' }, padding: 14, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: { backgroundColor: '#1a1814', titleColor: '#d4b07a', bodyColor: '#fff', padding: 12,
          callbacks: { label: c => c.dataset.label + ': ' + nfmt(c.parsed.y, 1) + ' Mn',
            footer: items => 'Total: ' + nfmt(items.reduce((s,i) => s + i.parsed.y, 0), 1) + ' Mn' } },
        datalabels: { color: '#fff', font: { size: 11, weight: '700' },
          formatter: v => v < 30 ? '' : nfmt(v, 0),
          display: c => c.dataset.data[c.dataIndex] >= 30 }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#4a4438', font: { weight: '700', size: 12 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#8a8170', font: { size: 11 }, callback: v => nfmt(v, 0) + ' Mn' }, grid: { color: '#f0ebde', drawBorder: false } }
      }
    }
  });
}

function renderRegion(recs) {
  destroyChart('region');
  const byLoc = {};
  for (const r of recs) byLoc[r.l] = (byLoc[r.l] || 0) + r.sv;
  const labels = Object.keys(byLoc);
  const data = labels.map(l => +(byLoc[l] / 1_000_000).toFixed(1));
  const total = data.reduce((a,b)=>a+b, 0);
  const colors = { 'Dubai': '#b08a4e', 'UAQ': '#4a6fa5', 'Abu Dhabi': '#7a5230' };
  const ctx = document.getElementById('regionChart').getContext('2d');
  charts['region'] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map(l => colors[l] || '#888'), borderColor: '#ffffff', borderWidth: 3 }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#4a4438', font: { size: 13, weight: '600' }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: { backgroundColor: '#1a1814', titleColor: '#d4b07a', bodyColor: '#fff',
          callbacks: { label: c => c.label + ': ' + nfmt(c.parsed, 1) + ' Mn (' + (c.parsed/total*100).toFixed(1) + '%)' } },
        datalabels: { color: '#fff', font: { size: 13, weight: '700' },
          formatter: v => { const pct = v/total*100; return pct < 5 ? '' : nfmt(v, 0) + ' Mn\n' + pct.toFixed(1) + '%'; },
          textAlign: 'center' }
      },
      cutout: '55%'
    }
  });
}

function renderTeam(recs) {
  destroyChart('team');

  let entries;
  if (isLeadership()) {
    // Union-footprint per person from VP_ORDER. Ashish Parakh and Vinit Parikh are
    // company-wide heads and are already excluded inside getLeadershipPersonRows.
    const rows = getLeadershipPersonRows(recs, lbRoleFilter);
    entries = rows.map(row => {
      const qsv = row.agg.qsv, nsv = row.agg.nsv, csv = row.agg.csv;
      return { k: row.name, q: +(qsv/1e6).toFixed(1), n: +(nsv/1e6).toFixed(1), c: +(csv/1e6).toFixed(1), total: (qsv+nsv+csv)/1e6 };
    }).slice(0, 12);
  } else {
    // Non-leadership: prefer the mapping-based direct reports (their SBTR footprints).
    const reps = mappingDirectReports(currentPersonName() || (currentUser ? currentUser.name : ''));
    if (reps.length) {
      const recSet = new Set(recs);
      entries = reps.map(person => {
        const e = personEntry(person);
        let Q = 0, N = 0, C = 0;
        if (e) for (const r of e.records) {
          if (!recSet.has(r)) continue;
          if (r.s === 'Q') Q += r.sv; else if (r.s === 'N') N += r.sv; else if (r.s === 'C') C += r.sv;
        }
        return { k: orgDisplay(person), q: +(Q/1e6).toFixed(1), n: +(N/1e6).toFixed(1), c: +(C/1e6).toFixed(1), total: (Q+N+C)/1e6 };
      }).sort((a,b) => b.total - a.total).slice(0, 12);
    } else {
      const grp = getLeaderboardGroup();
      if (!grp) return;
      const byG = {};
      for (const r of recs) {
        const k = r[grp.field] || '—';
        if (!byG[k]) byG[k] = { Q: 0, N: 0, C: 0 };
        byG[k][r.s] += r.sv;
      }
      entries = Object.entries(byG)
        .map(([k,v]) => ({ k, q: +(v.Q/1e6).toFixed(1), n: +(v.N/1e6).toFixed(1), c: +(v.C/1e6).toFixed(1), total: (v.Q+v.N+v.C)/1e6 }))
        .sort((a,b) => b.total - a.total).slice(0, 12);
    }
  }
  const labels = entries.map(e => e.k.length > 22 ? e.k.slice(0,20)+'…' : e.k);
  const ctx = document.getElementById('teamChart').getContext('2d');
  charts['team'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Qualified',     data: entries.map(e=>e.q), backgroundColor: '#2d7a4f', stack: 'sv' },
      { label: 'Not Qualified', data: entries.map(e=>e.n), backgroundColor: '#d4a74c', stack: 'sv' },
      { label: 'Cancelled',     data: entries.map(e=>e.c), backgroundColor: '#b53a3a', stack: 'sv' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#4a4438', font: { size: 12, weight: '600' }, padding: 12, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: { backgroundColor: '#1a1814', titleColor: '#d4b07a', bodyColor: '#fff',
          callbacks: { label: c => c.dataset.label + ': ' + nfmt(c.parsed.x, 1) + ' Mn' } },
        datalabels: { color: '#fff', font: { size: 10, weight: '700' },
          formatter: v => v < 20 ? '' : nfmt(v, 0),
          display: c => c.dataset.data[c.dataIndex] >= 20 }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#8a8170', callback: v => nfmt(v, 0) + ' Mn' }, grid: { color: '#f0ebde' } },
        y: { stacked: true, ticks: { color: '#4a4438', font: { weight: '600', size: 12 } }, grid: { display: false } }
      }
    }
  });
}

function renderProjects(recs) {
  destroyChart('project');
  const byP = {};
  for (const r of recs) byP[r.p] = (byP[r.p] || 0) + r.sv;
  const entries = Object.entries(byP).map(([k,v]) => ({ k, v: +(v/1e6).toFixed(1) })).sort((a,b) => b.v - a.v).slice(0, 10);
  const labels = entries.map(e => e.k.length > 25 ? e.k.slice(0,23)+'…' : e.k);
  const data = entries.map(e => e.v);
  const total = data.reduce((a,b)=>a+b, 0);
  const ctx = document.getElementById('projectChart').getContext('2d');
  charts['project'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sale Value', data, backgroundColor: '#b08a4e', borderColor: '#8a6938', borderWidth: 1 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1814', titleColor: '#d4b07a', bodyColor: '#fff',
          callbacks: { label: c => nfmt(c.parsed.x, 1) + ' Mn (' + (c.parsed.x/total*100).toFixed(1) + '%)' } },
        datalabels: { color: '#1a1814', font: { size: 11, weight: '700' }, anchor: 'end', align: 'end', offset: 4, formatter: v => nfmt(v, 0) }
      },
      layout: { padding: { right: 48 } },
      scales: { x: { ticks: { color: '#8a8170', callback: v => nfmt(v, 0) + ' Mn' }, grid: { color: '#f0ebde' } },
                y: { ticks: { color: '#4a4438', font: { weight: '600', size: 12 } }, grid: { display: false } } }
    }
  });
}

// ====================== LEADERBOARD ======================
function buildLeaderboardHeader() {
  const lb = getLeaderboardGroup();
  const showPns = showsPNS();
  const row = document.getElementById('lbHeaderRow');
  const cols = [
    '<th style="width:50px;">#</th>',
    `<th>${lb ? escapeHtml(lb.label) : 'Name'}</th>`,
    '<th style="width:80px;text-align:right;">Units</th>',
    '<th style="width:130px;text-align:right;">Sale Value</th>'
  ];
  if (showPns) cols.push('<th style="width:120px;text-align:right;">PNS</th>');
  cols.push('<th style="width:130px;text-align:right;">Qualified</th>');
  cols.push('<th style="width:130px;text-align:right;">Not Qualified</th>');
  cols.push('<th style="width:130px;text-align:right;">Cancelled</th>');
  cols.push('<th style="width:90px;text-align:right;">Qual %</th>');
  cols.push('<th style="width:90px;text-align:right;">Canc %</th>');
  row.innerHTML = cols.join('');
  document.getElementById('lbTitle').textContent = (lb ? lb.label : '') + ' Leaderboard';
  document.getElementById('teamTitle').textContent = (lb ? lb.label : '') + ' Performance';
}

function renderLeaderboard(recs) {
  renderLbRolePills();
  const body = document.getElementById('lbBody');
  const showPns = showsPNS();

  // Leadership: use union-footprint rows ranked, with the section-level role filter
  if (isLeadership()) {
    const rows = getLeadershipPersonRows(recs, lbRoleFilter);
    if (!rows.length) { body.innerHTML = `<tr><td colspan="${showPns?10:9}" class="empty">No data in current selection</td></tr>`; }
    else {
      const maxSv = Math.max(1, ...rows.map(r => r.agg.sv));
      body.innerHTML = rows.map((row, i) => {
        const v = row.agg;
        const me = currentUser && row.key === currentUser.name;
        const qPct = v.sv ? (v.qsv/v.sv*100).toFixed(1) : '0.0';
        const cPct = v.sv ? (v.csv/v.sv*100).toFixed(1) : '0.0';
        let cells = [
          `<td><span class="rank ${i < 3 ? 'top' : ''}">${i+1}</span></td>`,
          `<td class="name">${escapeHtml(row.name)}${row.isTeam ? ' <span style="color:var(--muted);font-weight:400;font-size:11px;">(team attribution)</span>' : ''}</td>`,
          `<td class="num">${nfmt(Math.round(v.units))}</td>`,
          `<td class="num">${fmtMn(v.sv)} Mn<div class="lb-bar" style="width:${Math.max(2, Math.round(v.sv/maxSv*100))}%"></div></td>`
        ];
        if (showPns) cells.push(`<td class="num">${nfmt(v.pns, 1)} Mn</td>`);
        cells.push(`<td class="num">${fmtMn(v.qsv)} Mn</td>`);
        cells.push(`<td class="num">${fmtMn(v.nsv)} Mn</td>`);
        cells.push(`<td class="num">${fmtMn(v.csv)} Mn</td>`);
        cells.push(`<td class="num">${qPct}%</td>`);
        cells.push(`<td class="num">${cPct}%</td>`);
        return `<tr class="${me ? 'lb-me' : ''}">${cells.join('')}</tr>`;
      }).join('');
    }
    // Logic note for leadership view
    const noteEl = document.getElementById('lbLogicNote');
    if (noteEl) {
      const roleLabel = (VP_ROLE_PILLS.find(p => p.key === lbRoleFilter) || VP_ROLE_PILLS[0]).label;
      noteEl.innerHTML = `<em><strong>Vice President Leaderboard logic:</strong> Each row is one person's <strong>union footprint</strong> — every booking where their name appears in any role (Sales Manager / Sales Director / Vice President / Sr. VP / CSO). Current view: <strong>${roleLabel}</strong>. Because the same booking can involve several people, rows intentionally overlap and no longer sum to Total Declaration above. London Team keeps original Sales-Director-based attribution.</em>`;
    }
    return;
  }

  // Non-leadership: mapping-based DIRECT-REPORTS leaderboard.
  // CSO / VP / Sales Director see the people who currently report to them per the
  // Sales Team Mapping, ranked by Full Sale Value (their SBTR performance).
  const reports = mappingDirectReports(currentPersonName() || (currentUser ? currentUser.name : ''));
  if (reports.length) {
    const recSet = new Set(recs);
    const rows = reports.map(person => {
      const e = personEntry(person);
      const v = { units:0, sv:0, pns:0, qsv:0, nsv:0, csv:0 };
      if (e) for (const r of e.records) {
        if (!recSet.has(r)) continue;
        v.units += r.uc; v.sv += r.sv; v.pns += r.pns;
        if (r.s==='Q') v.qsv+=r.sv; else if (r.s==='N') v.nsv+=r.sv; else if (r.s==='C') v.csv+=r.sv;
      }
      return { name: person, v };
    }).sort((a,b) => b.v.sv - a.v.sv);
    const maxSvR = Math.max(1, ...rows.map(r => r.v.sv));
    body.innerHTML = rows.map((row, i) => {
      const v = row.v;
      const qPct = v.sv ? (v.qsv/v.sv*100).toFixed(1) : '0.0';
      const cPct = v.sv ? (v.csv/v.sv*100).toFixed(1) : '0.0';
      let cells = [
        `<td><span class="rank ${i<3?'top':''}">${i+1}</span></td>`,
        `<td class="name">${escapeHtml(orgDisplay(row.name))}</td>`,
        `<td class="num">${nfmt(Math.round(v.units))}</td>`,
        `<td class="num">${fmtMn(v.sv)} Mn<div class="lb-bar" style="width:${Math.max(2,Math.round(v.sv/maxSvR*100))}%"></div></td>`
      ];
      if (showPns) cells.push(`<td class="num">${nfmt(v.pns,1)} Mn</td>`);
      cells.push(`<td class="num">${fmtMn(v.qsv)} Mn</td>`);
      cells.push(`<td class="num">${fmtMn(v.nsv)} Mn</td>`);
      cells.push(`<td class="num">${fmtMn(v.csv)} Mn</td>`);
      cells.push(`<td class="num">${qPct}%</td>`);
      cells.push(`<td class="num">${cPct}%</td>`);
      return `<tr>${cells.join('')}</tr>`;
    }).join('') || `<tr><td colspan="${showPns?10:9}" class="empty">No data in current selection</td></tr>`;
    const repLevel = getMappingPersonLevel(reports[0]);
    const repLabel = ORG_LEVELS[repLevel] ? ORG_LEVELS[repLevel].label : 'Team';
    document.getElementById('lbTitle').textContent = `My Team \u2014 ${repLabel}s`;
    const teamTitleEl = document.getElementById('teamTitle');
    if (teamTitleEl) teamTitleEl.textContent = `My ${repLabel}s \u2014 Performance`;
    // Also fix the column header th to match the actual level being shown
    const lbHeaderRow = document.getElementById('lbHeaderRow');
    if (lbHeaderRow) {
      const ths = lbHeaderRow.querySelectorAll('th');
      if (ths[1]) ths[1].textContent = repLabel;
    }
    const noteElM = document.getElementById('lbLogicNote');
    if (noteElM) noteElM.innerHTML = `<em><strong>My Team leaderboard:</strong> the people who report to you in the current <strong>Sales Team Mapping</strong> (${reports.length} ${repLabel}${reports.length===1?'':'s'}), ranked by Full Sale Value. Numbers from the SBTR — every booking where their name appears in any role.</em>`;
    return;
  }

  // Non-leadership fallback (e.g. Sales Managers with no reports): single-attribution leaderboard
  const grp = getLeaderboardGroup();
  if (!grp) { body.innerHTML = ''; return; }
  const byG = {};
  for (const r of recs) {
    const k = r[grp.field] || '—';
    if (!byG[k]) byG[k] = { units: 0, sv: 0, pns: 0, qsv: 0, nsv: 0, csv: 0 };
    byG[k].units += r.uc; byG[k].sv += r.sv; byG[k].pns += r.pns;
    if (r.s === 'Q') byG[k].qsv += r.sv;
    else if (r.s === 'N') byG[k].nsv += r.sv;
    else if (r.s === 'C') byG[k].csv += r.sv;
  }
  const entries = Object.entries(byG).sort((a,b) => b[1].sv - a[1].sv);
  if (!entries.length) { body.innerHTML = `<tr><td colspan="${showPns?10:9}" class="empty">No data in current selection</td></tr>`; return; }
  const maxSv = Math.max(1, ...entries.map(e => e[1].sv));
  body.innerHTML = entries.map((e,i) => {
    const [name, v] = e;
    const me = currentUser && name === currentUser.name;
    const qPct = v.sv ? (v.qsv/v.sv*100).toFixed(1) : '0.0';
    const cPct = v.sv ? (v.csv/v.sv*100).toFixed(1) : '0.0';
    let cells = [
      `<td><span class="rank ${i < 3 ? 'top' : ''}">${i+1}</span></td>`,
      `<td class="name">${escapeHtml(name)}</td>`,
      `<td class="num">${nfmt(Math.round(v.units))}</td>`,
      `<td class="num">${fmtMn(v.sv)} Mn<div class="lb-bar" style="width:${Math.max(2, Math.round(v.sv/maxSv*100))}%"></div></td>`
    ];
    if (showPns) cells.push(`<td class="num">${nfmt(v.pns, 1)} Mn</td>`);
    cells.push(`<td class="num">${fmtMn(v.qsv)} Mn</td>`);
    cells.push(`<td class="num">${fmtMn(v.nsv)} Mn</td>`);
    cells.push(`<td class="num">${fmtMn(v.csv)} Mn</td>`);
    cells.push(`<td class="num">${qPct}%</td>`);
    cells.push(`<td class="num">${cPct}%</td>`);
    return `<tr class="${me ? 'lb-me' : ''}">${cells.join('')}</tr>`;
  }).join('');

  // Logic note
  const noteEl = document.getElementById('lbLogicNote');
  if (noteEl) {
    const grpLabel = grp.label;
    let attrib;
    if (grp.field === 'vp')      attrib = 'Each booking is attributed to exactly one Vice President (by the Team Head column).';
    else if (grp.field === 'sd') attrib = 'Bookings are attributed by the <strong>Sales Director</strong> column. Rows where it is Gopeshwar or Vinit show as <strong>London Team</strong>.';
    else if (grp.field === 'sm') attrib = 'Bookings are attributed by the <strong>Sales Manager</strong> (Attended by) column.';
    else                          attrib = 'Bookings grouped by Project Name.';
    noteEl.innerHTML = `<em><strong>${grpLabel} Leaderboard logic:</strong> ${attrib} Within the current Region & Date filters, each group's totals sum cleanly to the Performance Overview totals. <strong>Qual %</strong> and <strong>Canc %</strong> are share of that group's own Sale Value.</em>`;
  }
}



// ====================== BROKER LEADERBOARD ======================
function renderBrokerLeaderboard(recs) {
  const block = document.getElementById('brokerBlock');
  // Only for non-leadership views (SM / SD / VP / CSO), not Management / Ashish direct view
  if (isLeadership()) { block.style.display = 'none'; return; }
  block.style.display = '';

  const head = document.getElementById('brokerHeaderRow');
  head.innerHTML =
    '<th style="width:50px;">#</th>' +
    '<th>Broker</th>' +
    '<th style="width:80px;text-align:right;">Units</th>' +
    '<th style="width:140px;text-align:right;">Full Sale Value</th>' +
    '<th style="width:130px;text-align:right;">Qualified</th>' +
    '<th style="width:130px;text-align:right;">Not Qualified</th>' +
    '<th style="width:130px;text-align:right;">Cancelled</th>' +
    '<th style="width:80px;text-align:right;">Qual %</th>' +
    '<th style="width:80px;text-align:right;">Canc %</th>';

  const byB = {};
  for (const r of recs) {
    const k = r.br || 'Direct';
    if (!byB[k]) byB[k] = { units: 0, sv: 0, qsv: 0, nsv: 0, csv: 0 };
    byB[k].units += r.uc; byB[k].sv += r.sv;
    if (r.s === 'Q') byB[k].qsv += r.sv;
    else if (r.s === 'N') byB[k].nsv += r.sv;
    else if (r.s === 'C') byB[k].csv += r.sv;
  }
  const entries = Object.entries(byB).sort((a, b) => b[1].sv - a[1].sv);
  const body = document.getElementById('brokerBody');
  document.getElementById('brokerMeta').textContent = `${entries.length} broker${entries.length===1?'':'s'} · ranked by Full Sale Value`;
  if (!entries.length) { body.innerHTML = `<tr><td colspan="9" class="empty">No broker business in the current selection</td></tr>`; return; }
  body.innerHTML = entries.map(([name, v], i) => {
    const qPct = v.sv ? (v.qsv/v.sv*100).toFixed(1) : '0.0';
    const cPct = v.sv ? (v.csv/v.sv*100).toFixed(1) : '0.0';
    return `<tr>
      <td><span class="rank ${i < 3 ? 'top' : ''}">${i+1}</span></td>
      <td class="name">${escapeHtml(name)}</td>
      <td class="num">${nfmt(Math.round(v.units))}</td>
      <td class="num">${fmtMn(v.sv)} Mn</td>
      <td class="num">${fmtMn(v.qsv)} Mn</td>
      <td class="num">${fmtMn(v.nsv)} Mn</td>
      <td class="num">${fmtMn(v.csv)} Mn</td>
      <td class="num">${qPct}%</td>
      <td class="num">${cPct}%</td>
    </tr>`;
  }).join('');
}

// ====================== RECENT BOOKINGS ======================
function getRecentColumns() {
  const showPns = showsPNS();
  const showMgmt = isLeadership();
  const cols = [
    { key: 'd',  label: 'Date',           filter: 'text',   width: 100 },
    { key: 'u',  label: 'Unit',           filter: 'text',   width: 120 }
  ];
  if (showMgmt) cols.push({ key: 'ut', label: 'Unit Type', filter: 'select', width: 110 });
  cols.push({ key: 'p',  label: 'Project',        filter: 'select', width: 180 });
  cols.push({ key: 'l',  label: 'Region',         filter: 'select', width: 100 });
  if (showMgmt) cols.push({ key: 'vp', label: 'Vice President', filter: 'select', width: 150 });
  cols.push({ key: 'sd', label: 'Sales Director', filter: 'select', width: 160 });
  cols.push({ key: 'sm', label: 'Sales Manager',  filter: 'select', width: 160 });
  // Broker shown to everyone EXCEPT Management/Ashish (they have it in other columns)
  if (!showMgmt) cols.push({ key: 'br', label: 'Broker', filter: 'text', width: 200 });
  cols.push({ key: 'sv', label: 'Sale Value', filter: null, width: 120, num: true });
  if (showPns) cols.push({ key: 'pns', label: 'PNS', filter: null, width: 110, num: true });
  cols.push({ key: 'pp', label: 'Paid %', filter: null, width: 90, num: true });
  cols.push({ key: 's', label: 'Status', filter: 'select', width: 130 });
  // Milestone columns for non-leadership views (10%/20% dates, SPA, DLD)
  if (!showMgmt) {
    cols.push({ key: 'd10', label: '10% Date',     filter: null, width: 100 });
    cols.push({ key: 'd20', label: '20% Date',     filter: null, width: 100 });
    cols.push({ key: 'spa', label: 'SPA Executed', filter: 'select', width: 120 });
    cols.push({ key: 'dld', label: 'DLD Status',   filter: 'select', width: 130 });
  }
  return cols;
}

function buildRecentHeader() {
  const cols = getRecentColumns();
  const headRow = document.getElementById('recentHeaderRow');
  const filterRow = document.getElementById('recentFilterRow');
  headRow.innerHTML = cols.map(c => `<th style="min-width:${c.width}px;${c.num?'text-align:right;':''}">${escapeHtml(c.label)}</th>`).join('');
  recentFilters = {};
  filterRow.innerHTML = cols.map(c => {
    if (!c.filter) return '<th></th>';
    if (c.filter === 'select') {
      let opts;
      if (c.key === 's') opts = ['', 'Qualified', 'Not Qualified', 'Cancelled'];
      else opts = ['', ...Array.from(new Set(baseRecords.map(r => r[c.key]))).filter(Boolean).sort()];
      return `<th><select data-col="${c.key}" onchange="onRecentFilterChange(this)">${
        opts.map(o => `<option value="${escapeHtml(o)}">${o === '' ? 'All' : escapeHtml(o)}</option>`).join('')
      }</select></th>`;
    }
    return `<th><input type="text" placeholder="filter…" data-col="${c.key}" oninput="onRecentFilterChange(this)"></th>`;
  }).join('');
}

function onRecentFilterChange(el) {
  const col = el.dataset.col;
  const val = el.value.trim();
  if (val) recentFilters[col] = val;
  else delete recentFilters[col];
  applyFiltersRecentOnly();
}

function applyFiltersRecentOnly() {
  const from = document.getElementById('dateFrom').value;
  const to   = document.getElementById('dateTo').value;
  const dd   = getDrilldownConfig();
  const ddVal = document.getElementById('drilldownSelect')?.value || 'All';
  let recs = baseRecords.filter(r => selectedLocs.has(r.l));
  if (from) recs = recs.filter(r => r.d >= from);
  if (to)   recs = recs.filter(r => r.d <= to);
  if (dd && ddVal !== 'All') recs = recs.filter(r => r[dd.field] === ddVal);
  renderRecent(recs);
}

function renderRecent(recs) {
  const cols = getRecentColumns();
  const body = document.getElementById('recentBody');
  let filtered = recs;
  for (const [col, val] of Object.entries(recentFilters)) {
    const v = val.toLowerCase();
    if (col === 's') {
      const map = { 'Qualified':'Q', 'Not Qualified':'N', 'Cancelled':'C' };
      const code = map[val];
      if (code) filtered = filtered.filter(r => r.s === code);
    } else {
      filtered = filtered.filter(r => String(r[col] || '').toLowerCase().includes(v));
    }
  }
  const sorted = [...filtered].sort((a,b) => b.d.localeCompare(a.d));
  document.getElementById('recentTotalCount').textContent = nfmt(filtered.length);
  const sumSV = filtered.reduce((s,r)=>s+r.sv, 0);
  const sumUC = filtered.reduce((s,r)=>s+r.uc, 0);
  document.getElementById('recentSumSV').textContent = fmtMn(sumSV);
  document.getElementById('recentSumUC').textContent = nfmt(Math.round(sumUC));
  const display = sorted.slice(0, 200);
  document.getElementById('recentShownCount').textContent = nfmt(display.length);
  if (!display.length) { body.innerHTML = `<tr><td colspan="${cols.length}" class="empty">No bookings match the current filters</td></tr>`; return; }
  body.innerHTML = display.map(r => {
    return '<tr>' + cols.map(c => {
      let v = r[c.key];
      let cls = c.num ? 'num' : '';
      let html;
      if (c.key === 'sv')       html = fmtMn(v) + ' Mn';
      else if (c.key === 'pns') html = nfmt(v, 2) + ' Mn';
      else if (c.key === 'pp')  html = nfmt(v, 1) + '%';
      else if (c.key === 'd10' || c.key === 'd20') html = (v && v !== 'NA') ? escapeHtml(v) : '<span style="color:var(--muted);">—</span>';
      else if (c.key === 'spa' || c.key === 'dld') html = (v && v !== 'NA') ? escapeHtml(v) : '<span style="color:var(--muted);">—</span>';
      else if (c.key === 's') {
        if (v === 'Q')      html = '<span class="tag tag-q">Qualified</span>';
        else if (v === 'C') html = '<span class="tag tag-c">Cancelled</span>';
        else                html = '<span class="tag tag-n">Not Qualified</span>';
      } else html = escapeHtml(v);
      return `<td${cls?' class="'+cls+'"':''}>${html}</td>`;
    }).join('') + '</tr>';
  }).join('');
}

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
