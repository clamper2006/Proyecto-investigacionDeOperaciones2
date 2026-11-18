/* =========================================
   STAB v2.2.0 — Core Logic & Integration
   Inversiones Cleer David C.A. — Gestión de Inventario
   ========================================= */

// ---- CONFIGURACIÓN DE SUPABASE ----
const SUPABASE_URL = "https://giimknuufvrlgebfsbyz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpaW1rbnV1ZnZybGdlYmZzYnl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5Mzc4MzcsImV4cCI6MjExMDUxMzgzN30.wFowxudE2Ix204cjperwyTFTuxzP2xbdCz6Q3NZRU24";

// ---- INICIALIZACIÓN DE SUPABASE ----
try {
  if (typeof window.supabase !== 'undefined') {
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("El SDK de Supabase no se cargó correctamente desde el CDN.");
  }
} catch (err) {
  console.error("Error crítico de inicialización:", err);
}

// ---- ESTADO GLOBAL ----
let productsState = [];
let isSeasonalActive = false;
let currentEditingProductId = null;
let productToDeleteId = null;
let currentUserId = null;

const CATEGORIES = ["Medicamentos", "Insumos Médicos", "Higiene", "Equipos", "Otros"];

// ---- CARGA INICIAL ----
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  registerServiceWorker();
});

function initApp() {
  populateSelectOptions();
  setupAuthListeners();
  setupNavigation();
  setupFormHandlers();
  setupFilterHandlers();
  setupSeasonalToggle();
  setupInstallBanner();
  setupUserMenu();
  setupTutorial();
}

// Rellenar dinámicamente campos de categoría
function populateSelectOptions() {
  const catFilter = document.getElementById("categoryFilter");
  const prodCategory = document.getElementById("prodCategory");

  CATEGORIES.forEach(cat => {
    const opt1 = new Option(cat, cat);
    const opt2 = new Option(cat, cat);
    catFilter.add(opt1);
    prodCategory.add(opt2);
  });
}

// ---- CONTROL DE AUTENTICACIÓN ----
function setupAuthListeners() {
  if (!window.supabase) {
    showToast("Error de conexión con la base de datos.", "error");
    return;
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    handleAuthState(session);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    handleAuthState(session);
  });

  // Login Email/Contraseña
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const submitBtn = document.getElementById("loginSubmitBtn");

    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando...";

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showToast(`Error de acceso: ${error.message}`, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Iniciar Sesión";
    } else {
      showToast("Sesión iniciada correctamente", "success");
    }
  });

  // Login con Google
  document.getElementById("btn-google-login").addEventListener("click", async (e) => {
    e.preventDefault();
    showToast("Redirigiendo a Google...", "info");

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'BYPASS_AUTH_CACHE' });
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });

    if (error) {
      showToast(`Error con Google: ${error.message}`, "error");
    }
  });

  // Cierre de Sesión (sidebar desktop)
  document.getElementById("btnLogout").addEventListener("click", handleLogout);
  // Cierre de Sesión (menú desplegable móvil)
  document.getElementById("btnLogoutMenu").addEventListener("click", handleLogout);
}

async function handleLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast("Error al cerrar sesión", "error");
  } else {
    showToast("Sesión cerrada", "info");
    currentUserId = null;
    productsState = [];
  }
}

// Actualizar interfaz según estado de sesión
function handleAuthState(session) {
  const loginScreen = document.getElementById("loginScreen");
  const appShell = document.getElementById("appShell");

  if (session) {
    loginScreen.style.display = "none";
    appShell.style.display = "flex";

    currentUserId = session.user.id;
    const email = session.user.email;
    const initial = email.charAt(0).toUpperCase();

    // Avatar desktop
    document.getElementById("userAvatar").textContent = initial;
    document.getElementById("userAvatar").title = email;

    // Avatar y email en menú móvil
    const mobileAvatar = document.getElementById("userAvatarMobile");
    if (mobileAvatar) mobileAvatar.textContent = initial;
    const panelAvatar = document.getElementById("userAvatarMenuPanel");
    if (panelAvatar) panelAvatar.textContent = initial;
    document.getElementById("userEmailDisplay").textContent = email;
    loadInventoryData();
    checkTutorialWelcome(currentUserId);
  } else {
    loginScreen.style.display = "flex";
    appShell.style.display = "none";
  }
}

// ---- CARGA DE DATOS DESDE SUPABASE (filtrado por user_id via RLS) ----
async function loadInventoryData() {
  if (!window.supabase || !currentUserId) return;

  const { data, error } = await window.supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    showToast(`Error leyendo datos: ${error.message}`, "error");
    return;
  }

  productsState = data || [];
  renderDashboard();
  renderInventoryTable();
  renderABCTable();
}

// ---- MODELO ESTACIONAL ----
function setupSeasonalToggle() {
  const seasonBtn = document.getElementById("seasonToggleBtn");
  seasonBtn.addEventListener("click", () => {
    isSeasonalActive = !isSeasonalActive;
    if (isSeasonalActive) {
      seasonBtn.classList.add("active");
      const label = seasonBtn.querySelector(".season-label");
      if (label) label.textContent = "Modo Estacional Activo";
      showToast("Modo Estacional Activo (+40% en umbrales de seguridad)", "info");
    } else {
      seasonBtn.classList.remove("active");
      const label = seasonBtn.querySelector(".season-label");
      if (label) label.textContent = "Activar Modo Estacional";
      showToast("Modo Estacional Desactivado", "info");
    }
    renderDashboard();
    renderInventoryTable();
  });
}

function getSafetyLimits(product) {
  let min = Number(product.min_stock);
  let max = Number(product.max_stock);
  if (isSeasonalActive) {
    min = Math.ceil(min * 1.4);
    max = Math.ceil(max * 1.4);
  }
  return { min, max };
}

function getStockAlertState(stock, limits) {
  if (stock <= 0) return { label: "Sin Stock", class: "badge-danger", code: "empty" };
  if (stock < limits.min) return { label: "Stock Bajo", class: "badge-warn", code: "low" };
  return { label: "Normal", class: "badge-success", code: "normal" };
}

// ---- RENDERS ----

// 1. DASHBOARD
function renderDashboard() {
  let totalProducts = productsState.length;
  let normalCount = 0, lowCount = 0, emptyCount = 0;
  let totalInventoryValue = 0, totalCostValue = 0;
  let totalMarginPctSum = 0, productsWithMargin = 0;

  const alertsTableBody = document.getElementById("criticalAlertsTable");
  alertsTableBody.innerHTML = "";

  productsState.forEach(prod => {
    const stock = Number(prod.stock);
    const cost = Number(prod.cost_price);
    const price = Number(prod.price);
    const limits = getSafetyLimits(prod);
    const alertState = getStockAlertState(stock, limits);

    if (alertState.code === "normal") normalCount++;
    else if (alertState.code === "low") { lowCount++; addAlertRow(alertsTableBody, prod, stock, alertState); }
    else if (alertState.code === "empty") { emptyCount++; addAlertRow(alertsTableBody, prod, stock, alertState); }

    totalInventoryValue += stock * price;
    totalCostValue += stock * cost;

    if (cost > 0) {
      totalMarginPctSum += ((price - cost) / cost) * 100;
      productsWithMargin++;
    }
  });

  document.getElementById("kpiTotal").textContent = totalProducts;
  document.getElementById("kpiNormal").textContent = normalCount;
  document.getElementById("kpiLow").textContent = lowCount;
  document.getElementById("kpiEmpty").textContent = emptyCount;
  document.getElementById("alertCount").textContent = lowCount + emptyCount;
  document.getElementById("totalInventoryValue").textContent = formatCurrency(totalInventoryValue);
  document.getElementById("totalCostValue").textContent = formatCurrency(totalCostValue);

  const avgMargin = productsWithMargin > 0 ? (totalMarginPctSum / productsWithMargin).toFixed(1) : "0.0";
  document.getElementById("averageMargin").textContent = `${avgMargin}%`;
}

function addAlertRow(tableBody, prod, stock, alertState) {
  const row = `
    <tr>
      <td><strong>${prod.name}</strong></td>
      <td>${prod.category}</td>
      <td class="text-accent">${stock} ${prod.unit}</td>
      <td><span class="badge ${alertState.class}">${alertState.label}</span></td>
    </tr>
  `;
  tableBody.insertAdjacentHTML("beforeend", row);
}

// 2. INVENTARIO
function renderInventoryTable() {
  const tableBody = document.getElementById("inventoryTableBody");
  const searchQuery = document.getElementById("searchInput").value.toLowerCase();
  const categoryFilter = document.getElementById("categoryFilter").value;
  const stockFilter = document.getElementById("stockFilter").value;
  const sortOption = document.getElementById("sortSelect").value;

  tableBody.innerHTML = "";

  let filtered = productsState.filter(prod => {
    const limits = getSafetyLimits(prod);
    const alertState = getStockAlertState(Number(prod.stock), limits);
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery);
    const matchesCategory = categoryFilter === "Todos" || prod.category === categoryFilter;
    let matchesStock = true;
    if (stockFilter === "Normal") matchesStock = alertState.code === "normal";
    else if (stockFilter === "Bajo") matchesStock = alertState.code === "low";
    else if (stockFilter === "Sin Stock") matchesStock = alertState.code === "empty";
    return matchesSearch && matchesCategory && matchesStock;
  });

  filtered.sort((a, b) => {
    if (sortOption === "name-asc") return a.name.localeCompare(b.name);
    if (sortOption === "name-desc") return b.name.localeCompare(a.name);
    if (sortOption === "stock-asc") return Number(a.stock) - Number(b.stock);
    if (sortOption === "stock-desc") return Number(b.stock) - Number(a.stock);
    if (sortOption === "price-desc") return Number(b.price) - Number(a.price);
    return 0;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-3);">No se encontraron productos</td></tr>`;
    return;
  }

  filtered.forEach(prod => {
    const limits = getSafetyLimits(prod);
    const alertState = getStockAlertState(Number(prod.stock), limits);
    const row = `
      <tr>
        <td><strong>${prod.name}</strong></td>
        <td>${prod.category}</td>
        <td><span class="badge ${alertState.class}">${prod.stock} ${prod.unit}</span></td>
        <td>${limits.min} / ${limits.max}</td>
        <td>${formatCurrency(prod.price)}</td>
        <td>${formatCurrency(prod.cost_price)}</td>
        <td class="actions-cell">
          <button class="btn-icon btn-icon-edit" onclick="editProduct('${prod.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-icon-delete" onclick="openDeleteConfirm('${prod.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

// 3. ANÁLISIS ABC
function renderABCTable() {
  const tableBody = document.getElementById("abcTableBody");
  tableBody.innerHTML = "";

  let abcList = productsState.map(prod => {
    const stock = Number(prod.stock);
    const cost = Number(prod.cost_price);
    const totalValue = stock * cost;
    return { ...prod, totalValue };
  });

  abcList.sort((a, b) => b.totalValue - a.totalValue);

  const grandTotalInvestment = abcList.reduce((acc, curr) => acc + curr.totalValue, 0);

  let runningTotal = 0;
  let totalA = 0, totalB = 0, totalC = 0;

  abcList.forEach(prod => {
    runningTotal += prod.totalValue;
    const sharePct = grandTotalInvestment > 0 ? (prod.totalValue / grandTotalInvestment) * 100 : 0;
    const cumPct = grandTotalInvestment > 0 ? (runningTotal / grandTotalInvestment) * 100 : 0;

    let abcClass = "C", badgeClass = "class-c";
    if (cumPct <= 70) { abcClass = "A"; badgeClass = "class-a"; totalA += prod.totalValue; }
    else if (cumPct <= 90) { abcClass = "B"; badgeClass = "class-b"; totalB += prod.totalValue; }
    else { totalC += prod.totalValue; }

    const row = `
      <tr>
        <td><span class="abc-class-badge ${badgeClass}">Clase ${abcClass}</span></td>
        <td><strong>${prod.name}</strong></td>
        <td>${prod.stock} ${prod.unit}</td>
        <td>${formatCurrency(prod.cost_price)}</td>
        <td>${formatCurrency(prod.totalValue)}</td>
        <td>${sharePct.toFixed(1)}%</td>
        <td>${cumPct.toFixed(1)}%</td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });

  document.getElementById("abcTotalA").textContent = formatCurrency(totalA);
  document.getElementById("abcTotalB").textContent = formatCurrency(totalB);
  document.getElementById("abcTotalC").textContent = formatCurrency(totalC);
}

// ---- FILTROS ----
function setupFilterHandlers() {
  document.getElementById("searchInput").addEventListener("input", renderInventoryTable);
  document.getElementById("categoryFilter").addEventListener("change", renderInventoryTable);
  document.getElementById("stockFilter").addEventListener("change", renderInventoryTable);
  document.getElementById("sortSelect").addEventListener("change", renderInventoryTable);
}

// ---- GESTIÓN DE PRODUCTO MODAL ----
function setupFormHandlers() {
  const modal = document.getElementById("productModal");
  const form = document.getElementById("productForm");

  document.getElementById("openAddProductBtn").addEventListener("click", () => {
    currentEditingProductId = null;
    form.reset();
    document.getElementById("modalTitle").textContent = "Añadir Producto";
    modal.style.display = "flex";
  });

  document.getElementById("closeProductModalBtn").addEventListener("click", () => modal.style.display = "none");
  document.getElementById("cancelProductBtn").addEventListener("click", () => modal.style.display = "none");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("saveProductBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";

    // CRÍTICO: siempre incluir user_id del usuario actual
    const payload = {
      name: document.getElementById("prodName").value.trim(),
      category: document.getElementById("prodCategory").value,
      unit: document.getElementById("prodUnit").value.trim(),
      stock: Number(document.getElementById("prodStock").value),
      min_stock: Number(document.getElementById("prodMinStock").value),
      max_stock: Number(document.getElementById("prodMaxStock").value),
      price: parseFloat(document.getElementById("prodPrice").value),
      cost_price: parseFloat(document.getElementById("prodCostPrice").value),
      notes: document.getElementById("prodNotes").value,
      user_id: currentUserId   // Vincula el producto al usuario actual
    };

    if (currentEditingProductId) {
      const { error } = await window.supabase
        .from("products")
        .update(payload)
        .eq("id", currentEditingProductId);

      if (error) showToast(`Error al actualizar: ${error.message}`, "error");
      else {
        showToast("Producto actualizado con éxito", "success");
        modal.style.display = "none";
        loadInventoryData();
      }
    } else {
      const { error } = await window.supabase
        .from("products")
        .insert([payload]);

      if (error) showToast(`Error al guardar: ${error.message}`, "error");
      else {
        showToast("Producto añadido con éxito", "success");
        modal.style.display = "none";
        loadInventoryData();
      }
    }

    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar Producto";
  });

  document.getElementById("cancelDeleteBtn").addEventListener("click", () => {
    document.getElementById("confirmModal").style.display = "none";
  });

  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    if (productToDeleteId) {
      const { error } = await window.supabase
        .from("products")
        .delete()
        .eq("id", productToDeleteId);

      if (error) showToast(`Error al eliminar: ${error.message}`, "error");
      else {
        showToast("Producto eliminado", "success");
        document.getElementById("confirmModal").style.display = "none";
        loadInventoryData();
      }
    }
  });
}

window.editProduct = function(id) {
  const prod = productsState.find(p => p.id === id);
  if (!prod) return;
  currentEditingProductId = prod.id;
  document.getElementById("modalTitle").textContent = "Editar Producto";
  document.getElementById("prodName").value = prod.name;
  document.getElementById("prodCategory").value = prod.category;
  document.getElementById("prodUnit").value = prod.unit;
  document.getElementById("prodStock").value = prod.stock;
  document.getElementById("prodMinStock").value = prod.min_stock;
  document.getElementById("prodMaxStock").value = prod.max_stock;
  document.getElementById("prodPrice").value = prod.price;
  document.getElementById("prodCostPrice").value = prod.cost_price;
  document.getElementById("prodNotes").value = prod.notes || "";
  document.getElementById("productModal").style.display = "flex";
};

window.openDeleteConfirm = function(id) {
  productToDeleteId = id;
  document.getElementById("confirmModal").style.display = "flex";
};

// ---- NAVEGACIÓN ----
function setupNavigation() {
  // Todos los elementos de navegación: sidebar (desktop) + bottom nav (móvil)
  const allNavItems = document.querySelectorAll(".nav-item, .bottom-nav-item");
  const views = document.querySelectorAll(".view");

  const titles = {
    dashboard: { title: "Dashboard Informativo", subtitle: "Resumen estadístico de Inversiones Cleer David C.A." },
    inventory: { title: "Gestión de Inventario", subtitle: "Control de stock e inspección de productos" },
    abc: { title: "Clasificación ABC", subtitle: "Optimización de stock por volumen y costo de inversión" }
  };

  function activateView(viewName) {
    // Desactivar todos los items de nav (sidebar + bottom nav)
    allNavItems.forEach(n => n.classList.remove("active"));
    views.forEach(v => v.classList.remove("active"));

    // Activar el item correspondiente en ambas navs
    document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.classList.add("active"));
    document.getElementById(`${viewName}View`).classList.add("active");
    document.getElementById("viewTitle").textContent = titles[viewName].title;
    document.getElementById("viewSubtitle").textContent = titles[viewName].subtitle;

    // En móvil, hacer scroll al top de las vistas
    const wrapper = document.querySelector(".views-wrapper");
    if (wrapper) wrapper.scrollTop = 0;
  }

  allNavItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      activateView(item.getAttribute("data-view"));
    });
  });

  activateView("dashboard");

  // Modal "Acerca De"
  const aboutModal = document.getElementById("aboutModal");
  document.getElementById("openAboutBtn").addEventListener("click", () => aboutModal.style.display = "flex");
  document.getElementById("closeAboutModalBtn").addEventListener("click", () => aboutModal.style.display = "none");
  document.getElementById("closeAboutBtn").addEventListener("click", () => aboutModal.style.display = "none");

  // Tutorial Desktop
  const tutorialBtnDesktop = document.getElementById("openTutorialBtnDesktop");
  if (tutorialBtnDesktop) {
    tutorialBtnDesktop.addEventListener("click", () => openTutorial());
  }
}

// ---- MENÚ DE USUARIO (MÓVIL) ----
function setupUserMenu() {
  const trigger = document.getElementById("userAvatarMobile");
  const userDropdown = document.getElementById("userDropdown");

  if (!trigger || !userDropdown) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    userDropdown.classList.remove("open");
  });

  userDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // "Tutorial" desde el menú móvil
  const openTutorialMobile = document.getElementById("openTutorialBtnMobile");
  if (openTutorialMobile) {
    openTutorialMobile.addEventListener("click", () => {
      userDropdown.classList.remove("open");
      openTutorial();
    });
  }

  // "Acerca de" desde el menú desplegable móvil
  document.getElementById("openAboutBtnMobile").addEventListener("click", () => {
    userDropdown.classList.remove("open");
    document.getElementById("aboutModal").style.display = "flex";
  });
}

// ---- TOASTS ----
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "✓";
  if (type === "error") icon = "✕";
  if (type === "info") icon = "ℹ";

  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---- FORMATEO ----
function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

// ---- SERVICE WORKER & PWA ----
let deferredPrompt = null;

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("Service Worker Stab v2.2.0 registrado"))
      .catch(err => console.error("Error Service Worker:", err));
  }
}

function setupInstallBanner() {
  const banner = document.getElementById("installBanner");
  const dismissBtn = document.getElementById("installDismiss");
  const acceptBtn = document.getElementById("installAccept");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add("visible");
  });

  dismissBtn.addEventListener("click", () => banner.classList.remove("visible"));

  acceptBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Instalación: ${outcome}`);
      deferredPrompt = null;
      banner.classList.remove("visible");
    }
  });
}


// ---- TUTORIAL DE BIENVENIDA ----
let currentTutorialStep = 0;
const TOTAL_TUTORIAL_STEPS = 5;

function setupTutorial() {
  const modal = document.getElementById("tutorialModal");
  if (!modal) return;

  const nextBtn = document.getElementById("tutorialNextBtn");
  const prevBtn = document.getElementById("tutorialPrevBtn");
  const skipBtn = document.getElementById("tutorialSkipBtn");
  const dots = document.querySelectorAll(".tutorial-step-dot");

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentTutorialStep < TOTAL_TUTORIAL_STEPS - 1) {
        goToTutorialStep(currentTutorialStep + 1);
      } else {
        closeTutorial(true);
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentTutorialStep > 0) {
        goToTutorialStep(currentTutorialStep - 1);
      }
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      closeTutorial(true);
    });
  }

  dots.forEach(dot => {
    dot.addEventListener("click", () => {
      const step = parseInt(dot.getAttribute("data-step"), 10);
      if (!isNaN(step)) goToTutorialStep(step);
    });
  });

  // Cerrar al hacer click fuera de la tarjeta
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeTutorial(true);
    }
  });

  // Botón para abrir desde el modal "Acerca de"
  const openFromAbout = document.getElementById("openTutorialFromAboutBtn");
  if (openFromAbout) {
    openFromAbout.addEventListener("click", () => {
      const aboutModal = document.getElementById("aboutModal");
      if (aboutModal) aboutModal.style.display = "none";
      openTutorial();
    });
  }
}

function goToTutorialStep(stepIndex) {
  currentTutorialStep = Math.max(0, Math.min(stepIndex, TOTAL_TUTORIAL_STEPS - 1));

  const steps = document.querySelectorAll(".tutorial-step");
  const dots = document.querySelectorAll(".tutorial-step-dot");
  const prevBtn = document.getElementById("tutorialPrevBtn");
  const nextBtn = document.getElementById("tutorialNextBtn");

  steps.forEach(step => {
    const s = parseInt(step.getAttribute("data-step"), 10);
    if (s === currentTutorialStep) {
      step.classList.add("active");
    } else {
      step.classList.remove("active");
    }
  });

  dots.forEach(dot => {
    const d = parseInt(dot.getAttribute("data-step"), 10);
    if (d === currentTutorialStep) {
      dot.classList.add("active");
    } else {
      dot.classList.remove("active");
    }
  });

  if (prevBtn) {
    prevBtn.style.display = currentTutorialStep > 0 ? "inline-flex" : "none";
  }

  if (nextBtn) {
    if (currentTutorialStep === TOTAL_TUTORIAL_STEPS - 1) {
      nextBtn.textContent = "¡Comenzar! ✓";
    } else {
      nextBtn.textContent = "Siguiente →";
    }
  }
}

function openTutorial() {
  const modal = document.getElementById("tutorialModal");
  if (!modal) return;
  goToTutorialStep(0);
  modal.style.display = "flex";
}

function closeTutorial(markCompleted = true) {
  const modal = document.getElementById("tutorialModal");
  if (modal) modal.style.display = "none";

  if (markCompleted && currentUserId) {
    try {
      localStorage.setItem(`stab_tutorial_completed_${currentUserId}`, "true");
    } catch (e) {
      console.warn("No se pudo guardar estado del tutorial:", e);
    }
  }
}

function checkTutorialWelcome(userId) {
  if (!userId) return;
  try {
    const completed = localStorage.getItem(`stab_tutorial_completed_${userId}`);
    if (!completed) {
      setTimeout(() => {
        openTutorial();
      }, 700);
    }
  } catch (e) {
    console.warn("Error leyendo localStorage:", e);
  }
}
