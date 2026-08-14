/**
 * Build script for @kingsunb/dsh-model-plus.
 *
 * This plugin ships plain JavaScript — lib/index.js (host, ESM) and
 * lib/client.js (browser, __ModuleLoader__ factory) are hand-authored and
 * need no TypeScript/bundler pass. The build step validates syntax and the
 * required manifest fields so a broken publish fails fast locally.
 *
 * Run: `node scripts/build.mjs` (also runs on `npm install` via the
 * `prepare` script).
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const REQUIRED_FILES = [
  'lib/index.js',
  'lib/client.js',
  'cordis.patch.yml',
  'package.json',
]

const REQUIRED_PKG_FIELDS = ['name', 'version', 'main', 'exports', 'dsh']

function fail(msg) {
  console.error(`[build] FAIL: ${msg}`)
  process.exit(1)
}

// 1. Required files exist.
for (const rel of REQUIRED_FILES) {
  if (!existsSync(join(root, rel))) fail(`missing required file: ${rel}`)
}

// 2. package.json has the dsh bundle + client declaration.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const field of REQUIRED_PKG_FIELDS) {
  if (pkg[field] === undefined) fail(`package.json missing field: ${field}`)
}
if (pkg.dsh?.bundle?.patch === undefined) {
  fail('package.json dsh.bundle.patch must point at a cordis.patch.yml')
}
if (pkg.dsh?.client?.platform !== 'web') {
  fail('package.json dsh.client.platform must be "web"')
}
if (!Array.isArray(pkg.dsh?.client?.inject) || pkg.dsh.client.inject.length === 0) {
  fail('package.json dsh.client.inject must list at least one platform module')
}

// 3. Syntax check: host half parses as ESM.
const hostSrc = readFileSync(join(root, 'lib/index.js'), 'utf8')
try {
  // new Function would reject ESM `export`; use a dynamic import data URL.
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(hostSrc).toString('base64')
  await import(dataUrl).then((mod) => {
    if (typeof mod.apply !== 'function') fail('lib/index.js must export function apply(ctx)')
    if (typeof mod.name !== 'string' || !mod.name) fail('lib/index.js must export a non-empty name string')
    // cordis Inject.resolve：string[] 或 { 服务名: config }。
    // 禁止 { required, optional }——会被当成服务名，插件永远 pending。
    const inj = mod.inject
    let injLabel = ''
    if (Array.isArray(inj) && inj.length > 0) {
      if (!inj.every((n) => typeof n === 'string' && n)) {
        fail('lib/index.js inject array entries must be non-empty strings')
      }
      injLabel = inj.join(', ')
    } else if (inj && typeof inj === 'object' && !Array.isArray(inj)) {
      const keys = Object.keys(inj)
      if (!keys.length) fail('lib/index.js inject object must have at least one service name')
      if (keys.includes('required') || keys.includes('optional')) {
        fail('lib/index.js inject must NOT use { required, optional }; cordis treats those keys as service names. Use string[] (required deps) and ctx.get() for optional services')
      }
      injLabel = keys.join(', ')
    } else {
      fail('lib/index.js must export inject as non-empty string[] or { serviceName: config }')
    }
    console.log(`[build] host half ok: name=${mod.name} inject=${injLabel}`)
  })
} catch (e) {
  fail(`lib/index.js syntax/shape error: ${e?.message ?? e}`)
}

// 4. Client half is a __ModuleLoader__.load factory bundle (CJS-in-IIFE).
//    It is NOT valid ESM (top-level window.__ModuleLoader__ call), so we
//    only check its shape markers, not parse it as a module.
const clientSrc = readFileSync(join(root, 'lib/client.js'), 'utf8')
const CLIENT_MARKERS = [
  'window.__ModuleLoader__.load(',
  'factory: (require) =>',
  "id: '@kingsunb/dsh-model-plus'",
  'return module.exports',
]
for (const marker of CLIENT_MARKERS) {
  if (!clientSrc.includes(marker)) {
    fail(`lib/client.js missing required marker: ${marker}`)
  }
}
console.log('[build] client half ok: __ModuleLoader__ factory shape verified')

// 5. cordis.patch.yml inserts the plugin row.
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes('- insert:')) fail('cordis.patch.yml must contain an "- insert:" row')
if (!patch.includes("@kingsunb/dsh-model-plus")) fail('cordis.patch.yml must reference @kingsunb/dsh-model-plus')
console.log('[build] cordis.patch.yml ok')

console.log('[build] OK — all checks passed')
