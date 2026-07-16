// ============================================================
//  STAB v2.0.0 — app.js (Supabase Edition)
//  Gestión de Inventario — Inversiones Cleer David C.A.
//  Modelo Estacional + Clasificación ABC + Cloud Sync
// ============================================================

'use strict';

// ─── CREDENCIALES DE SUPABASE ────────────────────────────────
const SUPABASE_URL = 'https://pwmewoorpcevnclqyuvj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3bWV3b29ycGNldm5jbHF5dXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODc2NzIsImV4cCI6MjA5OTc2MzY3Mn0.UEhWpiDuucFARpMQQETpsiOENaoyVO5ovwav_9FAHZ4';

// Inicialización del cliente de Supabase
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const APP_VERSION = '2.0.0';

// Modelo estacional — Investigación de Operaciones UNEFA
const SEASON_HIGH_FACTOR   = 1.5;   // +50% factor multiplicador demanda
const SEASON_CRITICAL_CATS = ['Medicina', 'Alimentos', 'Bebidas'];
const SEASON_STORAGE_KEY   = 'stab_season_mode';

const CATEGORIES = ['Todos','Medicina','Alimentos','Bebidas','Higiene','Limpieza','Ferretería','Papelería','Otros'];

// Productos Demo para precarga en primer registro
const DEMO_PRODUCTS = [
  { name: 'Paracetamol 500mg', category: 'Medicina', unit: 'Cajas', currentStock: 45, minStock: 20, maxStock: 100, price: 8.50, costPrice: 5.00, notes: 'Guardar en lugar fresco y seco' },
  { name: 'Ibuprofeno 400mg', category: 'Medicina', unit: 'Cajas', currentStock: 8, minStock: 15, maxStock: 60, price: 10.00, costPrice: 6.50, notes: '' },
  { name: 'Arroz Mary 1kg', category: 'Alimentos', unit: 'Kg', currentStock: 0, minStock: 10, maxStock: 50, price: 2.50, costPrice: 1.80, notes: '' },
  { name: 'Azúcar Blanca 1kg', category: 'Alimentos', unit: 'Kg', currentStock: 30, minStock: 10, maxStock: 100, price: 2.00, costPrice: 1.30, notes: '' },
  { name: 'Aceite La Favorita 1L', category: 'Alimentos', unit: 'L', currentStock: 3, minStock: 8, maxStock: 40, price: 4.50, costPrice: 3.20, notes: 'No exponer al sol' },
  { name: 'Agua Mineral 600mL', category: 'Bebidas', unit: 'Unidades', currentStock: 48, minStock: 20, maxStock: 120, price: 1.00, costPrice: 0.60, notes: '' },
  { name: 'Shampoo Clear 400mL', category: 'Higiene', unit: 'Unidades', currentStock: 12, minStock: 5, maxStock: 30, price: 6.00, costPrice: 4.00, notes: '' },
  { name: 'Cloro Líquido 1L', category: 'Limpieza', unit: 'Unidades', currentStock: 6, minStock: 10, maxStock: 30, price: 3.00, costPrice: 1.80, notes: 'Almacenar en lugar ventilado' },
];

// ─── STATE ────────────────────────────────────────────────────
let state = {
  products: [],
  currentView: 'dashboard',
  filter: 'Todos',
  abcFilter: 'Todos',    // 'Todos'|'A'|'B'|'C'
  search: '',
  sort: 'name-asc',
  editId: null,
  deleteId: null,
  seasonMode: 'low',   // 'low' | 'high'
  abcMap: new Map(),    // product id → 'A'|'B'|'C'
  authMode: 'login',    // 'login' | 'register'
  currentUser: null
};

// ─── AUTHENTICATION LOGIC ──────────────────────────────────────

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (!email || !password) {
    showToast('Por favor introduce tu correo y contraseña.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = state.authMode === 'login' ? 'Iniciando sesión...' : 'Registrando usuario...';

  try {
    if (state.authMode === 'login') {
      const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showToast('Sesión iniciada con éxito.', 'success');
    } else {
      const { data, error } = await _supabase.auth.signUp({ email, password });
      if (error) throw error;
      showToast('Registro completado. ¡Bienvenido!', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    updateAuthDOM();
  }
}

async function handleLogout() {
  try {
    const { error } = await _supabase.auth.signOut();
    if (error) throw error;
    showToast('Sesión cerrada correctamente.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateAuthDOM() {
  const isLogged = !!state.currentUser;

  // Switcheo de pantallas principales
  document.getElementById('loginScreen').style.display = isLogged ? 'none' : 'flex';
  document.getElementById('appShell').style.display = isLogged ? 'flex' : 'none';
  document.getElementById('bottomNav').style.display = isLogged ? 'flex' : 'none';
  document.getElementById('fab').style.display = isLogged ? 'grid' : 'none';

  if (!isLogged) {
    document.getElementById('loginForm').reset();
  }
}

// ─── CLOUD DATABASE SYNC ──────────────────────────────────────

async function loadProducts() {
  if (!state.currentUser) return;
  
  try {
    const { data, error } = await _supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    // Si el usuario es nuevo y no tiene productos, le inyectamos los demos
    if (data.length === 0) {
      const initialDemos = DEMO_PRODUCTS.map(p => ({
        ...p,
        userId: state.currentUser.id
      }));

      const { data: insertedData, error: insertError } = await _supabase
        .from('products')
        .insert(initialDemos)
        .select();

      if (insertError) throw insertError;
      state.products = insertedData;
    } else {
      state.products = data;
    }

    renderDashboard();
    if (state.currentView === 'inventory') renderInventory();
    else updateInvCount();

  } catch (err) {
    showToast('Error de sincronización remota: ' + err.message, 'error');
    state.products = [];
  }
}

// ─── HELPERS ──────────────────────────────────────────────────
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('es-VE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(n) {
  if (!n || n <= 0) return '—';
  return 'Bs ' + parseFloat(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── SEASONAL MODEL ───────────────────────────────────────────
function getEffectiveMinStock(p) {
  if (state.seasonMode === 'high' && SEASON_CRITICAL_CATS.includes(p.category)) {
    return Math.ceil(p.minStock * SEASON_HIGH_FACTOR);
  }
  return p.minStock;
}

function getStockStatus(p) {
  const effectiveMin = getEffectiveMinStock(p);
  if (p.currentStock === 0)               return 'out';
  if (p.currentStock <= effectiveMin)      return 'low';
  if (p.currentStock >= p.maxStock)        return 'full';
  return 'ok';
}

// ─── ABC CLASSIFICATION ──────────────────────────────────────
function computeAllABC() {
  const items = state.products.map(p => ({
    id: p.id,
    investment: p.currentStock * (parseFloat(p.costPrice) || 0)
  }));

  const totalInvestment = items.reduce((sum, i) => sum + i.investment, 0);
  if (totalInvestment <= 0) {
    state.abcMap = new Map(state.products.map(p => [p.id, 'C']));
    return;
  }

  items.sort((a, b) => b.investment - a.investment);

  let cumulative = 0;
  const abcMap = new Map();
  items.forEach(item => {
    cumulative += item.investment;
    const pct = cumulative / totalInvestment;
    if (pct <= 0.80)      abcMap.set(item.id, 'A');
    else if (pct <= 0.95) abcMap.set(item.id, 'B');
    else                  abcMap.set(item.id, 'C');
  });

  state.abcMap = abcMap;
}

function stockStatusLabel(s) {
  return { out: 'Sin stock', low: 'Stock bajo', ok: 'Normal', full: 'Máximo' }[s] || 'Normal';
}

function stockBarPercent(p) {
  if (p.maxStock <= 0) return 0;
  return Math.min(100, Math.round((p.currentStock / p.maxStock) * 100));
}

function stockBarColor(s) {
  return { out: 'var(--text-3)', low: 'var(--warn)', ok: 'var(--ok)', full: 'var(--info)' }[s] || 'var(--ok)';
}

function categoryIcon(cat) {
  const icons = { Medicina: '💊', Alimentos: '🍚', Bebidas: '🧃', Higiene: '🧴', Limpieza: '🧹', Ferretería: '🔧', Papelería: '📎', Otros: '📦' };
  return icons[cat] || '📦';
}

// ─── VIEW SWITCHER ────────────────────────────────────────────
function switchView(view) {
  state.currentView = view;

  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');

  // Update sidebar nav
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Update bottom nav
  document.querySelectorAll('.bnav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Render appropriate view
  if (view === 'dashboard') renderDashboard();
  if (view === 'inventory') renderInventory();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  computeAllABC();
  renderKPIs();
  renderAlerts();
  updateDashDate();
  updateSeasonUI();
}

function updateDashDate() {
  const el = document.getElementById('dashDate');
  if (!el) return;
  const now = new Date();
  const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  el.textContent = `${days[now.getDay()]} ${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
}

function renderKPIs() {
  const total  = state.products.length;
  const out    = state.products.filter(p => getStockStatus(p) === 'out').length;
  const low    = state.products.filter(p => getStockStatus(p) === 'low').length;
  const ok     = state.products.filter(p => ['ok','full'].includes(getStockStatus(p))).length;

  const grid = document.getElementById('kpiGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="kpi-card kpi-total">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        </svg>
      </div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-label">Total productos</div>
    </div>
    <div class="kpi-card kpi-ok">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="kpi-value">${ok}</div>
      <div class="kpi-label">Stock normal</div>
    </div>
    <div class="kpi-card kpi-warn">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="kpi-value">${low}</div>
      <div class="kpi-label">Stock bajo</div>
    </div>
    <div class="kpi-card kpi-danger">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <div class="kpi-value">${out}</div>
      <div class="kpi-label">Sin stock</div>
    </div>
  `;

  // Update sidebar alert badge
  const alertCount = low + out;
  const badge = document.getElementById('sidebarAlertCount');
  if (badge) {
    badge.textContent = alertCount;
    badge.classList.toggle('hidden', alertCount === 0);
    badge.classList.toggle('ok', alertCount === 0);
  }
}

function renderAlerts() {
  const list = document.getElementById('alertList');
  if (!list) return;

  const alerts = state.products
    .filter(p => ['out','low'].includes(getStockStatus(p)))
    .sort((a, b) => {
      const statusOrder = { out: 0, low: 1 };
      return statusOrder[getStockStatus(a)] - statusOrder[getStockStatus(b)] || a.name.localeCompare(b.name);
    });

  if (!alerts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✓</div>
        <p>Todo en orden. <strong>No hay alertas activas.</strong></p>
      </div>`;
    return;
  }

  list.innerHTML = alerts.map(p => {
    const st = getStockStatus(p);
    const effectiveMin = getEffectiveMinStock(p);
    const cls = st === 'out' ? 'alert-danger' : 'alert-warn';
    const isSeasonAdjusted = state.seasonMode === 'high' && SEASON_CRITICAL_CATS.includes(p.category);
    let msg;
    if (st === 'out') {
      msg = 'Sin stock — requiere reposición inmediata';
    } else if (isSeasonAdjusted) {
      msg = `Bajo mínimo estacional: ${effectiveMin} ${p.unit} (base: ${p.minStock} ×1.5)`;
    } else {
      msg = `Por debajo del mínimo (${p.minStock} ${p.unit})`;
    }
    return `
      <div class="alert-item ${cls}" data-id="${p.id}">
        <div class="alert-dot"></div>
        <div class="alert-info">
          <div class="alert-name">${categoryIcon(p.category)} ${p.name}</div>
          <div class="alert-meta">${msg}</div>
        </div>
        <div class="alert-stock">${p.currentStock} ${p.unit}</div>
      </div>`;
  }).join('');

  // Click alert to go to inventory
  list.querySelectorAll('.alert-item').forEach(el => {
    el.addEventListener('click', () => switchView('inventory'));
  });
}

// ─── INVENTORY ────────────────────────────────────────────────
function getFilteredProducts() {
  let list = [...state.products];

  // Filter by product category
  if (state.filter !== 'Todos') {
    list = list.filter(p => p.category === state.filter);
  }

  // Filter by ABC classification
  if (state.abcFilter !== 'Todos') {
    list = list.filter(p => (state.abcMap.get(p.id) || 'C') === state.abcFilter);
  }

  // Filter by search text
  if (state.search.trim()) {
    const q = state.search.toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.notes && p.notes.toLowerCase().includes(q))
    );
  }

  const [sortField, sortDir] = state.sort.split('-');
  list.sort((a, b) => {
    if (state.sort === 'status') {
      const order = { out: 0, low: 1, ok: 2, full: 3 };
      return order[getStockStatus(a)] - order[getStockStatus(b)];
    }
    let va = sortField === 'stock' ? a.currentStock : a.name.toLowerCase();
    let vb = sortField === 'stock' ? b.currentStock : b.name.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return list;
}

function renderInventory() {
  computeAllABC();
  renderFilterChips();
  renderAbcFilterChips();
  renderProductGrid();
  updateInvCount();
}

function updateInvCount() {
  const el = document.getElementById('invCount');
  if (!el) return;
  const filtered = getFilteredProducts();
  const total = state.products.length;
  el.textContent = filtered.length === total
    ? `${total} producto${total !== 1 ? 's' : ''} en inventario`
    : `${filtered.length} de ${total} productos`;
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  if (!container) return;

  const used = ['Todos', ...new Set(state.products.map(p => p.category))];
  container.innerHTML = used.map(cat => `
    <button class="chip ${state.filter === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>
  `).join('');

  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.cat;
      renderInventory();
    });
  });
}

function renderAbcFilterChips() {
  const container = document.getElementById('abcFilterChips');
  if (!container) return;

  const abcOptions = ['Todos', 'A', 'B', 'C'];
  const abcLabels = { Todos: '📊 Todos', A: '🥇 Clase A', B: '🥈 Clase B', C: '🥉 Clase C' };

  container.innerHTML = abcOptions.map(opt => `
    <button class="chip chip-abc ${state.abcFilter === opt ? 'active' : ''}" data-abc="${opt}">${abcLabels[opt]}</button>
  `).join('');

  container.querySelectorAll('.chip-abc').forEach(chip => {
    chip.addEventListener('click', () => {
      state.abcFilter = chip.dataset.abc;
      renderInventory();
    });
  });
}

function renderProductGrid() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const products = getFilteredProducts();

  if (!state.products.length) {
    grid.innerHTML = `
      <div class="no-products">
        <span class="no-products-icon">📦</span>
        <h3>Inventario vacío</h3>
        <p>Aún no has añadido ningún producto.<br>Pulsa <strong>"Añadir producto"</strong> para comenzar.</p>
      </div>`;
    return;
  }

  if (!products.length) {
    grid.innerHTML = `
      <div class="no-products">
        <span class="no-products-icon">🔍</span>
        <h3>Sin resultados</h3>
        <p>No se encontraron productos con los filtros actuales.<br>Intenta con otro término o categoría.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map(p => productCardHTML(p)).join('');

  // Bind card events
  grid.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openProductModal(btn.dataset.id); });
  });
  grid.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openConfirm(btn.dataset.id); });
  });
}

function productCardHTML(p) {
  const st    = getStockStatus(p);
  const pct   = stockBarPercent(p);
  const color = stockBarColor(st);
  const label = stockStatusLabel(st);
  const badgeCls = { out: 'badge-out', low: 'badge-warn', ok: 'badge-ok', full: 'badge-ok' }[st];
  const effectiveMin = getEffectiveMinStock(p);
  const isSeasonAdjusted = state.seasonMode === 'high' && SEASON_CRITICAL_CATS.includes(p.category);

  // ABC classification badge
  const abc = state.abcMap.get(p.id) || 'C';
  const abcBadgeCls = { A: 'badge-abc-a', B: 'badge-abc-b', C: 'badge-abc-c' }[abc];

  return `
    <div class="product-card${isSeasonAdjusted && st === 'low' ? ' season-alert' : ''}">
      <div class="product-card-header">
        <div class="product-name">${categoryIcon(p.category)} ${p.name}</div>
        <div class="product-badges">
          <span class="badge badge-cat">${p.category}</span>
          <span class="badge ${badgeCls}">${label}</span>
          <span class="badge ${abcBadgeCls}">ABC: ${abc}</span>
        </div>
      </div>
      <div class="product-stock-row">
        <span class="stock-value" style="color:${color}">${p.currentStock}</span>
        <span class="stock-unit">${p.unit}</span>
      </div>
      <div class="stock-bar-wrap">
        <div class="stock-bar-track">
          <div class="stock-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="stock-bar-labels">
          <span>Mín: ${effectiveMin}${isSeasonAdjusted ? ' 🏖️' : ''}</span>
          <span>${pct}%</span>
          <span>Máx: ${p.maxStock}</span>
        </div>
      </div>
      <div class="product-meta">
        <span>${p.price > 0 ? fmtMoney(p.price) : '<span style="color:var(--text-3)">Sin precio</span>'}</span>
        <div class="product-actions">
          <button class="action-btn edit" data-id="${p.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${p.id}" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>
      ${p.notes ? `<div style="font-size:11px;color:var(--text-3);padding-top:4px;border-top:1px solid var(--border);">📝 ${p.notes}</div>` : ''}
    </div>`;
}

// ─── SEASON UI ────────────────────────────────────────────────
function updateSeasonUI() {
  const btnLow  = document.getElementById('seasonBtnLow');
  const btnHigh = document.getElementById('seasonBtnHigh');
  const slider  = document.getElementById('seasonSlider');
  const toggle  = document.getElementById('seasonToggle');

  const isHigh = state.seasonMode === 'high';

  // Update dashboard toggle
  if (btnLow && btnHigh) {
    btnLow.classList.toggle('active', !isHigh);
    btnHigh.classList.toggle('active', isHigh);
    if (toggle) toggle.classList.toggle('season-high', isHigh);
    if (slider) slider.style.transform = isHigh ? 'translateX(100%)' : 'translateX(0)';
  }

  // Update sidebar toggle
  const sbLow  = document.getElementById('sidebarSeasonLow');
  const sbHigh = document.getElementById('sidebarSeasonHigh');
  const sbSlider = document.getElementById('sidebarSeasonSlider');
  const sbToggle = document.getElementById('sidebarSeasonToggle');
  if (sbLow && sbHigh) {
    sbLow.classList.toggle('active', !isHigh);
    sbHigh.classList.toggle('active', isHigh);
    if (sbToggle) sbToggle.classList.toggle('season-high', isHigh);
    if (sbSlider) sbSlider.style.transform = isHigh ? 'translateX(100%)' : 'translateX(0)';
  }
}

function setSeasonMode(mode) {
  state.seasonMode = mode;
  localStorage.setItem(SEASON_STORAGE_KEY, mode);
  updateSeasonUI();
  renderDashboard();
  if (state.currentView === 'inventory') renderInventory();
  const label = mode === 'high' ? '🏖️ Temporada Alta activada' : '📉 Temporada Baja activada';
  showToast(label, mode === 'high' ? 'info' : 'success');
}

function loadSeasonMode() {
  const saved = localStorage.getItem(SEASON_STORAGE_KEY);
  if (saved === 'high' || saved === 'low') state.seasonMode = saved;
}

// ─── PRODUCT MODAL ────────────────────────────────────────────
function openProductModal(id) {
  state.editId = id || null;
  const modal  = document.getElementById('productModal');
  const title  = document.getElementById('modalTitle');
  const sub    = document.getElementById('modalSubtitle');
  const saveBtn = document.getElementById('saveProductBtn');

  clearFormErrors();

  if (id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    title.textContent = 'Editar producto';
    sub.textContent   = 'Actualiza la información del producto';
    saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
      </svg> Actualizar producto`;
    document.getElementById('editId').value       = p.id;
    document.getElementById('fName').value        = p.name;
    document.getElementById('fCategory').value    = p.category;
    document.getElementById('fUnit').value        = p.unit;
    document.getElementById('fCurrent').value     = p.currentStock;
    document.getElementById('fMin').value         = p.minStock;
    document.getElementById('fMax').value         = p.maxStock;
    document.getElementById('fCost').value        = p.costPrice || '';
    document.getElementById('fPrice').value       = p.price || '';
    document.getElementById('fNotes').value       = p.notes || '';

    // Show ABC classification (read-only)
    const abcGroup = document.getElementById('abcClassGroup');
    const abcBadge = document.getElementById('abcReadonlyBadge');
    if (abcGroup && abcBadge) {
      const abc = state.abcMap.get(p.id) || 'C';
      const abcColors = { A: '#fbbf24', B: '#3b82f6', C: '#5c6b85' };
      const abcNames  = { A: 'Clase A — Alta inversión', B: 'Clase B — Inversión media', C: 'Clase C — Baja inversión' };
      abcBadge.textContent = abc;
      abcBadge.style.color = abcColors[abc];
      abcBadge.style.borderColor = abcColors[abc];
      abcGroup.style.display = '';
    }
  } else {
    title.textContent = 'Añadir producto';
    sub.textContent   = 'Completa todos los campos requeridos';
    saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
      </svg> Guardar producto`;
    document.getElementById('productForm').reset();
    document.getElementById('editId').value = '';

    // Hide ABC classification for new products
    const abcGroup = document.getElementById('abcClassGroup');
    if (abcGroup) abcGroup.style.display = 'none';
  }

  modal.classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 200);
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
  state.editId = null;
}

function clearFormErrors() {
  document.querySelectorAll('.form-group.has-error').forEach(g => g.classList.remove('has-error'));
  document.querySelectorAll('.form-input.error').forEach(i => i.classList.remove('error'));
}

function validateForm() {
  let ok = true;
  const required = [
    { id: 'fName',     check: v => v.trim() !== '' },
    { id: 'fCategory', check: v => v !== '' },
    { id: 'fUnit',     check: v => v !== '' },
    { id: 'fCurrent',  check: v => v !== '' && Number(v) >= 0 },
    { id: 'fMin',      check: v => v !== '' && Number(v) >= 0 },
    { id: 'fMax',      check: v => {
      const min = parseFloat(document.getElementById('fMin').value) || 0;
      return v !== '' && Number(v) > 0 && Number(v) > min;
    }},
  ];
  required.forEach(({ id, check }) => {
    const el = document.getElementById(id);
    const group = el.closest('.form-group');
    if (!check(el.value)) {
      ok = false;
      group.classList.add('has-error');
      el.classList.add('error');
    } else {
      group.classList.remove('has-error');
      el.classList.remove('error');
    }
  });
  return ok;
}

async function saveProduct() {
  if (!validateForm()) {
    showToast('Completa todos los campos requeridos correctamente.', 'error');
    return;
  }

  const id       = document.getElementById('editId').value;
  const name     = document.getElementById('fName').value.trim();
  const category = document.getElementById('fCategory').value;
  const unit     = document.getElementById('fUnit').value;
  const current  = parseFloat(document.getElementById('fCurrent').value);
  const min      = parseFloat(document.getElementById('fMin').value);
  const max      = parseFloat(document.getElementById('fMax').value);
  const cost     = parseFloat(document.getElementById('fCost').value) || 0;
  const price    = parseFloat(document.getElementById('fPrice').value) || 0;
  const notes    = document.getElementById('fNotes').value.trim();

  const productData = {
    name,
    category,
    unit,
    currentStock: current,
    minStock: min,
    maxStock: max,
    costPrice: cost,
    price,
    notes,
    userId: state.currentUser.id,
    updatedAt: new Date().toISOString()
  };

  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;

  try {
    if (id) {
      // Editar en Supabase
      const { error } = await _supabase
        .from('products')
        .update(productData)
        .eq('id', id);

      if (error) throw error;
      showToast('Producto actualizado en la nube.', 'success');
    } else {
      // Insertar en Supabase
      const { error } = await _supabase
        .from('products')
        .insert([productData]);

      if (error) throw error;
      showToast('Producto guardado en la nube.', 'success');
    }

    closeProductModal();
    await loadProducts();

  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// ─── CONFIRM DELETE ───────────────────────────────────────────
function openConfirm(id) {
  state.deleteId = id;
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('confirmMsg').textContent = `¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`;
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
  state.deleteId = null;
}

async function deleteProduct() {
  if (!state.deleteId) return;
  const p = state.products.find(x => x.id === state.deleteId);

  try {
    const { error } = await _supabase
      .from('products')
      .delete()
      .eq('id', state.deleteId);

    if (error) throw error;

    showToast(`"${p?.name}" eliminado del inventario remoto.`, 'success');
    closeConfirm();
    await loadProducts();

  } catch (err) {
    showToast('Error al eliminar del servidor: ' + err.message, 'error');
  }
}

// ─── ABOUT MODAL ──────────────────────────────────────────────
function openAbout() {
  document.getElementById('aboutModal').classList.add('open');
}
function closeAbout() {
  document.getElementById('aboutModal').classList.remove('open');
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
  }[type] || 'ℹ';

  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0;">${icon}</span>${msg}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3200);
}

// ─── PWA INSTALL ──────────────────────────────────────────────
let deferredInstall = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const banner = document.getElementById('installBanner');
  if (banner && !localStorage.getItem('stab_install_dismissed')) {
    setTimeout(() => banner.classList.add('visible'), 2000);
  }
});

// ─── EVENT LISTENERS ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Escuchar cambios de sesión de Supabase
  _supabase.auth.onAuthStateChange((event, session) => {
    state.currentUser = session?.user || null;
    updateAuthDOM();
    if (state.currentUser) {
      loadProducts();
    } else {
      state.products = [];
    }
  });

  // ─ Controladores de Login/Registro UI ─
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginTitleText = document.getElementById('loginTitleText');
  const loginSubtitleText = document.getElementById('loginSubtitleText');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');

  tabLogin.addEventListener('click', () => {
    state.authMode = 'login';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginTitleText.textContent = 'Iniciar Sesión';
    loginSubtitleText.textContent = 'Gestión de Inventario — Cleer David C.A.';
    loginSubmitBtn.innerHTML = '<span>Ingresar al sistema</span> ➔';
  });

  tabRegister.addEventListener('click', () => {
    state.authMode = 'register';
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    loginTitleText.textContent = 'Registrarse';
    loginSubtitleText.textContent = 'Crea una cuenta para tu distribuidora';
    loginSubmitBtn.innerHTML = '<span>Crear cuenta nueva</span> ➔';
  });

  document.getElementById('loginForm').addEventListener('submit', handleAuthSubmit);

  // ─ Logout Event Listeners ─
  document.getElementById('sidebarLogoutBtn').addEventListener('click', handleLogout);
  document.getElementById('topbarLogoutBtn').addEventListener('click', handleLogout);

  loadSeasonMode();
  updateSeasonUI();

  // ─ Season toggle (dashboard) ─
  const seasonBtnLow  = document.getElementById('seasonBtnLow');
  const seasonBtnHigh = document.getElementById('seasonBtnHigh');
  if (seasonBtnLow)  seasonBtnLow.addEventListener('click',  () => setSeasonMode('low'));
  if (seasonBtnHigh) seasonBtnHigh.addEventListener('click', () => setSeasonMode('high'));

  // ─ Season toggle (sidebar — global) ─
  const sbSeasonLow  = document.getElementById('sidebarSeasonLow');
  const sbSeasonHigh = document.getElementById('sidebarSeasonHigh');
  if (sbSeasonLow)  sbSeasonLow.addEventListener('click',  () => setSeasonMode('low'));
  if (sbSeasonHigh) sbSeasonHigh.addEventListener('click', () => setSeasonMode('high'));

  // ─ Navigation ─
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const view = el.dataset.view;
      if (view) switchView(view);
    });
  });

  // ─ Add buttons ─
  ['dashAddBtn', 'invAddBtn', 'fab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => openProductModal());
  });

  // ─ Product modal ─
  document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
  document.getElementById('cancelProductModal').addEventListener('click', closeProductModal);
  document.getElementById('saveProductBtn').addEventListener('click', saveProduct);
  document.getElementById('productModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProductModal();
  });

  // Enter key in form
  document.getElementById('productForm').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveProduct();
    }
  });

  // ─ Confirm modal ─
  document.getElementById('cancelConfirm').addEventListener('click', closeConfirm);
  document.getElementById('confirmDeleteBtn').addEventListener('click', deleteProduct);
  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConfirm();
  });

  // ─ About modal ─
  ['sidebarAboutBtn', 'topbarAboutBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', openAbout);
  });
  document.getElementById('closeAboutModal').addEventListener('click', closeAbout);
  document.getElementById('closeAboutBtn').addEventListener('click', closeAbout);
  document.getElementById('aboutModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAbout();
  });

  // ─ Search ─
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.search = searchInput.value;
        renderInventory();
      }, 180);
    });
  }

  // ─ Sort ─
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      renderInventory();
    });
  }

  // ─ View all link (dashboard) ─
  const viewAllLink = document.getElementById('viewAllLink');
  if (viewAllLink) viewAllLink.addEventListener('click', () => switchView('inventory'));

  // ─ Keyboard Escape ─
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeProductModal();
      closeConfirm();
      closeAbout();
    }
  });

  // ─ Install banner ─
  const installAccept  = document.getElementById('installAccept');
  const installDismiss = document.getElementById('installDismiss');
  const installBanner  = document.getElementById('installBanner');

  if (installAccept) {
    installAccept.addEventListener('click', async () => {
      if (deferredInstall) {
        deferredInstall.prompt();
        const { outcome } = await deferredInstall.userChoice;
        if (outcome === 'accepted') showToast('¡Stab instalado correctamente!', 'success');
        deferredInstall = null;
      }
      installBanner.classList.remove('visible');
    });
  }
  if (installDismiss) {
    installDismiss.addEventListener('click', () => {
      installBanner.classList.remove('visible');
      localStorage.setItem('stab_install_dismissed', '1');
    });
  }

  console.log(`%c◈ STAB v${APP_VERSION} (Supabase Connected)`, 'color:#10d9a0;font-size:20px;font-weight:800;');
  console.log('%cGestión de Inventario — Cleer David C.A.', 'color:#6b7a9e;font-size:12px;');
});
