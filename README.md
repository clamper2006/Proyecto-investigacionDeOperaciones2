# ◈ Stab — Sistema de Gestión de Inventario
> **v2.2.0** — Producción  
> Inversiones Cleer David C.A. — Compra y venta de productos, medicinas, mercancías y víveres.

---

## ¿Qué es Stab?

**Stab** es una Progressive Web App (PWA) diseñada para la gestión de inventario y stock de **Inversiones Cleer David C.A.** Permite a gerentes y empleados llevar un control claro y eficiente de todos los productos, con alertas automáticas de stock bajo o agotado, clasificación ABC y modo estacional.

---

## Funcionalidades v2.2.0

- 📦 **Añadir, editar y eliminar productos** del inventario
- 👤 **Inventario personalizado por usuario** — cada cuenta solo ve sus propios productos (Row Level Security)
- 📊 **Dashboard** con indicadores clave (KPIs): total de productos, stock normal, bajo y sin stock
- ⚠️ **Alertas automáticas** para productos con stock bajo o agotado
- 🔍 **Búsqueda y filtros** por categoría, nombre y estado
- 📈 **Clasificación ABC** — análisis de Pareto para optimización de inversión
- 🌡️ **Modo Estacional** — incremento automático del 40% en umbrales de seguridad
- 📱 **Diseño mobile-first** — Bottom Navigation Bar en móvil, Sidebar en desktop
- 🔐 **Autenticación segura** — Email/contraseña y Google OAuth via Supabase
- 💾 **Base de datos en la nube** — PostgreSQL (Supabase) con RLS por usuario
- 📲 **Instalable** como app nativa desde el navegador (PWA)
- 🌙 **Modo oscuro** integrado, diseño moderno y profesional

---

## Novedades en v2.2.0

### 🔐 Inventario por Usuario (RLS)
Cada cuenta de usuario tiene un inventario completamente aislado. Implementado mediante Row Level Security (RLS) en Supabase con políticas granulares por operación (SELECT, INSERT, UPDATE, DELETE).

### 📱 Interfaz Rediseñada (Mobile-First)
- **Móvil (vertical)**: Bottom Navigation Bar fija + Header compacto con logo y menú desplegable de usuario (Acerca de + Cerrar Sesión)
- **Desktop**: Sidebar lateral profesional sin cambios en funcionalidad
- Botones de acciones más limpios y proporcionales
- Iconos SVG en tabla de inventario reemplazando emojis

### 👥 Equipo actualizado en Acerca De
- Card de versión prominente con badge v2.2.0
- Sección de equipo de desarrollo con avatares

---

## Cómo usar

### Acceso desde GitHub Pages

La aplicación está disponible en:
```
https://clamper2006.github.io/Proyecto-investigacionDeOperaciones2/
```

### Uso local

```bash
# Python
python3 -m http.server 8080
# Node.js
npx serve .
```

Accede a `http://localhost:8080`

---

## Estructura del proyecto

```
STAB - REMASTERED/
├── index.html          ← Aplicación principal
├── manifest.json       ← Configuración PWA (v2.2.0)
├── sw.js               ← Service Worker (offline)
├── server.js           ← Servidor local de desarrollo
├── css/
│   └── style.css       ← Estilos completos (dark theme)
├── js/
│   └── app.js          ← Lógica + integración Supabase
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── supabase/           ← Credenciales y configuración
```

---

## Base de Datos (Supabase)

| Tabla | Descripción |
|---|---|
| `products` | Inventario de productos por usuario |

### Columnas de `products`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK auto-generada |
| `user_id` | uuid | FK → `auth.users` (propietario del producto) |
| `name` | text | Nombre del producto |
| `category` | text | Categoría |
| `unit` | text | Unidad de medida |
| `stock` | numeric | Stock actual |
| `min_stock` | numeric | Stock mínimo de alerta |
| `max_stock` | numeric | Stock máximo |
| `price` | numeric | Precio de venta |
| `cost_price` | numeric | Precio de costo |
| `notes` | text | Observaciones (opcional) |
| `created_at` | timestamptz | Fecha de creación |

### Políticas RLS activas

- `SELECT` — solo los propios productos del usuario
- `INSERT` — el `user_id` debe ser el del usuario autenticado
- `UPDATE` — solo sus propios productos
- `DELETE` — solo sus propios productos

---

## Equipo de Desarrollo

| Nombre | Rol |
|---|---|
| Cesar Lamper | Desarrollador Principal |
| Jaimar Lopez | Desarrollador |
| Jesus Lopez | Desarrollador |
| Soralwis Avilez | Desarrolladora |
| Jesus Figuera | Desarrollador |

---

## Estado del proyecto

> ✅ **v2.2.0 — En producción**  
> Inventario multi-usuario con RLS, interfaz mobile-first rediseñada, Supabase Auth integrado.

---

*Stab © 2026 — Inversiones Cleer David C.A. Todos los derechos reservados.*
