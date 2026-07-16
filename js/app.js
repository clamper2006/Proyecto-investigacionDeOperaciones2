// ============================================================
//  STAB v2.1.0 — app.js
//  Gestión de Inventario — Inversiones Cleer David C.A.
//  Modelo Estacional + Clasificación ABC + Supabase Backend
// ============================================================

'use strict';

// ─── CONFIGURACIÓN DE SUPABASE ─────────────────────────────────
const supabaseUrl = 'https://pwmewoorpcevnclqyuvj.supabase.co';
// !!! CAMBIA ESTE VALOR CON TU CLAVE ANON DE LA PESTAÑA API SETTINGS !!!
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3bWV3b29ycGNldm5jbHF5dXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODc2NzIsImV4cCI6MjA5OTc2MzY3Mn0.UEhWpiDuucFARpMQQETpsiOENaoyVO5ovwav_9FAHZ4'; 
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ─── CONSTANTES DEL SISTEMA ────────────────────────────────────
const STORAGE_KEY = 'stab_products_v2';
const APP_VERSION = '2.1.0';

const SEASON_HIGH_FACTOR   = 1.5;   // +50% factor multiplicador demanda
const SEASON_CRITICAL_CATS = ['Medicina', 'Alimentos', 'Bebidas'];
const SEASON_STORAGE_KEY   = 'stab_season_mode';

const CATEGORIES = ['Todos','Medicina','Alimentos','Bebidas','Higiene','Limpieza','Ferretería','Papelería','Otros'];

// ─── ESTADO GLOBAL DE LA APLICACIÓN ───────────────────────────
let state = {
  products: [],
  currentView: 'dashboard',
  editingId: null,
  deletingId: null,
  filterCategory: 'Todos',
  filterStock: 'Todos',
  searchQuery: '',
  sort: 'name-asc',
  seasonMode: false,
  user: null
};

let deferredInstall = null;

// ─── MAPEADOR DE BASE DE DATOS (CamelCase <=> SnakeCase) ──────
function mapToDB(p) {
  return {
    id: p.id || undefined, // Dejar que Supabase lo genere en inserts
    name: p.name,
    category: p.category,
    unit: p.unit,
    current_stock: Number(p.currentStock),
    min_stock: Number(p.minStock),
    max_stock: Number(p.maxStock),
    price: Number(p.price),
    cost_price: Number(p.costPrice),
    notes: p.notes || ''
  };
}

function mapFromDB(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    maxStock: Number(row.max_stock),
    price: Number(row.price),
    costPrice: Number(row.cost_price),
    notes: row.notes || '',
    createdAt: new Date(row.created_at).getTime()
  };
}

// ─── INICIALIZADOR DE LA APP (CONEXIÓN SUPABASE) ───────────────
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  setupEventListeners();
  
  // Escuchar cambios de Autenticación
  supabase.auth.onAuthStateChange((event, session) => {
    const loginScreen = document.getElementById('loginScreen');
    const appShell = document.getElementById('appShell');
    
    if (session) {
      state.user = session.user;
      loginScreen.style.display = 'none';
      appShell.style.display = 'flex';
      
      // Avatar del usuario
      const avatarChar = session.user.email ? session.user.email.charAt(0).toUpperCase() : 'U';
      document.getElementById('userAvatar').textContent = avatarChar;
      
      // Cargar productos
      loadProductsFromServer();
    } else {
      state.user = null;
      state.products = [];
      loginScreen.style.display = 'flex';
      appShell.style.display = 'none';
    }
  });

  // PWA Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registrado:', reg.scope))
        .catch(err => console.error('Fallo de registro de SW:', err));
    });
  }

  // PWA Install Prompt Handler
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    if (localStorage.getItem('stab_install_dismissed') !== '1') {
      const banner = document.getElementById('installBanner');
      if (banner) banner.classList.add('visible');
    }
  });
});

// ─── LOGIN & AUTHENTICATION FLOWS ──────────────────────────────
async function handleEmailLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const submitBtn = document.getElementById('loginSubmitBtn');
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Autenticando...';
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    showToast('Error de inicio de sesión: ' + error.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Iniciar Sesión';
  } else {
    showToast('¡Sesión iniciada con éxito!', 'success');
  }
}

async function handleGoogleLogin(e) {
  e.preventDefault();
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Retorna de forma dinámica según el servidor de producción (GitHub Pages o Local)
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  
  if (error) {
    showToast('Error de autenticación con Google: ' + error.message, 'error');
  }
}

async function handleLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('Error al cerrar sesión: ' + error.message, 'error');
  } else {
    showToast('Sesión cerrada correctamente', 'success');
  }
}

// ─── CONTROLADOR DE DATOS (READ - WRITE - DELETE) ──────────────
async function loadProductsFromServer() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    // Mapear de Postgres (Snake_Case) a JS Model (CamelCase)
    state.products = data.map(mapFromDB);
    
    // Guardar una copia local en caché para soporte offline robusto
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));
    
    renderApp();
  } catch (error) {
    console.error('Error cargando base de datos:', error);
    
    // Recuperar caché offline local de emergencia
    const cachedData = localStorage.getItem(STORAGE_KEY);
    if (cachedData) {
      state.products = JSON.parse(cachedData);
      showToast('Cargando base de datos local (Offline)', 'info');
    } else {
      state.products = [];
      showToast('Error crítico de red. No hay conexión con el servidor.', 'error');
    }
    renderApp();
  }
}

async function saveProduct(e) {
  e.preventDefault();
  
  const name = document.getElementById('prodName').value.trim();
  const category = document.getElementById('prodCategory').value;
  const unit = document.getElementById('prodUnit').value.trim();
  const currentStock = parseInt(document.getElementById('prodStock').value);
  const minStock = parseInt(document.getElementById('prodMinStock').value);
  const maxStock = parseInt(document.getElementById('prodMaxStock').value);
  const price = parseFloat(document.getElementById('prodPrice').value);
  const costPrice = parseFloat(document.getElementById('prodCostPrice').value);
  const notes = document.getElementById('prodNotes').value.trim();
  
  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  const productObj = {
    name,
    category,
    unit,
    currentStock,
    minStock,
    maxStock,
    price,
    costPrice,
    notes
  };

  if (state.editingId) {
    productObj.id = state.editingId;
  }

  const dbRow = mapToDB(productObj);
  dbRow.user_id = state.user.id; // Vincular al UID del usuario logueado

  try {
    const { error } = await supabase
      .from('products')
      .upsert(dbRow);

    if (error) throw error;

    showToast(state.editingId ? 'Producto actualizado en el servidor' : 'Producto creado en el servidor', 'success');
    closeProductModal();
    await loadProductsFromServer();
  } catch (err) {
    console.error('Fallo al guardar:', err);
    showToast('No se pudo guardar. Intente de nuevo.', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar Producto';
  }
}

async function executeDelete() {
  if (!state.deletingId) return;
  
  const deleteBtn = document.getElementById('confirmDeleteBtn');
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Eliminando...';
  
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', state.deletingId);
      
    if (error) throw error;
    
    showToast('Producto removido de forma definitiva', 'success');
    closeConfirm();
    await loadProductsFromServer();
  } catch (err) {
    console.error('Fallo al borrar:', err);
    showToast('No se pudo borrar del servidor.', 'error');
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Eliminar';
  }
}

// ─── LÓGICA DE UI Y RENDERING DEL NEGOCIO ───────────────────────
function initUI() {
  // Rellenar selectores de categorías dinámicamente
  const catFilter = document.getElementById('categoryFilter');
  const prodCatSelect = document.getElementById('prodCategory');
  
  if (catFilter) {
    catFilter.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c === 'Todos' ? 'Todas las Categorías' : c}</option>`).join('');
  }
  if (prodCatSelect) {
    prodCatSelect.innerHTML = CATEGORIES.filter(c => c !== 'Todos').map(c => `<option value="${c}">${c}</option>`).join('');
  }

  // Cargar preferencia estacional local
  state.seasonMode = localStorage.getItem(SEASON_STORAGE_KEY) === '1';
  updateSeasonUI();
}

function updateSeasonUI() {
  const btn = document.getElementById('seasonToggleBtn');
  if (btn) {
    if (state.seasonMode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
}

function renderApp() {
  // Título dinámico por vistas
  const titles = {
    dashboard: { title: 'Panel de Control', sub: 'Indicadores de salud de stock de Inversiones Cleer David C.A.' },
    inventory: { title: 'Gestor de Inventario', sub: 'Listado completo, filtrado y niveles de seguridad' },
    abc: { title: 'Análisis de Clasificación ABC', sub: 'Categorización de productos por impacto financiero' }
  };
  
  document.getElementById('viewTitle').textContent = titles[state.currentView].title;
  document.getElementById('viewSubtitle').textContent = titles[state.currentView].sub;

  // Renderizar vistas individuales
  if (state.currentView === 'dashboard') renderDashboard();
  if (state.currentView === 'inventory') renderInventory();
  if (state.currentView === 'abc') renderABC();
}

function renderDashboard() {
  const products = state.products;
  const total = products.length;
  
  let normal = 0;
  let low = 0;
  let empty = 0;
  let valTotal = 0;
  let costoTotal = 0;
  let alertsHtml = '';
  let countAlerts = 0;

  products.forEach(p => {
    const isCriticalCat = SEASON_CRITICAL_CATS.includes(p.category);
    // Aplicar lógica estacional si el modo está encendido
    const multiplier = (state.seasonMode && isCriticalCat) ? SEASON_HIGH_FACTOR : 1.0;
    const computedMin = Math.round(p.minStock * multiplier);

    let status = 'normal';
    if (p.currentStock === 0) {
      status = 'empty';
      empty++;
    } else if (p.currentStock <= computedMin) {
      status = 'low';
      low++;
    } else {
      normal++;
    }

    valTotal += p.currentStock * p.price;
    costoTotal += p.currentStock * p.costPrice;

    // Alertas críticas en tabla
    if (status === 'empty' || status === 'low') {
      countAlerts++;
      const badgeClass = status === 'empty' ? 'badge-danger' : 'badge-warn';
      const label = status === 'empty' ? 'Sin Stock' : 'Stock Bajo';
      alertsHtml += `
        <tr>
          <td><strong>${escapeHTML(p.name)}</strong></td>
          <td>${p.category}</td>
          <td><span class="${status === 'empty' ? 'text-danger' : 'text-warn'}">${p.currentStock} ${escapeHTML(p.unit)}</span></td>
          <td><span class="badge ${badgeClass}">${label}</span></td>
        </tr>
      `;
    }
  });

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiNormal').textContent = normal;
  document.getElementById('kpiLow').textContent = low;
  document.getElementById('kpiEmpty').textContent = empty;
  
  document.getElementById('alertCount').textContent = countAlerts;
  document.getElementById('criticalAlertsTable').innerHTML = alertsHtml || `<tr><td colspan="4" style="text-align:center; color: var(--text-3)">✓ No hay alertas críticas de stock</td></tr>`;
  
  document.getElementById('totalInventoryValue').textContent = formatCurrency(valTotal);
  document.getElementById('totalCostValue').textContent = formatCurrency(costoTotal);
  
  const totalMargin = valTotal - costoTotal;
  const marginPct = valTotal > 0 ? Math.round((totalMargin / valTotal) * 100) : 0;
  document.getElementById('averageMargin').textContent = `${marginPct}%`;
}

function renderInventory() {
  const tbody = document.getElementById('inventoryTableBody');
  let products = [...state.products];

  // 1. Filtrar Búsqueda
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(q));
  }

  // 2. Filtrar Categoría
  if (state.filterCategory !== 'Todos') {
    products = products.filter(p => p.category === state.filterCategory);
  }

  // 3. Filtrar Niveles de Stock (Integrando Modo Estacional)
  if (state.filterStock !== 'Todos') {
    products = products.filter(p => {
      const isCriticalCat = SEASON_CRITICAL_CATS.includes(p.category);
      const multiplier = (state.seasonMode && isCriticalCat) ? SEASON_HIGH_FACTOR : 1.0;
      const computedMin = Math.round(p.minStock * multiplier);

      if (state.filterStock === 'Sin Stock') return p.currentStock === 0;
      if (state.filterStock === 'Bajo') return p.currentStock > 0 && p.currentStock <= computedMin;
      if (state.filterStock === 'Normal') return p.currentStock > computedMin;
      return true;
    });
  }

  // 4. Clasificar ordenamiento
  products.sort((a, b) => {
    if (state.sort === 'name-asc') return a.name.localeCompare(b.name);
    if (state.sort === 'name-desc') return b.name.localeCompare(a.name);
    if (state.sort === 'stock-asc') return a.currentStock - b.currentStock;
    if (state.sort === 'stock-desc') return b.currentStock - a.currentStock;
    if (state.sort === 'price-desc') return b.price - a.price;
    return 0;
  });

  tbody.innerHTML = products.map(p => {
    const isCriticalCat = SEASON_CRITICAL_CATS.includes(p.category);
    const multiplier = (state.seasonMode && isCriticalCat) ? SEASON_HIGH_FACTOR : 1.0;
    const computedMin = Math.round(p.minStock * multiplier);
    
    let stockClass = '';
    let rowBadge = '';

    if (p.currentStock === 0) {
      stockClass = 'text-danger';
      rowBadge = '<span class="badge badge-danger" style="margin-left:8px;">Sin Stock</span>';
    } else if (p.currentStock <= computedMin) {
      stockClass = 'text-warn';
      rowBadge = '<span class="badge badge-warn" style="margin-left:8px;">Bajo</span>';
    }

    return `
      <tr>
        <td><strong>${escapeHTML(p.name)}</strong> ${rowBadge}</td>
        <td>${p.category}</td>
        <td><span class="${stockClass}" style="font-weight:700;">${p.currentStock} ${escapeHTML(p.unit)}</span></td>
        <td>${computedMin} / ${p.maxStock}</td>
        <td>${formatCurrency(p.price)}</td>
        <td>${formatCurrency(p.costPrice)}</td>
        <td>
          <button class="btn btn-ghost" onclick="openProductModal('${p.id}')" style="padding:4px 8px; font-size:12px;">Editar</button>
          <button class="btn btn-ghost" onclick="openConfirmDelete('${p.id}')" style="padding:4px 8px; font-size:12px; color:var(--danger)">Borrar</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="7" style="text-align:center; color: var(--text-3)">Ningún producto coincide con los filtros</td></tr>`;
}

function renderABC() {
  const tbody = document.getElementById('abcTableBody');
  let products = [...state.products];

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-3)">Agregue productos para procesar el análisis ABC</td></tr>`;
    return;
  }

  // Calcular valor de inversión por producto (Stock * Costo)
  let itemsVal = products.map(p => ({
    ...p,
    investment: p.currentStock * p.costPrice
  }));

  // Ordenar inversión descendente
  itemsVal.sort((a, b) => b.investment - a.investment);

  const totalInv = itemsVal.reduce((acc, p) => acc + p.investment, 0);
  
  let valA = 0;
  let valB = 0;
  let valC = 0;
  let runningSum = 0;

  const rows = itemsVal.map((p, idx) => {
    runningSum += p.investment;
    const share = totalInv > 0 ? (p.investment / totalInv) * 100 : 0;
    const cumulativePct = totalInv > 0 ? (runningSum / totalInv) * 100 : 0;
    
    let classification = 'C';
    let badgeClass = 'class-c';

    // Límites teóricos ABC: A (hasta 70%), B (70% a 90%), C (90% a 100%)
    if (cumulativePct <= 70.01) {
      classification = 'A';
      badgeClass = 'class-a';
      valA += p.investment;
    } else if (cumulativePct <= 90.01) {
      classification = 'B';
      badgeClass = 'class-b';
      valB += p.investment;
    } else {
      classification = 'C';
      badgeClass = 'class-c';
      valC += p.investment;
    }

    return `
      <tr>
        <td><span class="abc-class-badge ${badgeClass}">Clase ${classification}</span></td>
        <td><strong>${escapeHTML(p.name)}</strong></td>
        <td>${p.currentStock} ${escapeHTML(p.unit)}</td>
        <td>${formatCurrency(p.costPrice)}</td>
        <td>${formatCurrency(p.investment)}</td>
        <td>${share.toFixed(1)}%</td>
        <td>${cumulativePct.toFixed(1)}%</td>
      </tr>
    `;
  });

  document.getElementById('abcTotalA').textContent = formatCurrency(valA);
  document.getElementById('abcTotalB').textContent = formatCurrency(valB);
  document.getElementById('abcTotalC').textContent = formatCurrency(valC);
  
  tbody.innerHTML = rows.join('');
}

// ─── EVENT LISTENERS Y CONFIGURACIÓN GENERAL ───────────────────
function setupEventListeners() {
  // Formularios de inicio de sesión
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleEmailLogin);
  
  const googleBtn = document.getElementById('btn-google-login');
  if (googleBtn) googleBtn.addEventListener('click', handleGoogleLogin);

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);

  // Navegación Sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      state.currentView = item.getAttribute('data-view');
      
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`${state.currentView}View`).classList.add('active');
      
      renderApp();
    });
  });

  // Filtros de inventario
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value.trim();
      renderInventory();
    });
  }

  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      state.filterCategory = categoryFilter.value;
      renderInventory();
    });
  }

  const stockFilter = document.getElementById('stockFilter');
  if (stockFilter) {
    stockFilter.addEventListener('change', () => {
      state.filterStock = stockFilter.value;
      renderInventory();
    });
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      renderInventory();
    });
  }

  // Alternar estacionalidad
  const seasonToggleBtn = document.getElementById('seasonToggleBtn');
  if (seasonToggleBtn) {
    seasonToggleBtn.addEventListener('click', () => {
      state.seasonMode = !state.seasonMode;
      localStorage.setItem(SEASON_STORAGE_KEY, state.seasonMode ? '1' : '0');
      updateSeasonUI();
      renderApp();
      showToast(state.seasonMode ? 'Modo estacional activo (+50% demanda)' : 'Modo estacional desactivado', 'info');
    });
  }

  // Gestión de Modals
  const openAddBtn = document.getElementById('openAddProductBtn');
  if (openAddBtn) openAddBtn.addEventListener('click', () => openProductModal());
  
  const closeProductBtn = document.getElementById('closeProductModalBtn');
  if (closeProductBtn) closeProductBtn.addEventListener('click', closeProductModal);
  
  const cancelProductBtn = document.getElementById('cancelProductBtn');
  if (cancelProductBtn) cancelProductBtn.addEventListener('click', closeProductModal);

  const productForm = document.getElementById('productForm');
  if (productForm) productForm.addEventListener('submit', saveProduct);

  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeConfirm);
  
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', executeDelete);

  // Acerca de modal
  const openAboutBtn = document.getElementById('openAboutBtn');
  if (openAboutBtn) openAboutBtn.addEventListener('click', openAbout);
  
  const closeAboutModalBtn = document.getElementById('closeAboutModalBtn');
  if (closeAboutModalBtn) closeAboutModalBtn.addEventListener('click', closeAbout);
  
  const closeAboutBtn = document.getElementById('closeAboutBtn');
  if (closeAboutBtn) closeAboutBtn.addEventListener('click', closeAbout);

  // Atajo de teclas (Escape para cerrar modales)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeProductModal();
      closeConfirm();
      closeAbout();
    }
  });

  // PWA Botones banner de instalación
  const installAccept = document.getElementById('installAccept');
  const installDismiss = document.getElementById('installDismiss');
  
  if (installAccept) {
    installAccept.addEventListener('click', async () => {
      if (deferredInstall) {
        deferredInstall.prompt();
        const { outcome } = await deferredInstall.userChoice;
        if (outcome === 'accepted') showToast('¡Stab instalado en su dispositivo!', 'success');
        deferredInstall = null;
      }
      document.getElementById('installBanner').classList.remove('visible');
    });
  }
  if (installDismiss) {
    installDismiss.addEventListener('click', () => {
      document.getElementById('installBanner').classList.remove('visible');
      localStorage.setItem('stab_install_dismissed', '1');
    });
  }
}

// ─── MODAL CONTROLLERS ─────────────────────────────────────────
window.openProductModal = function(id = null) {
  state.editingId = id;
  const modal = document.getElementById('productModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('productForm');
  
  if (id) {
    title.textContent = 'Editar Producto';
    const p = state.products.find(prod => prod.id === id);
    if (p) {
      document.getElementById('prodName').value = p.name;
      document.getElementById('prodCategory').value = p.category;
      document.getElementById('prodUnit').value = p.unit;
      document.getElementById('prodStock').value = p.currentStock;
      document.getElementById('prodMinStock').value = p.minStock;
      document.getElementById('prodMaxStock').value = p.maxStock;
      document.getElementById('prodPrice').value = p.price;
      document.getElementById('prodCostPrice').value = p.costPrice;
      document.getElementById('prodNotes').value = p.notes;
    }
  } else {
    title.textContent = 'Añadir Producto';
    form.reset();
  }
  modal.style.display = 'flex';
};

window.closeProductModal = function() {
  document.getElementById('productModal').style.display = 'none';
  state.editingId = null;
};

window.openConfirmDelete = function(id) {
  state.deletingId = id;
  document.getElementById('confirmModal').style.display = 'flex';
};

window.closeConfirm = function() {
  document.getElementById('confirmModal').style.display = 'none';
  state.deletingId = null;
};

function openAbout() {
  document.getElementById('aboutModal').style.display = 'flex';
}

function closeAbout() {
  document.getElementById('aboutModal').style.display = 'none';
}

// ─── TOASTS Y UTILERÍAS DE FRONTEND ────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '🚨';
  if (type === 'warn') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastIn 0.2s reverse ease forwards';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
