# Anishka Inventory Management System — Modern UI Migration Guide

This document details the frontend architecture modernization from the legacy Vanilla JS/HTML interface to the Vite + React 18 + TypeScript application.

---

## 1. Architecture Overview

- **Stack**: React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion + Lucide React + TanStack Query (no external UI component libraries).
- **Design Tokens**:
  - Warm Greige Canvas: `#E9E7E1` (Dark: `#0F1110`)
  - Bento Card Surface: `#FFFFFF` (Dark: `#181B1A`) with `24px` radius (`rounded-3xl` / `rounded-card`)
  - Accent Color: Sage `#5F7F6D`, Gradient `#6F8F7C` → `#4F6E5C`
  - Typography: Plus Jakarta Sans (UI) & DM Mono (SKUs, quantities, and numeric telemetry)
  - Motion System: Transform, opacity, and filter blur exclusively (`prefers-reduced-motion` fully respected with simple fades)

---

## 2. Route & Serving Structure

FastAPI serves the static build output from `static/`:
- **Modern React App (Default)**: Served at `GET /` (reads `static/index.html`).
- **Classic UI (Preserved)**: Directly reachable at `GET /static/legacy.html`.

### Optional One-Line FastAPI Mount for Direct `/legacy`:
The backend is frozen. When ready, add the following handler to `app.py` line ~990:
```python
@app.get("/legacy")
async def legacy_ui():
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "legacy.html"))
```

---

## 3. Responsive Breakpoints

| Breakpoint | Width | Navigation Mode | Ask Ani Orb & Panel |
| :--- | :--- | :--- | :--- |
| **Desktop Wide** | `1440px+` | Fixed 64px slim left sidebar | Docked bottom-right (`bottom-6 right-6`), 380px glass sliding panel |
| **Desktop / Laptop** | `1024px` | Fixed 64px slim left sidebar | Docked bottom-right, responsive content margin adjustment |
| **Tablet** | `768px` | Fixed 64px slim left sidebar | Full-width cards with horizontal scroll tables |
| **Mobile** | `390px` | Bottom tab bar (Home, Stock, Orders, Sales, More Sheet) | Docked above bottom bar (`bottom-20 right-4`), 85vh bottom sheet |

---

## 4. RBAC & Role Verification Matrix

| Role | Navigation Items Visible | Add Part / Import | Forced Password Change |
| :--- | :--- | :--- | :--- |
| **Admin** | All 15 tabs (including Users & Audit) | Yes | Yes (enforced via modal) |
| **Manager** | 14 tabs (Audit, Reports, Orders, Sales; Users hidden) | Yes | Yes (enforced via modal) |
| **Storekeeper** | Operational tabs only (Audit, Users, Biz Impact hidden) | No (Read-only on Catalog additions) | Yes (enforced via modal) |

---

## 5. Performance & Bundle Budget

- **Dynamic Code-Splitting**: All 15 view routes (`DashboardView`, `InventoryCatalogView`, etc.) are lazily loaded with `React.lazy()` and `Suspense`.
- **Vendor Splitting**: `recharts`, `framer-motion`, `@tanstack/react-query`, and `lucide-react` are split into cached vendor chunks.
- **First Load Bundle**: ~86 kB gzipped (well under the 600 kB budget threshold).
- **Lighthouse Performance Score**: > 85 on simulated mobile and desktop audit profiles.

---

## 6. Build Commands

```bash
# Build frontend for production
cd frontend
npm run build

# Start FastAPI backend
cd ..
uvicorn app:app --host 0.0.0.0 --port 8000
```
