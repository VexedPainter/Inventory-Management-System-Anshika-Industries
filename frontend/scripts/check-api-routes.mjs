/**
 * check-api-routes.mjs
 * Build-time verification script that asserts all /api/ endpoints used in /frontend/src
 * are defined in app.py. Fails with exit code 1 if any undefined route is found.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const frontendSrc = path.resolve(__dirname, '..', 'src');
const appPyPath = path.resolve(rootDir, 'app.py');

if (!fs.existsSync(appPyPath)) {
  console.error(`[check-api-routes] ERROR: app.py not found at ${appPyPath}`);
  process.exit(1);
}

// 1. Parse all routes defined in app.py
const appPyContent = fs.readFileSync(appPyPath, 'utf-8');
const routeDefRegex = /@app\.(?:get|post|put|delete|patch)\(\s*["']([^"']+)["']/g;
const appRoutes = [];
let m;
while ((m = routeDefRegex.exec(appPyContent)) !== null) {
  appRoutes.push(m[1]);
}

console.log(`[check-api-routes] Found ${appRoutes.length} defined routes in app.py.`);

// Helper to convert FastAPI route pattern to a regex
// E.g. /api/sales/orders/{id}/quote-pdf -> ^/api/sales/orders/[^/]+/quote-pdf$
function routeToRegex(routePattern) {
  const placeholder = routePattern.replace(/\{[^}]+\}/g, '___PARAM___');
  const escaped = placeholder.replace(/[-[\]()*+?.,\\^$|#\s]/g, '\\$&');
  const regexStr = escaped.replace(/___PARAM___/g, '[^/]+');
  return new RegExp(`^${regexStr}$`);
}

const appRouteRegexes = appRoutes.map(r => ({
  pattern: r,
  regex: routeToRegex(r),
}));

// 2. Scan frontend/src recursively for /api/ occurrences
function collectFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(collectFiles(fullPath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcFiles = collectFiles(frontendSrc);
const discoveredApis = [];

// Regex to capture string or template literal starting with /api/
// Case 1: Template literals `...`
const templateLiteralRegex = /`(\/api\/[^`]+)`/g;
// Case 2: String literals '...' or "..."
const stringLiteralRegex = /['"](\/api\/[^'"]+)['"]/g;

for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;

  // Process template literals
  while ((match = templateLiteralRegex.exec(content)) !== null) {
    let raw = match[1];
    // Replace ${...} with PARAM
    let normalized = raw.replace(/\$\{[^}]+\}/g, 'PARAM');
    // Strip query parameters
    const qIdx = normalized.indexOf('?');
    if (qIdx !== -1) {
      normalized = normalized.slice(0, qIdx);
    }
    // Clean any trailing slashes or spaces
    normalized = normalized.trim().replace(/\/+$/, '');
    discoveredApis.push({
      file: path.relative(rootDir, file),
      raw: match[0],
      normalized,
    });
  }

  // Process string literals
  while ((match = stringLiteralRegex.exec(content)) !== null) {
    let raw = match[1];
    let normalized = raw;
    const qIdx = normalized.indexOf('?');
    if (qIdx !== -1) {
      normalized = normalized.slice(0, qIdx);
    }
    normalized = normalized.trim().replace(/\/+$/, '');
    discoveredApis.push({
      file: path.relative(rootDir, file),
      raw: match[0],
      normalized,
    });
  }
}

// 3. Validate each discovered frontend API path against app.py
const failures = [];
const checkedUnique = new Set();

for (const item of discoveredApis) {
  const key = item.normalized;
  if (checkedUnique.has(key)) continue;
  checkedUnique.add(key);

  // Check if matches any route regex
  const matched = appRouteRegexes.some(r => r.regex.test(key));

  if (!matched) {
    failures.push(item);
  }
}

if (failures.length > 0) {
  console.error('\n❌ [check-api-routes] Found frontend API endpoints NOT defined in app.py:');
  for (const f of failures) {
    console.error(`  - ${f.normalized} (in ${f.file}, raw: ${f.raw})`);
  }
  process.exit(1);
} else {
  console.log(`✅ [check-api-routes] All ${checkedUnique.size} unique frontend /api/ endpoints successfully match defined routes in app.py.`);
  process.exit(0);
}
