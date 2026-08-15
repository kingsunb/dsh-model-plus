/**
 * Lightweight security regression checks for audit fixes.
 * Run: node scripts/security-smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'lib/index.js'), 'utf8')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

const start = src.indexOf('function parseHostHeader')
const end = src.indexOf('export function apply')
if (start < 0 || end < 0) throw new Error('helpers not found in lib/index.js')
const helperSrc = src.slice(start, end)
const prelude = `
  const MODELS_DEV_URL = 'https://models.dev/api.json';
  const LEGACY_MODELS_URLS = [
    'https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json',
  ];
`
const helpers = new Function(
  prelude +
    helperSrc +
    '; return { isLoopbackHostname, sameUrlOrigin, hasSensitiveRequestHeaders, isLoopbackRemoteAddress, isBlockedOutboundHostname, assertOutboundUrlAllowed, isLegacyModelsUrl, migrateCatalogUrl, sameOriginHost, parseHostHeader }',
)()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// loopback
assert(helpers.isLoopbackHostname('127.0.0.1'), '127.0.0.1')
assert(helpers.isLoopbackHostname('127.1.2.3'), '127/8')
assert(helpers.isLoopbackHostname('localhost'), 'localhost')
assert(helpers.isLoopbackHostname('::1'), '::1')
assert(!helpers.isLoopbackHostname('8.8.8.8'), 'public not loopback')
assert(helpers.isLoopbackRemoteAddress('::ffff:127.0.0.1'), 'mapped loopback')
assert(!helpers.isLoopbackRemoteAddress('10.0.0.5'), 'private not loopback remote')

// outbound policy
let threw = false
try {
  helpers.assertOutboundUrlAllowed('http://example.com/x')
} catch {
  threw = true
}
assert(threw, 'http non-loopback rejected')

threw = false
try {
  helpers.assertOutboundUrlAllowed('http://127.0.0.1:11434/v1')
} catch {
  threw = true
}
assert(!threw, 'http loopback allowed')

threw = false
try {
  helpers.assertOutboundUrlAllowed('https://169.254.169.254/latest')
} catch {
  threw = true
}
assert(threw, 'cloud metadata blocked')

threw = false
try {
  helpers.assertOutboundUrlAllowed('https://models.dev/api.json', { requireHttps: true })
} catch {
  threw = true
}
assert(!threw, 'models.dev allowed')

// legacy catalog migration
assert(
  helpers.isLegacyModelsUrl('https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json'),
  'legacy url detected',
)
assert(
  helpers.migrateCatalogUrl('https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json') ===
    'https://models.dev/api.json',
  'legacy migrates to models.dev',
)
assert(helpers.migrateCatalogUrl('') === 'https://models.dev/api.json', 'empty migrates')

// sensitive headers + same-origin
assert(helpers.hasSensitiveRequestHeaders({ Authorization: 'Bearer x' }), 'authorization sensitive')
assert(helpers.hasSensitiveRequestHeaders({ 'x-api-key': 'k' }), 'x-api-key sensitive')
assert(!helpers.hasSensitiveRequestHeaders({ accept: 'json' }), 'accept not sensitive')
assert(helpers.sameUrlOrigin('https://a.com/x', 'https://a.com/y'), 'same origin')
assert(!helpers.sameUrlOrigin('https://a.com/x', 'https://evil.com/x'), 'cross host')
assert(!helpers.sameUrlOrigin('https://a.com/x', 'http://a.com/x'), 'cross scheme')

// origin/host compare
assert(helpers.sameOriginHost('http://127.0.0.1:3080', '127.0.0.1:3080'), 'same origin host')
assert(!helpers.sameOriginHost('http://evil.com', '127.0.0.1:3080'), 'evil origin')

// source markers
for (const needle of [
  '携带凭据的请求禁止跨域重定向',
  'unauthenticated write denied',
  'assertTrustedWriteRequest',
  'expectedRevision',
  'DEFAULT_MODELS_URL = MODELS_DEV_URL',
  'delete next.input',
  '禁止访问链路本地或云元数据地址',
  'HTTPS 请求禁止降级到 HTTP 重定向',
]) {
  assert(src.includes(needle), 'index missing: ' + needle)
}
assert(client.includes('refreshSeqRef'), 'client refreshSeqRef')
assert(client.includes('providerRef'), 'client providerRef')
assert(!src.includes("next.input = norm.vision === true ? ['text', 'image'] : ['text']"), 'forced text input removed')

// cross-port credential redirect must be treated as cross-origin
function shouldBlockCredentialRedirect(fromUrl, toUrl, headers) {
  return helpers.hasSensitiveRequestHeaders(headers) && !helpers.sameUrlOrigin(fromUrl, toUrl)
}
assert(
  shouldBlockCredentialRedirect(
    'http://127.0.0.1:3001/models',
    'http://127.0.0.1:3002/models',
    { authorization: 'Bearer sk-secret-demo' },
  ),
  'cross-port credential redirect blocked',
)
assert(
  !shouldBlockCredentialRedirect(
    'http://127.0.0.1:3001/models',
    'http://127.0.0.1:3001/next',
    { authorization: 'Bearer sk' },
  ),
  'same-origin credential redirect allowed',
)

// local servers: prove attacker would receive auth if not blocked (logic only)
const attackerHits = []
const attacker = http.createServer((req, res) => {
  attackerHits.push(req.headers.authorization || '')
  res.writeHead(200)
  res.end('ok')
})
await new Promise((resolve) => attacker.listen(0, '127.0.0.1', resolve))
const aport = attacker.address().port
await new Promise((resolve, reject) => {
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: aport,
      path: '/models',
      method: 'GET',
      headers: { authorization: 'Bearer sk-secret-demo' },
    },
    (res) => {
      res.resume()
      res.on('end', resolve)
    },
  )
  req.on('error', reject)
  req.end()
})
assert(attackerHits[0] === 'Bearer sk-secret-demo', 'baseline: attacker can receive auth if forwarded')
attacker.close()

console.log('security-smoke: OK')
