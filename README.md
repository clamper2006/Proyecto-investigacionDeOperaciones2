# ◈ Stab — Sistema de Gestión de Inventario
> **v0.1.0-beta** — Prototipo de desarrollo  
> Cleer David C.A. — Compra y venta de productos, medicinas, mercancías y víveres.

---

## ¿Qué es Stab?

**Stab** es una Progressive Web App (PWA) diseñada para la gestión de inventario y stock de **Cleer David C.A.** Permite a gerentes y empleados llevar un control claro y eficiente de todos los productos, con alertas automáticas de stock bajo o agotado.

---

## Funcionalidades

- 📦 **Añadir, editar y eliminar productos** del inventario
- 📊 **Dashboard** con indicadores clave (KPIs): total de productos, stock normal, bajo y sin stock
- ⚠️ **Alertas automáticas** para productos con stock bajo o agotado
- 🔍 **Búsqueda y filtros** por categoría, nombre y estado
- 📱 **Diseño responsive** — funciona perfectamente en móvil y escritorio
- 💾 **Almacenamiento local** — datos guardados en el dispositivo sin necesidad de internet
- 📲 **Instalable** como app nativa desde el navegador (PWA)
- 🌙 **Modo oscuro** integrado, diseño moderno y minimalista

---

## Cómo usar

### Opción 1 — Acceso directo desde GitHub Pages

1. Sube la carpeta a un repositorio en GitHub
2. Activa GitHub Pages en `Settings → Pages → Source: main / root`
3. Comparte el enlace: `https://tuusuario.github.io/stab-pwa/`

### Opción 2 — Uso local

1. Descarga o clona el repositorio
2. Abre `index.html` directamente en el navegador
   > ⚠️ Para que el Service Worker funcione correctamente, sirve los archivos con un servidor local:
   ```bash
   # Python (recomendado)
   python3 -m http.server 8080
   # Node.js
   npx serve .
   ```
3. Accede a `http://localhost:8080`

---

## Estructura del proyecto

```
stab-pwa/
├── index.html          ← Aplicación principal
├── manifest.json       ← Configuración PWA
├── sw.js               ← Service Worker (offline)
├── css/
│   └── style.css       ← Estilos completos
├── js/
│   └── app.js          ← Lógica de la aplicación
└── icons/
    ├── icon.svg        ← Ícono vectorial
    ├── icon-192.png    ← Ícono para Android/PWA
    └── icon-512.png    ← Ícono splash screen
```

---

## Equipo de desarrollo

| Nombre | Rol |
|---|---|
| César Lamper | Desarrollador |
| Jesús López | Desarrollador |
| Jhon Quintero | Desarrollador |
| Jaimar López | Desarrollador |
| Soralvis Avilés | Desarrolladora |

---

## Estado del proyecto

> ⚠️ **Prototipo beta** — Esta es la versión inicial (v0.1.0-beta) del sistema **Stab**.  
> Desarrollado para **Cleer David C.A.**

---

*Stab © 2026 — Cleer David C.A. Todos los derechos reservados.*
