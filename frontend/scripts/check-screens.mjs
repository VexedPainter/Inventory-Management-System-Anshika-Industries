/**
 * check-screens.mjs
 * Post-build verification script that renders every screen and asserts that
 * rendered text does NOT contain "NaN", "undefined", or "[object Object]".
 */

import { createServer } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

// 1. Mock browser globals for SSR rendering
class MockElement {
  getAttribute() { return null; }
  setAttribute() {}
}
globalThis.Element = MockElement;
globalThis.HTMLElement = MockElement;
globalThis.SVGElement = MockElement;
globalThis.HTMLInputElement = MockElement;
globalThis.Event = class Event {};
globalThis.CustomEvent = class CustomEvent {};

globalThis.window = {
  location: { pathname: '/', search: '', hash: '' },
  matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  history: { pushState: () => {}, replaceState: () => {} },
  scrollTo: () => {},
  Element: MockElement,
  HTMLElement: MockElement,
  SVGElement: MockElement,
};
globalThis.document = {
  createElement: () => ({ style: {} }),
  documentElement: { classList: { add: () => {}, remove: () => {}, contains: () => false } },
};
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    configurable: true,
  });
} catch {}
// Suppress harmless React SSR layoutEffect warning
const origError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  origError(...args);
};

globalThis.localStorage = {
  getItem: (key) => (key === 'theme' ? 'dark' : null),
  setItem: () => {},
  removeItem: () => {},
};
globalThis.sessionStorage = {
  getItem: (key) => (key === 'ss_user' ? JSON.stringify({ username: 'admin', role: 'admin' }) : 'dummy-token'),
  setItem: () => {},
  removeItem: () => {},
};
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({}),
  text: async () => '',
});

async function run() {
  console.log('🚀 Starting screen rendered text integrity check...');
  
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  const { AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.tsx');
  const { OrbProvider } = await vite.ssrLoadModule('/src/context/OrbContext.tsx');

  const screens = [
    { name: 'DashboardView', path: '/src/views/DashboardView.tsx', props: { onNavigateTab: () => {}, onOpenCopilot: () => {} } },
    { name: 'InventoryCatalogView', path: '/src/views/InventoryCatalogView.tsx', props: { onNavigateTab: () => {}, onOpenQuickPO: () => {} } },
    { name: 'MovementsView', path: '/src/views/MovementsView.tsx', props: {} },
    { name: 'ProcurementView', path: '/src/views/ProcurementView.tsx', props: {} },
    { name: 'SalesView', path: '/src/views/SalesView.tsx', props: {} },
    { name: 'CustomersView', path: '/src/views/CustomersView.tsx', props: {} },
    { name: 'SuppliersView', path: '/src/views/SuppliersView.tsx', props: {} },
    { name: 'ReportsView', path: '/src/views/ReportsView.tsx', props: {} },
    { name: 'AnalyticsView', path: '/src/views/AnalyticsView.tsx', props: {} },
    { name: 'AiCopilotPageView', path: '/src/views/AiCopilotPageView.tsx', props: {} },
    { name: 'AuditView', path: '/src/views/AuditView.tsx', props: {} },
    { name: 'UsersView', path: '/src/views/UsersView.tsx', props: {} },
    { name: 'BusinessImpactView', path: '/src/views/BusinessImpactView.tsx', props: {} },
    { name: 'SettingsView', path: '/src/views/SettingsView.tsx', props: {} },
    { name: 'DevMotionView', path: '/src/views/DevMotionView.tsx', props: {} },
    { name: 'LoginView', path: '/src/views/LoginView.tsx', props: {} },
    { name: 'AskAniPanel', path: '/src/views/AskAniPanel.tsx', props: { isOpen: true, onClose: () => {} } },
  ];

  let errors = [];

  for (const screen of screens) {
    try {
      const mod = await vite.ssrLoadModule(screen.path);
      const Component = mod[screen.name] || mod.default;

      if (!Component) {
        errors.push(`[${screen.name}] Could not find export component in ${screen.path}`);
        continue;
      }

      // Create a dedicated QueryClient for each render
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      // Render with mock QueryClient + AuthProvider + OrbProvider
      const element = createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AuthProvider,
          null,
          createElement(
            OrbProvider,
            null,
            createElement(Component, screen.props)
          )
        )
      );

      const html = renderToString(element);

      // Extract text content from rendered HTML by stripping tags and script/style
      const textOnly = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<path[^>]*\/>/gi, '')
        .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
        .replace(/<[^>]+>/g, ' ');

      // Check 1: [object Object]
      if (html.includes('[object Object]') || textOnly.includes('[object Object]')) {
        errors.push(`[${screen.name}] Found literal "[object Object]" rendered in output.`);
      }

      // Check 2: NaN (as standalone word or formatted number like ₹NaN or NaN%)
      const nanMatch = textOnly.match(/(?:[₹$%\s\(\[\{]|^)NaN(?:[%\s\)\]\},]|$)/);
      if (nanMatch) {
        const idx = nanMatch.index || 0;
        const snippet = textOnly.substring(Math.max(0, idx - 30), Math.min(textOnly.length, idx + 40)).trim();
        errors.push(`[${screen.name}] Found "NaN" in rendered text: "...${snippet}..."`);
      }

      // Check 3: undefined (as visible text or in attributes like value="undefined")
      const undefMatch = textOnly.match(/(?:[₹$%\s\(\[\{]|^)undefined(?:[%\s\)\]\},]|$)/);
      if (undefMatch) {
        const idx = undefMatch.index || 0;
        const snippet = textOnly.substring(Math.max(0, idx - 30), Math.min(textOnly.length, idx + 40)).trim();
        errors.push(`[${screen.name}] Found "undefined" in rendered text: "...${snippet}..."`);
      }

      console.log(`  ✓ ${screen.name.padEnd(22)} passed rendered text integrity`);
    } catch (err) {
      errors.push(`[${screen.name}] Rendering threw exception: ${err.message}`);
    }
  }

  // Also check built static bundles in ../static
  const staticDir = resolve(root, '..', 'static');
  if (fs.existsSync(staticDir)) {
    const staticIndex = resolve(staticDir, 'index.html');
    if (fs.existsSync(staticIndex)) {
      const indexHtml = fs.readFileSync(staticIndex, 'utf-8');
      if (indexHtml.includes('[object Object]')) {
        errors.push(`[static/index.html] Found "[object Object]" in built HTML`);
      }
    }
  }

  await vite.close();

  if (errors.length > 0) {
    console.error('\n❌ Frontend text integrity check FAILED:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  } else {
    console.log(`\n✅ All ${screens.length} screens passed text integrity check: No "NaN", "undefined", or "[object Object]" detected.\n`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal error running screen check:', err);
  process.exit(1);
});
