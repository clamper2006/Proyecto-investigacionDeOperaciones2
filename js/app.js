/* =========================================
   STAB v2.1.0 — Core Logic & Integration
   Inversiones Cleer David C.A. — Gestión de Inventario
   ========================================= */

// ---- CONFIGURACIÓN DE SUPABASE ----
const SUPABASE_URL = "https://pwmewoorpcevnclqyuvj.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3bWV3b29ycGNldm5jbHF5dXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODc2NzIsImV4cCI6MjA5OTc2MzY3Mn0.UEhWpiDuucFARpMQQETpsiOENaoyVO5ovwav_9FAHZ4";

let supabase = null;

// Inicialización de Supabase con validación de entorno
try {
  if (typeof supabasejs !== 'undefined') {
    supabase = supabasejs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase SDK no está cargado. Revisa la conexión de red.");
  }
} catch (err) {
  console.error("Error inicializando Supabase Client:", err);
}

// ---- ESTADO GLOBAL DEL SPREADSHEET ----
let productsState = [];
let isSeasonalActive = false;
let currentEditingProductId = null;
let productToDeleteId = null;

const CATEGORIES = ["Medicamentos", "Insumos Médicos", "Higiene", "Equipos", "Otros"];

// ---- CARGA INICIAL E INICIALIZACIÓN DE COMPONENTES ----
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
  if (!supabase) {
    showToast("Error de conexión con la base de datos.", "error");
    return;
  }

  // Comprobar estado de sesión actual al inicio
  supabase.auth.getSession().then(({ data: { session } }) => {
    handleAuthState(session);
  });

  // Escuchar cambios de estado en tiempo real (Inicio/Cierre/Redirects)
  supabase.auth.onAuthStateChange((_event, session) => {
    handleAuthState(session);
  });

  // Evento Login Email/Contraseña convencional
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

  // Evento Iniciar Sesión con Google (Flujo Depurado)
  document.getElementById("btn-google-login").addEventListener("click", async (e) => {
    e.preventDefault();
    showToast("Redirigiendo a Google...", "info");

    // Eliminamos cualquier caché previa del login antes del redirect
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'BYPASS_AUTH_CACHE' });
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      showToast(`Error con Google: ${error.message}`, "error");
    }
  });

  // Cierre de Sesión
  document.getElementById("btnLogout").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast("Error al cerrar sesión", "error");
    } else {
      showToast("Sesión cerrada", "info");
    }
  });
}

// Actualizar interfaces según sesión del usuario
function handleAuthState(session) {
  const loginScreen = document.getElementById("loginScreen");
  const appShell = document.getElementById("appShell");

  if (session) {
    loginScreen.style.display = "none";
    appShell.style.display = "flex";
    
    // Configurar Badge de usuario
    const email = session.user.email;
    document.getElementById("userAvatar").textContent = email.charAt(0).toUpperCase();
    document.getElementById("userAvatar").title = email;

    loadInventoryData();
  } else {
    loginScreen.style.display = "flex";
    appShell.style.display = "none";
  }
}

// ---- CARGA Y MANIPULACIÓN DE DATOS DESDE SUPABASE ----
async function loadInventoryData() {
  if (!supabase) return;

  const { data, error } = await supabase
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

// ---- LÓGICA DEL MODELO ESTACIONAL (MATEMÁTICA EN FRONTEND) ----
function setupSeasonalToggle() {
  const seasonBtn = document.getElementById("seasonToggleBtn");
  seasonBtn.addEventListener("click", () => {
    isSeasonalActive = !isSeasonalActive;
    
    if (isSeasonalActive) {
      seasonBtn.classList.add("active");
      showToast("Modo Estacional Activo (+40% de incremento en umbrales de seguridad)", "info");
    } else {
      seasonBtn.classList.remove("active");
      showToast("Modo Estacional Desactivado (Rango de seguridad base)", "info");
    }

    renderDashboard();
    renderInventoryTable();
  });
}

// Retorna los umbrales de stock mínimo/máximo evaluando la estacionalidad
function getSafetyLimits(product) {
  let min = Number(product.min_stock);
  let max = Number(product.max_stock);

  if (isSeasonalActive) {
    // Incremento estacional de resguardo del 40% (ej: períodos de alta demanda médica)
    min = Math.ceil(min * 1.4);
    max = Math.ceil(max * 1.4);
  }

  return { min, max };
}

// Clasificación de Alertas del Producto
function getStockAlertState(stock, limits) {
  if (stock <= 0) return { label: "Sin Stock", class: "badge-danger", code: "empty" };
  if (stock < limits.min) return { label: "Stock Bajo", class: "badge-warn", code: "low" };
  return { label: "Normal", class: "badge-success", code: "normal" };
}

// ---- RENDERS DE VISTA ----

// 1. DASHBOARD
function renderDashboard() {
  let totalProducts = productsState.length;
  let normalCount = 0;
  let lowCount = 0;
  let emptyCount = 0;
  let totalInventoryValue = 0;
  let totalCostValue = 0;
  let totalMarginPctSum = 0;
  let productsWithMargin = 0;

  const alertsTableBody = document.getElementById("criticalAlertsTable");
  alertsTableBody.innerHTML = "";

  productsState.forEach(prod => {
    const stock = Number(prod.stock);
    const cost = Number(prod.cost_price);
    const price = Number(prod.price);
    const limits = getSafetyLimits(prod);
    const alertState = getStockAlertState(stock, limits);

    // Contadores de KPIs
    if (alertState.code === "normal") normalCount++;
    else if (alertState.code === "low") {
      lowCount++;
      addAlertRow(alertsTableBody, prod, stock, alertState);
    } else if (alertState.code === "empty") {
      emptyCount++;
      addAlertRow(alertsTableBody, prod, stock, alertState);
    }

    // Cálculos de Operaciones
    totalInventoryValue += stock * price;
    totalCostValue += stock * cost;

    if (cost > 0) {
      const margin = ((price - cost) / cost) * 100;
      totalMarginPctSum += margin;
      productsWithMargin++;
    }
  });

  // Actualizar UI del Dashboard
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

// 2. INVENTARIO (LISTADO & FILTROS)
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

  // Métodos de Ordenación
  filtered.sort((a, b) => {
    if (sortOption === "name-asc") return a.name.localeCompare(b.name);
    if (sortOption === "name-desc") return b.name.localeCompare(a.name);
    if (sortOption === "stock-asc") return Number(a.stock) - Number(b.stock);
    if (sortOption === "stock-desc") return Number(b.stock) - Number(a.stock);
    if (sortOption === "price-desc") return Number(b.price) - Number(a.price);
    return 0;
  });

  filtered.forEach(prod => {
    const limits = getSafetyLimits(prod);
    const row = `
      <tr>
        <td><strong>${prod.name}</strong></td>
        <td>${prod.category}</td>
        <td>${prod.stock} ${prod.unit}</td>
        <td>${limits.min} / ${limits.max}</td>
        <td>${formatCurrency(prod.price)}</td>
        <td>${formatCurrency(prod.cost_price)}</td>
        <td>
          <button class="btn btn-ghost" style="padding: 4px 8px;" onclick="editProduct('${prod.id}')">✏️</button>
          <button class="btn btn-ghost" style="padding: 4px 8px; color:#ef4444;" onclick="openDeleteConfirm('${prod.id}')">🗑️</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

// 3. TABLA DE ANÁLISIS ABC (ANÁLISIS DE PARETO)
function renderABCTable() {
  const tableBody = document.getElementById("abcTableBody");
  tableBody.innerHTML = "";

  // 1. Calcular el valor de inversión total por artículo
  let abcList = productsState.map(prod => {
    const stock = Number(prod.stock);
    const cost = Number(prod.cost_price);
    const totalValue = stock * cost;
    return { ...prod, totalValue };
  });

  // 2. Ordenar de mayor a menor valor
  abcList.sort((a, b) => b.totalValue - a.totalValue);

  const grandTotalInvestment = abcList.reduce((acc, curr) => acc + curr.totalValue, 0);

  let runningTotal = 0;
  let totalA = 0;
  let totalB = 0;
  let totalC = 0;

  abcList.forEach(prod => {
    runningTotal += prod.totalValue;
    const sharePct = grandTotalInvestment > 0 ? (prod.totalValue / grandTotalInvestment) * 100 : 0;
    const cumPct = grandTotalInvestment > 0 ? (runningTotal / grandTotalInvestment) * 100 : 0;

    // Asignación de clases basada en el Principio de Pareto (70% - 20% - 10%)
    let abcClass = "C";
    let badgeClass = "class-c";

    if (cumPct <= 70) {
      abcClass = "A";
      badgeClass = "class-a";
      totalA += prod.totalValue;
    } else if (cumPct <= 90) {
      abcClass = "B";
      badgeClass = "class-b";
      totalB += prod.totalValue;
    } else {
      totalC += prod.totalValue;
    }

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

  // Renderizar Tarjetas Resumen ABC
  document.getElementById("abcTotalA").textContent = formatCurrency(totalA);
  document.getElementById("abcTotalB").textContent = formatCurrency(totalB);
  document.getElementById("abcTotalC").textContent = formatCurrency(totalC);
}

// ---- CONTROLADORES DE FILTROS & BÚSQUEDA ----
function setupFilterHandlers() {
  document.getElementById("searchInput").addEventListener("input", renderInventoryTable);
  document.getElementById("categoryFilter").addEventListener("change", renderInventoryTable);
  document.getElementById("stockFilter").addEventListener("change", renderInventoryTable);
  document.getElementById("sortSelect").addEventListener("change", renderInventoryTable);
}

// ---- GESTIÓN DE Prodcuto MODAL (AÑADIR / EDITAR) ----
function setupFormHandlers() {
  const modal = document.getElementById("productModal");
  const form = document.getElementById("productForm");

  // Abrir Modal Agregar
  document.getElementById("openAddProductBtn").addEventListener("click", () => {
    currentEditingProductId = null;
    form.reset();
    document.getElementById("modalTitle").textContent = "Añadir Producto";
    modal.style.display = "flex";
  });

  // Cerrar Modales
  document.getElementById("closeProductModalBtn").addEventListener("click", () => modal.style.display = "none");
  document.getElementById("cancelProductBtn").addEventListener("click", () => modal.style.display = "none");

  // Guardar datos en Supabase
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("prodName").value,
      category: document.getElementById("prodCategory").value,
      unit: document.getElementById("prodUnit").value,
      stock: Number(document.getElementById("prodStock").value),
      min_stock: Number(document.getElementById("prodMinStock").value),
      max_stock: Number(document.getElementById("prodMaxStock").value),
      price: parseFloat(document.getElementById("prodPrice").value),
      cost_price: parseFloat(document.getElementById("prodCostPrice").value),
      notes: document.getElementById("prodNotes").value
    };

    if (currentEditingProductId) {
      // Actualizar registro existente
      const { error } = await supabase
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
      // Insertar nuevo registro
      const { error } = await supabase
        .from("products")
        .insert([payload]);

      if (error) showToast(`Error al guardar: ${error.message}`, "error");
      else {
        showToast("Producto añadido con éxito", "success");
        modal.style.display = "none";
        loadInventoryData();
      }
    }
  });

  // Modal confirmación de borrado
  document.getElementById("cancelDeleteBtn").addEventListener("click", () => {
    document.getElementById("confirmModal").style.display = "none";
  });

  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    if (productToDeleteId) {
      const { error } = await supabase
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

// Disparadores Globales para Edición y Borrado
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

// ---- SISTEMA DE NAVEGACIÓN ENTRE VISTAS ----
function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");

  const titles = {
    dashboard: { title: "Dashboard Informativo", subtitle: "Resumen estadístico de Inversiones Cleer David C.A." },
    inventory: { title: "Gestión de Inventario", subtitle: "Control de stock e inspección de productos" },
    abc: { title: "Clasificación ABC", subtitle: "Optimización de stock por volumen y costo de inversión" }
  };

  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const viewName = item.getAttribute("data-view");

      navItems.forEach(n => n.classList.remove("active"));
      views.forEach(v => v.classList.remove("active"));

      item.classList.add("active");
      document.getElementById(`${viewName}View`).classList.add("active");

      // Actualizar Encabezado Dinámico
      document.getElementById("viewTitle").textContent = titles[viewName].title;
      document.getElementById("viewSubtitle").textContent = titles[viewName].subtitle;
    });
  });

  // Inicializar cabecera del Dashboard activo al inicio
  document.getElementById("viewTitle").textContent = titles.dashboard.title;
  document.getElementById("viewSubtitle").textContent = titles.dashboard.subtitle;

  // Lógica del modal "Acerca De"
  const aboutModal = document.getElementById("aboutModal");
  document.getElementById("openAboutBtn").addEventListener("click", () => aboutModal.style.display = "flex");
  document.getElementById("closeAboutModalBtn").addEventListener("click", () => aboutModal.style.display = "none");
  document.getElementById("closeAboutBtn").addEventListener("click", () => aboutModal.style.display = "none");
}

// ---- TOASTS DINÁMICOS ----
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "✓";
  if (type === "error") icon = "🚨";
  if (type === "info") icon = "ℹ️";

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---- FORMATEADORES AUXILIARES ----
function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

// ---- REGISTRO DE SERVICE WORKER Y PWA ----
let deferredPrompt = null;

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("Service Worker Stab v2.1.0 registrado exitosamente"))
      .catch(err => console.error("Fallo de registro del Service Worker:", err));
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

  dismissBtn.addEventListener("click", () => {
    banner.classList.remove("visible");
  });

  acceptBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Elección del usuario de instalación: ${outcome}`);
      deferredPrompt = null;
      banner.classList.remove("visible");
    }
  });
}
