/**
 * dsh-model-plus host half — mounts the model-plus HTTP API.
 *
 * 浏览器半区（lib/client.js）通过同源 `/api/plus/*` JSON 端点与本半区通信：
 * 设置页「模型 Plus」按供应商编辑思考强度/视觉/上下文；一键同步默认从
 * models.dev 按模型 id 补全。
 *
 * 安装：`dsh plugin --profile web add @kingsunb/dsh-model-plus`
 * cordis.patch.yml 把本插件行插入 web profile 的 cordis 层。
 *
 * 改造自创造模式动态插件（Plugin/host.js），原 harness.handle → ctx.webServer.register。
 * @module @kingsunb/dsh-model-plus
 */

/**
 * Host-side route handler signature: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>.
 * WebRoute shape: { kind: 'exact'|'prefix', path: string, handler } from @deepseek-ai/dsh-host-webserver.
 * These are injected by cordis at runtime (ctx.webServer.register); no value import needed.
 */

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'model-plus'

/**
 * Host 半区 inject：cordis 只认 string[] 或 { 服务名: config }。
 * 不要写 { required, optional }——会被当成服务名 "required"/"optional"，插件永远 pending。
 * credentials 用 ctx.get('credentials') 可选读取，不进 inject。
 */
export const inject = ['settings', 'webServer', 'timer']

const NS = 'llm-pi-ai'
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const INPUTS = ['text', 'image']
const VERSION = '0.1.34'
/** 新建供应商默认重试次数（写入 retryPolicy.maxRetries）。平台默认也是 2。 */
const DEFAULT_PROVIDER_MAX_RETRIES = 2
const MAX_PROVIDER_MAX_RETRIES = 50
/** 模型测试超时：10 分钟（推理 + 长 SVG 输出可能很慢）。 */
const TEST_TIMEOUT_MS = 10 * 60 * 1000
const MAX_TEST_BYTES = 1024 * 1024
/** 参考 deepseek-harness-model-config：用 models.dev 补全思考强度/上下文/视觉。 */
const MODELS_DEV_URL = 'https://models.dev/api.json'
const MODELS_DEV_TIMEOUT_MS = 20000
const MAX_MODELS_DEV_BYTES = 8 * 1024 * 1024
/** 默认创意测试提示词（原文）。 */
const DEFAULT_TEST_PROMPT = 'SVG绘制一个鹈鹕骑自行车的2D动画'
/** SVG 动画输出较长；推理模型还会先占 reasoning_content，默认 16k。 */
const DEFAULT_TEST_MAX_TOKENS = 16384
/** 与 dsh-llm-pi-ai supportedProtocols() 对齐：手写 gateway 可声明的协议。 */
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages']
/** 官方 discoverModels 可探测列表的协议（anthropic-messages 无可读 listing）。 */
const LISTABLE_PROTOCOLS = ['openai-completions', 'openai-responses']
/** 官方 Models 页同款 route id：小写字母开头，仅 a-z0-9 与短横线。 */
const ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const LEGAL_API_KEY = /^[\x21-\x7E]+$/
const ENV_LINE_KEY = /^[A-Z][A-Z0-9_]*=[^=]/
/** 一键同步/目录默认地址（旧 GitHub raw models.json 已下线，统一迁到 models.dev）。 */
const DEFAULT_MODELS_URL = MODELS_DEV_URL
const LEGACY_MODELS_URLS = [
  'https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json',
]
const FETCH_TIMEOUT_MS = 15000
const DISCOVER_TIMEOUT_MS = 20000
const MAX_REMOTE_BYTES = 2 * 1024 * 1024
/** 与 dsh-llm-pi-ai 探测上限对齐。 */
const MAX_DISCOVER_BYTES = 4 * 1024 * 1024
const ALL_EFFORTS = {
  off: null, minimal: 'minimal', low: 'low', medium: 'medium',
  high: 'high', xhigh: 'xhigh', max: 'max',
}
const PRESETS = {
  none: { label: '关闭推理', efforts: false },
  basic: { label: '通用三档', efforts: { low: 'low', medium: 'medium', high: 'high' } },
  all: { label: '全开', efforts: ALL_EFFORTS },
  visionAll: { label: '视觉+全开', efforts: ALL_EFFORTS, vision: true },
}

const API_PREFIX = '/api/plus'
const MAX_REDIRECTS = 5
const MAX_MODEL_PATTERN_LENGTH = 200
const MAX_PUBLIC_ERROR_LENGTH = 512

function parseHostHeader(host, protocol) {
  const value = typeof host === 'string' ? host.trim() : ''
  if (!value || /[\s\/@?#]/.test(value)) return null
  try {
    const parsed = new URL(protocol + '//' + value)
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null
    return parsed
  } catch (_) {
    return null
  }
}

function isLoopbackHostname(hostname) {
  const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (value === 'localhost' || value === '::1' || value === '0:0:0:0:0:0:0:1') return true
  // IPv4-mapped IPv6 loopback
  if (value === '::ffff:127.0.0.1') return true
  // 整个 127.0.0.0/8
  const parts = value.split('.')
  if (parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    return true
  }
  return false
}

function sameUrlOrigin(left, right) {
  try {
    const a = new URL(left)
    const b = new URL(right)
    if (a.protocol !== b.protocol) return false
    if (a.hostname.toLowerCase() !== b.hostname.toLowerCase()) return false
    const aPort = a.port || (a.protocol === 'https:' ? '443' : '80')
    const bPort = b.port || (b.protocol === 'https:' ? '443' : '80')
    return aPort === bPort
  } catch (_) {
    return false
  }
}

function hasSensitiveRequestHeaders(headers) {
  if (!headers || typeof headers !== 'object') return false
  return Object.keys(headers).some((key) => {
    const lower = key.toLowerCase()
    return lower === 'authorization' || lower === 'proxy-authorization' || lower === 'x-api-key' || lower === 'api-key'
  })
}

function isLoopbackRemoteAddress(address) {
  const value = String(address || '').toLowerCase()
  if (!value) return false
  if (value === '::1' || value === '0:0:0:0:0:0:0:1') return true
  if (value.startsWith('::ffff:')) return isLoopbackHostname(value.slice('::ffff:'.length))
  return isLoopbackHostname(value)
}

/** 云元数据 / 链路本地等默认禁止出站目标（防 SSRF）。 */
function isBlockedOutboundHostname(hostname) {
  const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!value) return true
  if (value === 'metadata' || value === 'metadata.google.internal') return true
  if (value === '169.254.169.254' || value === '169.254.169.253') return true
  // link-local 169.254.0.0/16（含云元数据）
  const v4 = value.split('.')
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const a = Number(v4[0])
    const b = Number(v4[1])
    if (a === 169 && b === 254) return true
    // 当前网络广播/全零
    if (a === 0 || a === 255) return true
  }
  // IPv6 link-local / unique local 可不强制拦用户显式 baseURL；元数据别名已覆盖
  if (value.startsWith('fe80:')) return true
  return false
}

function assertOutboundUrlAllowed(rawUrl, options) {
  const opts = options && typeof options === 'object' ? options : {}
  let parsed
  try { parsed = new URL(rawUrl) } catch (_) { throw new Error('请求 URL 非法') }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('仅支持 http/https')
  if (parsed.username || parsed.password) throw new Error('请求 URL 不得包含用户名/密码')
  const host = parsed.hostname
  if (isBlockedOutboundHostname(host)) throw new Error('禁止访问链路本地或云元数据地址')
  if (parsed.protocol === 'http:' && !isLoopbackHostname(host)) {
    throw new Error('非本机目标必须使用 HTTPS；HTTP 仅允许 localhost/127.0.0.0/8/::1')
  }
  if (opts.requireHttps === true && parsed.protocol !== 'https:') {
    throw new Error('该请求仅允许 HTTPS')
  }
  return parsed
}

function isLegacyModelsUrl(url) {
  const value = String(url || '').trim().toLowerCase().replace(/\/+$/, '')
  if (!value) return false
  return LEGACY_MODELS_URLS.some((item) => item.toLowerCase().replace(/\/+$/, '') === value)
}

function migrateCatalogUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || isLegacyModelsUrl(raw)) return MODELS_DEV_URL
  return raw
}

/** Compare an Origin with Host using parsed host/port components, never suffix matching. */
function sameOriginHost(origin, host) {
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return false
  try {
    const originUrl = new URL(origin)
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false
    if (originUrl.username || originUrl.password || originUrl.pathname !== '/' || originUrl.search || originUrl.hash) return false
    const hostUrl = parseHostHeader(host, originUrl.protocol)
    if (!hostUrl || originUrl.hostname.toLowerCase() !== hostUrl.hostname.toLowerCase()) return false
    const defaultPort = originUrl.protocol === 'https:' ? '443' : '80'
    return (originUrl.port || defaultPort) === (hostUrl.port || defaultPort)
  } catch (_) {
    return false
  }
}

function routeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[remote-url]')
    .replace(/[A-Za-z]:[\\/][^\r\n]*/g, '[path]')
    .slice(0, MAX_PUBLIC_ERROR_LENGTH)
}

function isSafeIdPattern(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_MODEL_PATTERN_LENGTH && /^[A-Za-z0-9._:/@+~?*\-]+$/.test(value)
}

/** Linear-time glob matcher for remote model ids; '*' matches any run, '?' one character.
 *  大小写不敏感：value 先转小写再匹配（与精确 id 匹配的 toLowerCase 一致）。 */
function matchIdPattern(pattern, value) {
  const pat = pattern.toLowerCase()
  const lower = value.toLowerCase()
  let patternIndex = 0
  let valueIndex = 0
  let starIndex = -1
  let starValueIndex = 0
  while (valueIndex < lower.length) {
    const patternChar = pat[patternIndex]
    if (patternChar === lower[valueIndex] || patternChar === '?') {
      patternIndex += 1
      valueIndex += 1
    } else if (patternChar === '*') {
      starIndex = patternIndex
      starValueIndex = valueIndex
      patternIndex += 1
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1
      starValueIndex += 1
      valueIndex = starValueIndex
    } else {
      return false
    }
  }
  while (pat[patternIndex] === '*') patternIndex += 1
  return patternIndex === pat.length
}

/**
 * Register the model-plus host API on the context: the settings-backed model
 * catalog plus the same-origin JSON endpoints the browser half calls.
 */
export function apply(ctx) {
  let hostProto = null
  function refreshHostProto() {
    try {
      const list = ctx.settings.describe()
      if (Array.isArray(list) && list.length) { hostProto = Object.getPrototypeOf(list[0]); return }
    } catch (_) {}
    try {
      const v = ctx.settings.get(NS)
      if (v && typeof v === 'object') hostProto = Object.getPrototypeOf(v)
    } catch (_) {}
  }
  refreshHostProto()

  function H(data) {
    if (data === null || typeof data === 'string' || typeof data === 'boolean' || typeof data === 'number') return data
    if (Array.isArray(data)) {
      const a = []
      for (let i = 0; i < data.length; i++) a[i] = H(data[i])
      return a
    }
    if (data && typeof data === 'object') {
      const o = hostProto ? Object.create(hostProto) : Object.create(null)
      for (const k of Object.keys(data)) { if (data[k] !== undefined) o[k] = H(data[k]) }
      return o
    }
    return data
  }

  function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {} }
  function str(v, fb) { return typeof v === 'string' ? v : (fb === undefined ? '' : fb) }
  function readPiAi() { return asObject(ctx.settings.get(NS)) }
  function readPlus() { return asObject(readPiAi().__modelPlus) }

  function cloneModel(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : ''
    const idPattern = isSafeIdPattern(entry.idPattern) ? entry.idPattern : ''
    if (!id && !idPattern) return null
    if (id.length > 200) return null
    const out = {}
    if (id) out.id = id
    if (idPattern) out.idPattern = idPattern
    if (typeof entry.name === 'string' && entry.name.length <= 200 && entry.name) out.name = entry.name
    if (typeof entry.contextWindow === 'number' && Number.isFinite(entry.contextWindow) && entry.contextWindow > 0) out.contextWindow = Math.floor(entry.contextWindow)
    if (typeof entry.maxTokens === 'number' && Number.isFinite(entry.maxTokens) && entry.maxTokens > 0) out.maxTokens = Math.floor(entry.maxTokens)
    if (Array.isArray(entry.input)) {
      const input = []
      for (const item of entry.input) {
        if (typeof item === 'string' && INPUTS.indexOf(item) >= 0 && input.indexOf(item) < 0) input.push(item)
      }
      // 文本是默认模态；只有视觉能力需要落盘 input 字段。
      if (input.indexOf('image') >= 0) out.input = ['text', 'image']
    }
    // vision 布尔归一化：显式 input 数组优先，否则用 vision 推导
    if (!out.input) {
      if (entry.vision === true) out.input = ['text', 'image']
    }
    if (entry.reasoningEfforts === false) out.reasoningEfforts = false
    else if (entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object' && !Array.isArray(entry.reasoningEfforts)) {
      const efforts = {}
      for (const k of Object.keys(entry.reasoningEfforts)) {
        if (LEVELS.indexOf(k) < 0) continue
        const w = entry.reasoningEfforts[k]
        if (k === 'off') efforts.off = null
        else if (typeof w === 'string' && w.length <= 64) efforts[k] = w
      }
      if (Object.keys(efforts).length) out.reasoningEfforts = efforts
    }
    if (entry.compat && typeof entry.compat === 'object' && !Array.isArray(entry.compat)) {
      const compat = {}
      if (typeof entry.compat.thinkingFormat === 'string' && entry.compat.thinkingFormat.length <= 64) compat.thinkingFormat = entry.compat.thinkingFormat
      if (typeof entry.compat.supportsReasoningEffort === 'boolean') compat.supportsReasoningEffort = entry.compat.supportsReasoningEffort
      if (Object.keys(compat).length) out.compat = compat
    }
    return out
  }

  function hasVision(m) { return Array.isArray(m.input) && m.input.map(String).indexOf('image') >= 0 }
  function effortSummary(m) {
    if (m.reasoningEfforts === false) return '关闭'
    if (m.reasoningEfforts && typeof m.reasoningEfforts === 'object') {
      const keys = Object.keys(m.reasoningEfforts)
      if (!keys.length) return '未设置'
      // 按 LEVELS 顺序取最高档（off 不算），用于摘要简显
      const positive = LEVELS.filter((l) => l !== 'off' && Object.prototype.hasOwnProperty.call(m.reasoningEfforts, l))
      if (positive.length) return positive[positive.length - 1]
      if (Object.prototype.hasOwnProperty.call(m.reasoningEfforts, 'off')) return '关闭'
      return keys.length ? keys.join(', ') : '未设置'
    }
    return '未设置'
  }

  function modelView(m) {
    const effortsObj = (m.reasoningEfforts && m.reasoningEfforts !== false && typeof m.reasoningEfforts === 'object') ? m.reasoningEfforts : null
    const levels = LEVELS.map((level) => {
      const enabled = !!(effortsObj && Object.prototype.hasOwnProperty.call(effortsObj, level))
      let wire = '', wireNull = false
      if (enabled) {
        if (effortsObj[level] === null) wireNull = true
        else wire = String(effortsObj[level] ?? '')
      } else if (level === 'off') wireNull = true
      else wire = level
      return { level: level, enabled: enabled, wire: wire, wireNull: wireNull }
    })
    return {
      id: m.id, name: str(m.name, ''), disabled: m.reasoningEfforts === false, vision: hasVision(m),
      levels: levels, summary: effortSummary(m), hasEffort: !!(effortsObj && Object.keys(effortsObj).length),
      input: Array.isArray(m.input) ? m.input.slice() : [],
      contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : 0,
      maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : 0,
    }
  }

  function readRetryPolicyView(profile) {
    const rp = asObject(profile && profile.retryPolicy)
    // 未配置时 UI 仍展示默认次数 2（与平台/插件默认一致），不显示「默认」文案
    if (!Object.keys(rp).length) {
      return {
        configured: false,
        mode: 'normal',
        maxRetries: DEFAULT_PROVIDER_MAX_RETRIES,
        effectiveMaxRetries: DEFAULT_PROVIDER_MAX_RETRIES,
        label: String(DEFAULT_PROVIDER_MAX_RETRIES),
      }
    }
    const mode = str(rp.mode, 'normal') || 'normal'
    let maxRetries = null
    if (mode === 'always') {
      return {
        configured: true,
        mode: 'always',
        maxRetries: null,
        effectiveMaxRetries: DEFAULT_PROVIDER_MAX_RETRIES,
        label: 'always',
      }
    }
    if (typeof rp.maxRetries === 'number' && Number.isFinite(rp.maxRetries)) {
      maxRetries = Math.max(0, Math.floor(rp.maxRetries))
    }
    const effective = maxRetries == null ? DEFAULT_PROVIDER_MAX_RETRIES : maxRetries
    return {
      configured: true,
      mode: 'normal',
      maxRetries: maxRetries,
      effectiveMaxRetries: effective,
      label: String(effective),
    }
  }

  function normalizeRetryPolicyInput(args) {
    // clear: true → 删除 retryPolicy，回到平台默认
    if (args && args.clear === true) return { clear: true, value: undefined }
    if (args && (args.retryPolicy === null || args.retryPolicy === false)) return { clear: true, value: undefined }

    // 允许只传 maxRetries 数字
    let mode = str(args && (args.mode || (args.retryPolicy && args.retryPolicy.mode)), 'normal').trim() || 'normal'
    if (mode !== 'normal' && mode !== 'always') throw new Error('retryPolicy.mode 仅支持 normal / always')

    if (mode === 'always') {
      return { clear: false, value: { mode: 'always' } }
    }

    let maxRetries = args && args.maxRetries
    if (maxRetries === undefined && args && args.retryPolicy && typeof args.retryPolicy === 'object') {
      maxRetries = args.retryPolicy.maxRetries
    }
    if (maxRetries === '' || maxRetries === null || maxRetries === undefined) {
      // 显式 normal 但不给次数 → 用插件默认 2
      maxRetries = DEFAULT_PROVIDER_MAX_RETRIES
    }
    maxRetries = Number(maxRetries)
    if (!Number.isFinite(maxRetries) || !Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error('maxRetries 须为 >= 0 的整数')
    }
    if (maxRetries > MAX_PROVIDER_MAX_RETRIES) {
      throw new Error('maxRetries 最大 ' + MAX_PROVIDER_MAX_RETRIES)
    }
    return { clear: false, value: { mode: 'normal', maxRetries: maxRetries } }
  }

  function listProviders() {
    const providers = asObject(readPiAi().providers)
    return Object.keys(providers).sort().map((id) => {
      const p = asObject(providers[id])
      const models = Array.isArray(p.models) ? p.models.map(cloneModel).filter(Boolean) : []
      let withEffort = 0, withVision = 0
      for (const m of models) {
        if (m.reasoningEfforts && m.reasoningEfforts !== false && typeof m.reasoningEfforts === 'object' && Object.keys(m.reasoningEfforts).length) withEffort += 1
        if (hasVision(m)) withVision += 1
      }
      const retry = readRetryPolicyView(p)
      return {
        provider: id, displayName: str(p.displayName, id), baseURL: str(p.baseURL, ''), api: str(p.api, ''),
        modelCount: models.length, withEffort: withEffort, withVision: withVision,
        retryConfigured: retry.configured,
        retryMode: retry.mode,
        retryMaxRetries: retry.maxRetries,
        retryEffectiveMaxRetries: retry.effectiveMaxRetries,
        retryLabel: retry.label,
      }
    })
  }

  function getRawModels(provider) {
    const profile = asObject(asObject(readPiAi().providers)[provider])
    return Array.isArray(profile.models) ? profile.models.map(cloneModel).filter(Boolean) : []
  }

  function normalizeEditor(editor) {
    if (!editor || typeof editor !== 'object') throw new Error('无效编辑数据')
    const vision = editor.vision === true
    const contextWindow = (typeof editor.contextWindow === 'number' && editor.contextWindow > 0) ? Math.floor(editor.contextWindow) : undefined
    const maxTokens = (typeof editor.maxTokens === 'number' && editor.maxTokens > 0) ? Math.floor(editor.maxTokens) : undefined
    const clearContextWindow = editor.clearContextWindow === true
    const clearMaxTokens = editor.clearMaxTokens === true
    if (editor.disabled === true) return { reasoningEfforts: false, vision: vision, contextWindow: contextWindow, maxTokens: maxTokens, clearContextWindow: clearContextWindow, clearMaxTokens: clearMaxTokens }
    const efforts = {}
    let positive = 0
    for (const row of (Array.isArray(editor.levels) ? editor.levels : [])) {
      if (!row || row.enabled !== true) continue
      const level = str(row.level, '')
      if (LEVELS.indexOf(level) < 0) continue
      if (level === 'off') {
        efforts.off = null
      } else {
        const wire = str(row.wire, level)
        if (!wire) throw new Error(level + ' 需要 wire 值')
        efforts[level] = wire
        positive += 1
      }
    }
    if (!Object.keys(efforts).length) return { reasoningEfforts: false, vision: vision, contextWindow: contextWindow, maxTokens: maxTokens, clearContextWindow: clearContextWindow, clearMaxTokens: clearMaxTokens }
    if (!positive) throw new Error('至少启用一个非 off 档，或勾选关闭推理')
    return { reasoningEfforts: efforts, vision: vision, contextWindow: contextWindow, maxTokens: maxTokens, clearContextWindow: clearContextWindow, clearMaxTokens: clearMaxTokens }
  }

  function getUserLayer() {
    refreshHostProto()
    try {
      const list = ctx.settings.describe()
      for (const d of list) if (d && d.ns === NS && d.user && typeof d.user === 'object') return JSON.parse(JSON.stringify(d.user))
    } catch (_) {}
    try { return JSON.parse(JSON.stringify(readPiAi())) } catch (_) { return { providers: {} } }
  }

  /** 当前 llm-pi-ai namespace 的 settings revision，用于 expectedRevision CAS。 */
  function readNsRevision() {
    try {
      const list = ctx.settings.describe()
      if (Array.isArray(list)) {
        for (const d of list) {
          if (d && d.ns === NS && typeof d.revision === 'number' && Number.isFinite(d.revision)) return d.revision
        }
      }
    } catch (_) {}
    return undefined
  }

  function isSettingsConflictError(error) {
    if (!error) return false
    if (error.code === 'SETTINGS_CONFLICT') return true
    const name = error.name ? String(error.name) : ''
    const msg = error.message ? String(error.message) : String(error)
    return name === 'SettingsConflictError' || /SETTINGS_CONFLICT|settings conflict|stale.*revision|revision mismatch/i.test(msg)
  }

  async function writeModels(provider, models) {
    if (!ctx.settings.writable) throw new Error('settings 只读')
    refreshHostProto()
    const errors = []
    const profileNow = asObject(asObject(readPiAi().providers)[provider])
    const expectedRevision = readNsRevision()

    try {
      const providerPatch = { models: models }
      await ctx.settings.update(NS, H({ providers: { [provider]: providerPatch } }), expectedRevision)
      return 'update'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('update:' + (e && e.message ? e.message : String(e)))
    }

    try {
      const user = getUserLayer() || { providers: {} }
      if (!user.providers || typeof user.providers !== 'object') user.providers = {}
      const prev = user.providers[provider] && typeof user.providers[provider] === 'object' ? user.providers[provider] : {}
      const nextProfile = Object.assign({}, prev, {
        apiKeyEnv: prev.apiKeyEnv || profileNow.apiKeyEnv,
        api: prev.api || profileNow.api,
        baseURL: prev.baseURL || profileNow.baseURL,
        models: models,
      })
      // 保留已有 retryPolicy，避免 replace 整层时丢掉
      if (prev.retryPolicy !== undefined) nextProfile.retryPolicy = prev.retryPolicy
      else if (profileNow.retryPolicy !== undefined) nextProfile.retryPolicy = profileNow.retryPolicy
      user.providers[provider] = nextProfile
      await ctx.settings.replace(NS, H(user), expectedRevision)
      return 'replace'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('replace:' + (e && e.message ? e.message : String(e)))
    }

    try {
      const ops = []
      const op1 = H({ op: 'set', path: ['providers', provider, 'models'], value: models })
      op1.op = 'set'
      op1.path = ['providers', String(provider), 'models']
      ops.push(op1)
      await ctx.settings.mutate(NS, ops, expectedRevision)
      return 'mutate'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('mutate:' + (e && e.message ? e.message : String(e)))
    }

    throw new Error('写回失败: ' + errors.join(' | '))
  }

  /** 官方 Models 页同款：route → ACME_GATEWAY_API_KEY */
  function deriveKeyRef(provider) {
    return String(provider).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
  }

  function validateRouteId(route) {
    const id = str(route, '').trim()
    if (!id) throw new Error('缺少 Provider ID')
    if (id.length > 64) throw new Error('Provider ID 最长 64 字符')
    if (!ROUTE_PATTERN.test(id)) throw new Error('Provider ID 需以小写字母开头，之后可用小写字母、数字和短横线')
    return id
  }

  function validateBaseURL(value) {
    const url = str(value, '').trim()
    if (!url) throw new Error('自定义提供方需要填写 API 地址（baseURL）')
    if (url.length > 2048) throw new Error('baseURL 过长')
    try {
      assertOutboundUrlAllowed(url)
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      if (/baseURL|合法 URL|http\/https|HTTPS|链路本地|云元数据|用户名/.test(msg)) throw new Error(msg.replace(/^请求 URL/, 'baseURL'))
      throw new Error('baseURL 无效: ' + msg)
    }
    return url
  }

  function validateApiKeyDraft(draft) {
    if (draft === undefined || draft === null) return ''
    if (typeof draft !== 'string') throw new Error('API Key 格式无效')
    if (draft.length === 0) return ''
    const value = draft.trim()
    if (!value) throw new Error('API Key 不能只含空白')
    if (ENV_LINE_KEY.test(value) || ((value[0] === '"' || value[0] === "'" || value[0] === '`') && value.length > 1 && value.endsWith(value[0]))) {
      throw new Error('API Key 不要粘贴 NAME=value 或带引号的整行')
    }
    if (!LEGAL_API_KEY.test(value)) throw new Error('API Key 含非法字符（仅允许可打印 ASCII，不含空格）')
    if (value.length > 4096) throw new Error('API Key 过长')
    return value
  }

  function normalizeCreateModels(raw) {
    if (!Array.isArray(raw) || !raw.length) throw new Error('自定义提供方至少需要一个模型')
    const out = []
    const seen = Object.create(null)
    for (let i = 0; i < raw.length; i++) {
      const entry = raw[i]
      const id = (entry && typeof entry === 'object' ? str(entry.id, '').trim() : str(entry, '').trim()).toLowerCase()
      if (!id) throw new Error('模型 ' + (i + 1) + ' 缺少 id')
      if (id.length > 200) throw new Error('模型 ' + (i + 1) + ' id 过长')
      const key = id.toLowerCase()
      if (seen[key]) throw new Error('模型 id 重复: ' + id)
      seen[key] = true
      const m = { id: id }
      if (entry && typeof entry === 'object') {
        if (typeof entry.name === 'string' && entry.name.trim() && entry.name.length <= 200) m.name = entry.name.trim()
        if (typeof entry.contextWindow === 'number' && Number.isFinite(entry.contextWindow) && entry.contextWindow > 0) m.contextWindow = Math.floor(entry.contextWindow)
        if (typeof entry.maxTokens === 'number' && Number.isFinite(entry.maxTokens) && entry.maxTokens > 0) m.maxTokens = Math.floor(entry.maxTokens)
        if (entry.vision === true) m.input = ['text', 'image']
        else if (Array.isArray(entry.input)) {
          const input = []
          for (const item of entry.input) {
            if (typeof item === 'string' && INPUTS.indexOf(item) >= 0 && input.indexOf(item) < 0) input.push(item)
          }
          if (input.indexOf('image') >= 0) m.input = ['text', 'image']
        }
        if (entry.reasoningEfforts === false) m.reasoningEfforts = false
        else if (entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object' && !Array.isArray(entry.reasoningEfforts)) {
          const efforts = {}
          for (const k of Object.keys(entry.reasoningEfforts)) {
            if (LEVELS.indexOf(k) < 0) continue
            const w = entry.reasoningEfforts[k]
            if (k === 'off') efforts.off = null
            else if (typeof w === 'string' && w.length <= 64) efforts[k] = w
          }
          if (Object.keys(efforts).length) m.reasoningEfforts = efforts
        }
      }
      const cloned = cloneModel(m)
      if (!cloned) throw new Error('模型 ' + (i + 1) + ' 无效')
      out.push(cloned)
    }
    return out
  }

  async function writeProviderProfile(route, profile) {
    if (!ctx.settings.writable) throw new Error('settings 只读')
    refreshHostProto()
    const errors = []
    const providersNow = asObject(readPiAi().providers)
    if (Object.prototype.hasOwnProperty.call(providersNow, route)) {
      throw new Error('已有提供方使用了这个 ID: ' + route)
    }
    const expectedRevision = readNsRevision()

    try {
      const ops = [Object.assign(H({ op: 'set', path: ['providers', route], value: profile }), {
        op: 'set',
        path: ['providers', String(route)],
        value: H(profile),
      })]
      await ctx.settings.mutate(NS, ops, expectedRevision)
      return 'mutate'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('mutate:' + (e && e.message ? e.message : String(e)))
    }

    try {
      await ctx.settings.update(NS, H({ providers: { [route]: profile } }), expectedRevision)
      return 'update'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('update:' + (e && e.message ? e.message : String(e)))
    }

    try {
      const user = getUserLayer() || { providers: {} }
      if (!user.providers || typeof user.providers !== 'object') user.providers = {}
      if (Object.prototype.hasOwnProperty.call(user.providers, route) || Object.prototype.hasOwnProperty.call(asObject(readPiAi().providers), route)) {
        throw new Error('已有提供方使用了这个 ID: ' + route)
      }
      user.providers[route] = profile
      await ctx.settings.replace(NS, H(user), expectedRevision)
      return 'replace'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('replace:' + (e && e.message ? e.message : String(e)))
    }

    throw new Error('创建提供方失败: ' + errors.join(' | '))
  }

  /** Join baseURL with /models the same way dsh-llm-pi-ai listingUrl does (prefix, not URL resolve). */
  function listingUrl(baseURL) {
    return String(baseURL).replace(/\/+$/, '') + '/models'
  }

  function capacityField() {
    for (let i = 0; i < arguments.length; i++) {
      const c = arguments[i]
      if (typeof c === 'number' && Number.isInteger(c) && c > 0) return c
    }
    return undefined
  }

  function labelField() {
    for (let i = 0; i < arguments.length; i++) {
      const c = arguments[i]
      if (typeof c === 'string' && c.length > 0 && c.length <= 200) return c
    }
    return undefined
  }

  /** Parse OpenAI-compatible { data: [...] } listing (same fields as official readListing). */
  function readOpenAiListing(body) {
    const data = body && body.data
    if (!Array.isArray(data)) throw new Error('端点模型列表没有 data 数组；请改用手填模型，或检查 baseURL/协议')
    const models = []
    const seen = Object.create(null)
    for (let i = 0; i < data.length; i++) {
      const entry = data[i]
      const rawId = labelField(entry && entry.id)
      if (!rawId) continue
      const id = rawId.toLowerCase()
      const key = id
      if (seen[key]) continue
      seen[key] = true
      const name = labelField(entry && entry.name, entry && entry.display_name)
      const contextWindow = capacityField(entry && entry.context_window, entry && entry.context_length)
      const maxTokens = capacityField(entry && entry.max_output_tokens, entry && entry.max_tokens)
      const m = { id: id }
      if (name) m.name = name
      if (contextWindow !== undefined) m.contextWindow = contextWindow
      if (maxTokens !== undefined) m.maxTokens = maxTokens
      models.push(m)
    }
    return models
  }

  /**
   * HTTP(S) request helper. Supports CONNECT proxy for non-loopback hosts when
   * HTTPS_PROXY/HTTP_PROXY is set. Returns { statusCode, text } (does not throw on HTTP error status).
   */
  function httpRequestText(url, options, redirectCount, budgetLeft) {
    const opts = options && typeof options === 'object' ? options : {}
    const method = str(opts.method, 'GET').toUpperCase() || 'GET'
    const headersIn = opts.headers && typeof opts.headers === 'object' ? opts.headers : {}
    const body = typeof opts.body === 'string' ? opts.body : ''
    const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) ? opts.timeoutMs : DISCOVER_TIMEOUT_MS
    const maxBytes = (typeof opts.maxBytes === 'number' && opts.maxBytes > 0) ? opts.maxBytes : MAX_DISCOVER_BYTES
    const rejectHttpError = opts.rejectHttpError === true
    if (typeof redirectCount !== 'number' || redirectCount < 0) redirectCount = 0
    // 整条请求链（含重定向）的绝对总截止时间：首跳起算，递归时扣掉已耗时
    const budget = (typeof budgetLeft === 'number' && budgetLeft > 0) ? budgetLeft : timeoutMs
    const hopStart = Date.now()

    return new Promise((resolve, reject) => {
      Promise.all([import('node:https'), import('node:http'), import('node:url')]).then(([httpsMod, httpMod, urlMod]) => {
        let parsed
        try {
          parsed = assertOutboundUrlAllowed(url)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
          return
        }
        const isHttps = parsed.protocol === 'https:'
        const lib = isHttps ? httpsMod : httpMod
        const targetHost = parsed.hostname
        const targetPort = parsed.port || (isHttps ? 443 : 80)
        const targetPath = parsed.pathname + (parsed.search || '')
        const isLoopback = isLoopbackHostname(targetHost)
        const proxyUrl = isLoopback
          ? ''
          : (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '')

        // 绝对截止：不论是否空闲，到点即销毁（覆盖慢滴流/挂起场景）
        const deadlineSignal = AbortSignal.timeout(budget)

        const finishResponse = (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            if (redirectCount >= MAX_REDIRECTS) {
              reject(new Error('重定向次数超限（' + MAX_REDIRECTS + '）'))
              return
            }
            if (method !== 'GET' && method !== 'HEAD') {
              reject(new Error('非 GET 请求遇到重定向（HTTP ' + res.statusCode + '），已中止'))
              return
            }
            const spent = Date.now() - hopStart
            const nextBudget = budget - spent
            if (nextBudget <= 50) {
              reject(new Error('请求超过总截止时间（' + timeoutMs + 'ms）'))
              return
            }
            let nextUrl
            try { nextUrl = new URL(res.headers.location, url).href } catch (_) {
              reject(new Error('重定向目标非法'))
              return
            }
            try {
              const nextParsed = assertOutboundUrlAllowed(nextUrl)
              if (parsed.protocol === 'https:' && nextParsed.protocol !== 'https:') {
                reject(new Error('HTTPS 请求禁止降级到 HTTP 重定向'))
                return
              }
              // 跨源重定向一律拒绝携带敏感头，防止 API Key 被 302 拐走
              if (hasSensitiveRequestHeaders(headersIn) && !sameUrlOrigin(url, nextUrl)) {
                reject(new Error('携带凭据的请求禁止跨域重定向'))
                return
              }
            } catch (e) {
              reject(e instanceof Error ? e : new Error('重定向目标非法'))
              return
            }
            httpRequestText(nextUrl, opts, redirectCount + 1, nextBudget).then(resolve, reject)
            return
          }

          const declared = Number(res.headers['content-length'])
          if (Number.isFinite(declared) && declared > maxBytes) {
            res.resume()
            reject(new Error('响应超过 ' + maxBytes + ' 字节限制'))
            return
          }
          const chunks = []
          let total = 0
          let aborted = false
          res.on('data', (c) => {
            if (aborted) return
            total += c.length
            if (total > maxBytes) {
              aborted = true
              res.destroy()
              reject(new Error('响应超过 ' + maxBytes + ' 字节限制'))
              return
            }
            chunks.push(c)
          })
          res.on('end', () => {
            if (aborted) return
            const text = Buffer.concat(chunks).toString('utf8')
            const statusCode = res.statusCode || 0
            if (rejectHttpError && (statusCode < 200 || statusCode >= 300)) {
              if (statusCode === 401 || statusCode === 403) {
                reject(new Error('端点返回 ' + statusCode + '；请检查 API Key'))
                return
              }
              reject(new Error('端点返回 HTTP ' + statusCode))
              return
            }
            resolve({ statusCode: statusCode, text: text })
          })
          res.on('error', reject)
        }

        const reqHeaders = Object.assign({
          accept: 'application/json',
          'user-agent': 'dsh-model-plus',
        }, headersIn)
        if (body && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
          reqHeaders['content-length'] = Buffer.byteLength(body)
        }

        const doRequest = (reqOpts) => {
          const req = lib.request(Object.assign({}, reqOpts, { signal: deadlineSignal }), finishResponse)
          req.on('error', (error) => {
            if (error && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR')) {
              reject(new Error('请求超过总截止时间（' + timeoutMs + 'ms）'))
              return
            }
            reject(error)
          })
          req.on('timeout', () => { req.destroy(); reject(new Error('请求超时（' + timeoutMs + 'ms）')) })
          deadlineSignal.addEventListener('abort', () => {
            req.destroy(new Error('请求超过总截止时间（' + timeoutMs + 'ms）'))
          })
          if (body) req.write(body)
          req.end()
          return req
        }

        const directOpts = {
          hostname: targetHost,
          port: targetPort,
          path: targetPath,
          method: method,
          headers: reqHeaders,
          timeout: timeoutMs,
        }

        if (!proxyUrl || !isHttps) {
          doRequest(directOpts)
          return
        }

        const proxy = urlMod.parse(proxyUrl)
        const tunnelReq = httpMod.request(Object.assign({
          hostname: proxy.hostname,
          port: proxy.port || 8080,
          method: 'CONNECT',
          path: targetHost + ':' + targetPort,
          timeout: timeoutMs,
          headers: { host: targetHost + ':' + targetPort },
        }, { signal: deadlineSignal }))
        tunnelReq.on('error', (error) => {
          if (error && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR')) {
            reject(new Error('请求超过总截止时间（' + timeoutMs + 'ms）'))
            return
          }
          reject(error)
        })
        tunnelReq.on('timeout', () => { tunnelReq.destroy(); reject(new Error('代理连接超时（' + timeoutMs + 'ms）')) })
        deadlineSignal.addEventListener('abort', () => {
          tunnelReq.destroy(new Error('请求超过总截止时间（' + timeoutMs + 'ms）'))
        })
        tunnelReq.on('connect', (proxyRes, socket) => {
          if (proxyRes.statusCode !== 200) {
            reject(new Error('代理 CONNECT 失败: HTTP ' + proxyRes.statusCode))
            return
          }
          doRequest(Object.assign({}, directOpts, { socket: socket, agent: false }))
        })
        tunnelReq.end()
      }).catch(reject)
    })
  }

  function httpGetText(url, headers, timeoutMs, maxBytes, redirectCount) {
    return httpRequestText(url, {
      method: 'GET',
      headers: headers,
      timeoutMs: timeoutMs,
      maxBytes: maxBytes,
      rejectHttpError: true,
    }, redirectCount).then((r) => r.text)
  }

  function joinEndpoint(baseURL, suffix) {
    const base = String(baseURL || '').replace(/\/+$/, '')
    const path = String(suffix || '').replace(/^\/+/, '')
    return base + '/' + path
  }

  async function resolveProviderApiKey(profile, overrideKey) {
    const draft = validateApiKeyDraft(overrideKey)
    if (draft) return draft
    const ref = str(profile && profile.apiKeyEnv, '').trim()
    if (!ref) return ''
    const credentials = ctx.get('credentials')
    if (credentials && typeof credentials.resolve === 'function') {
      try {
        const hit = await credentials.resolve(ref)
        const value = hit && typeof hit.value === 'string' ? hit.value : ''
        if (value) return validateApiKeyDraft(value)
      } catch (_) {}
    }
    try {
      const envVal = process.env[ref]
      if (typeof envVal === 'string' && envVal.trim()) return validateApiKeyDraft(envVal)
    } catch (_) {}
    return ''
  }

  function clipText(value, max) {
    const s = String(value == null ? '' : value)
    const n = typeof max === 'number' && max > 0 ? max : 2000
    if (s.length <= n) return s
    return s.slice(0, n) + '…'
  }

  function joinNonEmptyTexts(parts) {
    return (parts || []).map((p) => String(p || '').trim()).filter(Boolean).join('\n\n')
  }

  function textFromContentField(content) {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((c) => {
        if (typeof c === 'string') return c
        if (!c || typeof c !== 'object') return ''
        if (typeof c.text === 'string') return c.text
        if (typeof c.content === 'string') return c.content
        return ''
      }).filter(Boolean).join('')
    }
    return ''
  }

  /**
   * 抽取助手可见文本。DeepSeek/部分网关会把思维链放在 reasoning_content，
   * 正式答复在 content；content 为空或被 max_tokens 截断时要回退到 reasoning。
   */
  function extractAssistantText(api, body) {
    if (!body || typeof body !== 'object') return { text: '', reasoning: '', finishReason: '' }
    let text = ''
    let reasoning = ''
    let finishReason = ''

    if (api === 'anthropic-messages') {
      const content = body.content
      if (Array.isArray(content)) {
        const texts = []
        const thinks = []
        for (const block of content) {
          if (!block || typeof block !== 'object') continue
          if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
          if ((block.type === 'thinking' || block.type === 'reasoning') && typeof block.thinking === 'string') thinks.push(block.thinking)
          if ((block.type === 'thinking' || block.type === 'reasoning') && typeof block.text === 'string') thinks.push(block.text)
        }
        text = texts.join('')
        reasoning = thinks.join('\n')
      }
      finishReason = str(body.stop_reason, '')
      return {
        text: text || '',
        reasoning: reasoning || '',
        finishReason: finishReason,
        display: text || reasoning || '',
      }
    }

    if (api === 'openai-responses') {
      if (typeof body.output_text === 'string') text = body.output_text
      const output = body.output
      if (Array.isArray(output)) {
        const parts = []
        const thinks = []
        for (const item of output) {
          if (item && typeof item === 'object') {
            if (item.type === 'reasoning' && typeof item.content === 'string') thinks.push(item.content)
            if (Array.isArray(item.summary)) {
              for (const s of item.summary) {
                if (s && typeof s.text === 'string') thinks.push(s.text)
              }
            }
          }
          const content = item && item.content
          if (!Array.isArray(content)) continue
          for (const c of content) {
            if (c && typeof c === 'object') {
              if (typeof c.text === 'string') parts.push(c.text)
              else if (c.type === 'output_text' && typeof c.text === 'string') parts.push(c.text)
              else if (c.type === 'reasoning_text' && typeof c.text === 'string') thinks.push(c.text)
            }
          }
        }
        if (!text && parts.length) text = parts.join('')
        if (thinks.length) reasoning = thinks.join('\n')
      }
      finishReason = str(body.status, '')
      return {
        text: text || '',
        reasoning: reasoning || '',
        finishReason: finishReason,
        display: text || reasoning || '',
      }
    }

    // openai-completions (+ DeepSeek 兼容)
    const choices = body.choices
    if (Array.isArray(choices) && choices[0]) {
      const choice = choices[0]
      finishReason = str(choice.finish_reason, '') || str(choice.finishReason, '')
      const msg = choice.message || choice.delta || {}
      text = textFromContentField(msg.content)
      if (!text && typeof choice.text === 'string') text = choice.text
      // DeepSeek / 网关常见字段
      const reasoningCandidates = [
        msg.reasoning_content,
        msg.reasoning,
        msg.thinking,
        msg.reasoningContent,
        choice.reasoning_content,
        body.reasoning_content,
      ]
      for (const c of reasoningCandidates) {
        const t = textFromContentField(c)
        if (t) { reasoning = t; break }
      }
    }

    return {
      text: text || '',
      reasoning: reasoning || '',
      finishReason: finishReason,
      display: joinNonEmptyTexts([text, !text && reasoning ? reasoning : '']),
    }
  }

  function extractErrorMessage(body, fallback) {
    if (body && typeof body === 'object') {
      if (typeof body.error === 'string' && body.error) return body.error
      if (body.error && typeof body.error === 'object') {
        if (typeof body.error.message === 'string' && body.error.message) return body.error.message
        if (typeof body.error.code === 'string' && body.error.code) return body.error.code
      }
      if (typeof body.message === 'string' && body.message) return body.message
    }
    return fallback || '请求失败'
  }

  /**
   * 向已配置供应商发一条最小聊天请求，验证 Key / baseURL / 模型可用性。
   * 不落盘；不走 dsh-llm 会话栈。
   */
  async function testModel(args) {
    const provider = str(args && args.provider, '').trim()
    const modelId = str(args && args.modelId, '').trim()
    if (!provider) throw new Error('缺少 provider')
    if (!modelId) throw new Error('缺少 modelId')
    if (modelId.length > 200) throw new Error('modelId 过长')

    const profile = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)
    const baseURL = str(profile.baseURL, '').trim()
    if (!baseURL) throw new Error('该供应商未配置 baseURL，无法测试')
    // 校验形态（允许已存的 http/https）
    validateBaseURL(baseURL)

    const api = str(profile.api, 'openai-completions').trim() || 'openai-completions'
    if (PROTOCOLS.indexOf(api) < 0) throw new Error('不支持的 API 协议: ' + api)

    const models = getRawModels(provider)
    const model = models.find((m) => m && m.id === modelId)
    if (!model && models.length) {
      // 允许测未写入 profile.models 的 id（网关动态模型），但提示
    }

    let prompt = str(args && args.prompt, DEFAULT_TEST_PROMPT).trim() || DEFAULT_TEST_PROMPT
    if (prompt.length > 8000) throw new Error('测试提示词最长 8000 字符')
    let maxTokens = Number(args && args.maxTokens)
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = DEFAULT_TEST_MAX_TOKENS
    maxTokens = Math.min(32768, Math.max(64, Math.floor(maxTokens)))

    const effort = str(args && args.effort, '').trim()
    if (effort && LEVELS.indexOf(effort) < 0) throw new Error('无效思考强度: ' + effort)

    const apiKey = await resolveProviderApiKey(profile, args && args.apiKey)
    const started = Date.now()

    let url = ''
    let headers = { 'content-type': 'application/json', accept: 'application/json' }
    let bodyObj = null

    if (api === 'openai-completions') {
      url = joinEndpoint(baseURL, 'chat/completions')
      bodyObj = {
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        stream: false,
        temperature: 0,
      }
      if (effort && effort !== 'off') {
        // 常见 OpenAI/网关字段；不认识的服务端会忽略或报错，错误会回显
        bodyObj.reasoning_effort = effort
      }
      if (apiKey) headers.authorization = 'Bearer ' + apiKey
    } else if (api === 'openai-responses') {
      url = joinEndpoint(baseURL, 'responses')
      bodyObj = {
        model: modelId,
        input: prompt,
        max_output_tokens: maxTokens,
      }
      if (effort && effort !== 'off') bodyObj.reasoning = { effort: effort }
      if (apiKey) headers.authorization = 'Bearer ' + apiKey
    } else if (api === 'anthropic-messages') {
      url = joinEndpoint(baseURL, 'messages')
      bodyObj = {
        model: modelId,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }
      headers['anthropic-version'] = '2023-06-01'
      if (apiKey) headers['x-api-key'] = apiKey
    } else {
      throw new Error('不支持的 API 协议: ' + api)
    }

    const body = JSON.stringify(bodyObj)
    let response
    try {
      response = await httpRequestText(url, {
        method: 'POST',
        headers: headers,
        body: body,
        timeoutMs: TEST_TIMEOUT_MS,
        maxBytes: MAX_TEST_BYTES,
        rejectHttpError: false,
      })
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      throw new Error('测试请求失败: ' + msg)
    }

    const elapsedMs = Date.now() - started
    let parsed = null
    try { parsed = JSON.parse(response.text) } catch (_) { parsed = null }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errMsg = extractErrorMessage(parsed, 'HTTP ' + response.statusCode)
      return {
        ok: false,
        provider: provider,
        modelId: modelId,
        api: api,
        url: url,
        statusCode: response.statusCode,
        elapsedMs: elapsedMs,
        hasApiKey: !!apiKey,
        error: clipText(errMsg, 500),
        raw: clipText(response.text, 1200),
        message: '测试失败：HTTP ' + response.statusCode + ' · ' + clipText(errMsg, 200),
      }
    }

    const extracted = extractAssistantText(api, parsed)
    const text = extracted && extracted.text ? extracted.text : ''
    const reasoning = extracted && extracted.reasoning ? extracted.reasoning : ''
    const display = (extracted && extracted.display) || text || reasoning || ''
    const finishReason = extracted && extracted.finishReason ? extracted.finishReason : ''
    const svg = extractSvgMarkup(display) || extractSvgMarkup(text) || extractSvgMarkup(reasoning)
    const usage = parsed && parsed.usage && typeof parsed.usage === 'object' ? {
      promptTokens: Number(parsed.usage.prompt_tokens || parsed.usage.input_tokens) || undefined,
      completionTokens: Number(parsed.usage.completion_tokens || parsed.usage.output_tokens) || undefined,
      totalTokens: Number(parsed.usage.total_tokens) || undefined,
      reasoningTokens: Number(parsed.usage.completion_tokens_details && parsed.usage.completion_tokens_details.reasoning_tokens) || undefined,
    } : undefined

    const truncated = finishReason === 'length' || (usage && usage.completionTokens && usage.completionTokens >= maxTokens)
    let message = '测试成功 · ' + elapsedMs + 'ms'
    if (svg) message += ' · 已解析 SVG'
    else if (!display) message += '（响应无文本）'
    else if (!text && reasoning) message += ' · 仅有 reasoning_content'
    if (truncated) message += ' · 可能被 max_tokens 截断'

    return {
      ok: true,
      provider: provider,
      modelId: modelId,
      api: api,
      url: url,
      statusCode: response.statusCode,
      elapsedMs: elapsedMs,
      hasApiKey: !!apiKey,
      finishReason: finishReason || undefined,
      truncated: !!truncated,
      text: clipText(display || '(空响应)', 12000),
      contentText: clipText(text, 12000),
      reasoningText: clipText(reasoning, 12000),
      svg: svg || '',
      hasSvg: !!svg,
      usage: usage,
      message: message,
    }
  }

  /** 从模型回复中抽出第一个完整 <svg>...</svg>（容忍 markdown 代码围栏）。 */
  function extractSvgMarkup(text) {
    const raw = String(text || '')
    if (!raw) return ''
    let s = raw.trim()
    // 去掉 ```svg ... ``` / ``` ... ```
    const fenced = s.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i)
    if (fenced && fenced[1]) s = fenced[1].trim()
    const lower = s.toLowerCase()
    const start = lower.indexOf('<svg')
    if (start < 0) return ''
    const end = lower.lastIndexOf('</svg>')
    if (end < 0 || end < start) return ''
    const svg = s.slice(start, end + 6).trim()
    if (svg.length < 20 || svg.length > 200000) return ''
    // 粗过滤：拒绝 script / 外链事件，降低 XSS 面（仍用 sandbox iframe 渲染）
    if (/<script[\s>]/i.test(svg) || /\bon[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg)) return ''
    return svg
  }

  // ── models.dev catalog (思考强度 / 上下文补全，对齐 model-config 插件) ──
  let modelsDevCache = null
  let modelsDevCacheAt = 0
  let modelsDevInflight = null

  function positiveCatalogLimit(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
  }

  function modelRecordCandidates(catalog, id) {
    if (!catalog || typeof catalog !== 'object') return []
    const matches = []
    const raw = String(id || '').trim()
    const target = raw.toLowerCase()
    const norm = normalizeModelIdKey(raw)
    if (!target) return matches
    for (const key of Object.keys(catalog)) {
      const provider = catalog[key]
      if (!provider || typeof provider !== 'object') continue
      const models = provider.models
      if (!models || typeof models !== 'object') continue
      // models.dev 通常以 id 为 key；也扫一遍 value.id / 规范化 id 兜底
      let model = models[raw] || models[target] || (norm ? models[norm] : undefined)
      if (!model) {
        for (const mk of Object.keys(models)) {
          const m = models[mk]
          if (!m || typeof m !== 'object') continue
          const mkLower = mk.toLowerCase()
          const mid = String(m.id || mk).toLowerCase()
          if (mkLower === target || mid === target || normalizeModelIdKey(mk) === norm || normalizeModelIdKey(m.id || mk) === norm) {
            model = m
            break
          }
        }
      }
      if (model && typeof model === 'object') {
        matches.push({
          provider: Object.assign({}, provider, { id: provider.id || key }),
          model: model,
        })
      }
    }
    return matches
  }

  function modelMetadataFingerprint(model) {
    const limit = model && model.limit && typeof model.limit === 'object' ? model.limit : {}
    const modalities = model && model.modalities && typeof model.modalities === 'object' ? model.modalities : {}
    return JSON.stringify({
      context: positiveCatalogLimit(limit.context),
      output: positiveCatalogLimit(limit.output),
      input: Array.isArray(modalities.input)
        ? modalities.input.filter((v) => v === 'text' || v === 'image')
        : [],
      reasoning: model && model.reasoning === false ? false : (model && model.reasoning_options),
    })
  }

  function catalogModelForEndpoint(catalog, id, baseURL, api) {
    const candidates = modelRecordCandidates(catalog, id)
    if (!candidates.length) {
      // 二次：宽松匹配（去前缀 vendor/、去 :tag、子串）
      const loose = modelRecordCandidatesLoose(catalog, id)
      if (!loose.length) return undefined
      return pickCatalogCandidate(loose, id, baseURL, api)
    }
    return pickCatalogCandidate(candidates, id, baseURL, api)
  }

  /** 网关 id 常带 vendor 前缀或后缀 tag，如 deepseek/deepseek-v4-flash、xxx:thinking */
  function normalizeModelIdKey(id) {
    let s = String(id || '').trim().toLowerCase()
    if (!s) return ''
    // 去掉 query/fragment 残留
    s = s.split('?')[0].split('#')[0]
    // 去 :tag / @tag
    s = s.replace(/[:@][a-z0-9._-]+$/i, '')
    // 取最后一段 path（openrouter 风格 vendor/model）
    if (s.indexOf('/') >= 0) {
      const parts = s.split('/').filter(Boolean)
      s = parts[parts.length - 1] || s
    }
    return s
  }

  function modelRecordCandidatesLoose(catalog, id) {
    if (!catalog || typeof catalog !== 'object') return []
    const target = normalizeModelIdKey(id)
    if (!target || target.length < 2) return []
    const matches = []
    for (const key of Object.keys(catalog)) {
      const provider = catalog[key]
      if (!provider || typeof provider !== 'object') continue
      const models = provider.models
      if (!models || typeof models !== 'object') continue
      for (const mk of Object.keys(models)) {
        const m = models[mk]
        if (!m || typeof m !== 'object') continue
        const mid = normalizeModelIdKey(m.id || mk)
        if (!mid) continue
        if (mid === target || mk.toLowerCase() === target || String(m.id || '').toLowerCase() === String(id || '').toLowerCase()) {
          matches.push({
            provider: Object.assign({}, provider, { id: provider.id || key }),
            model: m,
            matchKey: mk,
          })
        }
      }
    }
    return matches
  }

  const PRIMARY_CATALOG_PROVIDERS = {
    deepseek: 100,
    openai: 90,
    anthropic: 90,
    google: 80,
    gemini: 80,
    xai: 70,
    mistral: 70,
    moonshotai: 70,
    moonshot: 70,
    qwen: 60,
    alibaba: 60,
    meta: 50,
    openrouter: 20,
  }

  function providerPreferScore(provider, modelId, hostname) {
    const pid = str(provider && provider.id, '').toLowerCase()
    let score = 0
    if (PRIMARY_CATALOG_PROVIDERS[pid] != null) score += PRIMARY_CATALOG_PROVIDERS[pid]
    // 主机名包含 provider id（官方域名/反代）
    if (pid && hostname && hostname.indexOf(pid) >= 0) score += 50
    // 模型 id 前缀暗示 vendor：deepseek-xxx
    const nid = normalizeModelIdKey(modelId)
    if (pid && nid.indexOf(pid) === 0) score += 40
    // 记录越完整越好
    return score
  }

  function metadataRichness(model) {
    if (!model || typeof model !== 'object') return 0
    let n = 0
    const limit = model.limit && typeof model.limit === 'object' ? model.limit : {}
    if (positiveCatalogLimit(limit.context)) n += 2
    if (positiveCatalogLimit(limit.output)) n += 2
    const modalities = model.modalities && typeof model.modalities === 'object' ? model.modalities : {}
    if (Array.isArray(modalities.input) && modalities.input.length) n += 1
    if (model.reasoning === false || Array.isArray(model.reasoning_options)) n += 2
    if (typeof model.name === 'string' && model.name) n += 1
    return n
  }

  function pickCatalogCandidate(candidates, id, baseURL, api) {
    if (!candidates || !candidates.length) return undefined
    if (candidates.length === 1) return candidates[0].model

    let hostname = ''
    try { hostname = new URL(baseURL || '').hostname.toLowerCase() } catch (_) {}

    // 1) 主机名命中
    const hostMatch = candidates.find(({ provider }) => {
      const pid = str(provider && provider.id, '').toLowerCase()
      return pid && hostname && hostname.indexOf(pid) >= 0
    })
    if (hostMatch) return hostMatch.model

    // 2) 协议暗示的官方厂
    const canonicalProvider = api === 'openai-responses'
      ? 'openai'
      : api === 'anthropic-messages'
        ? 'anthropic'
        : undefined
    if (canonicalProvider) {
      const canonical = candidates.find(({ provider }) => str(provider && provider.id, '') === canonicalProvider)
      if (canonical) return canonical.model
    }

    // 3) 指纹完全一致 → 任意一个
    const fingerprints = new Set(candidates.map(({ model }) => modelMetadataFingerprint(model)))
    if (fingerprints.size === 1) return candidates[0].model

    // 4) 多数指纹
    const fpCount = Object.create(null)
    for (const c of candidates) {
      const fp = modelMetadataFingerprint(c.model)
      fpCount[fp] = (fpCount[fp] || 0) + 1
    }
    let bestFp = ''
    let bestFpN = 0
    for (const fp of Object.keys(fpCount)) {
      if (fpCount[fp] > bestFpN) { bestFpN = fpCount[fp]; bestFp = fp }
    }
    if (bestFpN >= 2 && bestFpN > candidates.length / 2) {
      const maj = candidates.find((c) => modelMetadataFingerprint(c.model) === bestFp)
      if (maj) return maj.model
    }

    // 5) 按官方 provider 优先 + 元数据完整度打分（网关多副本时不再直接放弃）
    let best = candidates[0]
    let bestScore = -1
    for (const c of candidates) {
      const score = providerPreferScore(c.provider, id, hostname) * 10 + metadataRichness(c.model)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    return best && best.model
  }

  function reasoningEffortsFromCatalog(model) {
    if (!model || typeof model !== 'object') return undefined
    if (model.reasoning === false) return false
    const options = Array.isArray(model.reasoning_options) ? model.reasoning_options : []
    const effort = options.find((option) => option && typeof option === 'object' && option.type === 'effort')
    if (!effort || !Array.isArray(effort.values)) return undefined
    const result = {}
    for (const value of effort.values) {
      if (value === 'none' || value === 'off') result.off = null
      else if (typeof value === 'string' && LEVELS.indexOf(value) >= 0) result[value] = value
    }
    return Object.keys(result).some((level) => level !== 'off') ? result : undefined
  }

  /**
   * 用 models.dev 记录补全候选模型的 name / context / maxTokens / input / reasoningEfforts。
   * 只补缺失字段（与参考插件 enrichDiscoveredModel 一致）。
   */
  function enrichModelFromCatalog(candidate, catalog, baseURL, api) {
    const base = candidate && typeof candidate === 'object' ? Object.assign({}, candidate) : { id: '' }
    if (!base.id) return base
    const record = catalogModelForEndpoint(catalog, base.id, baseURL, api)
    if (!record) return Object.assign({}, base, { catalogHit: false })
    const limit = record.limit && typeof record.limit === 'object' ? record.limit : {}
    const modalities = record.modalities && typeof record.modalities === 'object' ? record.modalities : {}
    const input = Array.isArray(modalities.input)
      ? modalities.input.filter((v) => v === 'text' || v === 'image')
      : []
    const reasoningEfforts = reasoningEffortsFromCatalog(record)
    const filled = []
    if (!base.name && typeof record.name === 'string' && record.name) {
      base.name = record.name
      filled.push('name')
    }
    if (base.contextWindow === undefined || base.contextWindow === null || !(base.contextWindow > 0)) {
      const ctx = positiveCatalogLimit(limit.context)
      if (ctx !== undefined) { base.contextWindow = ctx; filled.push('contextWindow') }
    }
    if (base.maxTokens === undefined || base.maxTokens === null || !(base.maxTokens > 0)) {
      const out = positiveCatalogLimit(limit.output)
      if (out !== undefined) { base.maxTokens = out; filled.push('maxTokens') }
    }
    if (!Array.isArray(base.input) || !base.input.length) {
      if (input.length) { base.input = input.slice(); filled.push('input') }
    }
    if (!Object.prototype.hasOwnProperty.call(base, 'reasoningEfforts') && reasoningEfforts !== undefined) {
      base.reasoningEfforts = reasoningEfforts === false ? false : Object.assign({}, reasoningEfforts)
      filled.push('reasoningEfforts')
    }
    base.catalogHit = true
    base.catalogFilled = filled
    return base
  }

  function resolveCatalogUrl(value) {
    const raw = migrateCatalogUrl(str(value, '').trim())
    if (!raw) return MODELS_DEV_URL
    return validateModelsUrl(raw)
  }

  function readCatalogUrl() {
    const plus = readPlus()
    const stored = str(plus.modelsDevUrl, '') || str(plus.modelsUrl, '') || str(plus.indexUrl, '')
    // 旧 GitHub raw models.json 已 404：读到即视为默认 models.dev
    return resolveCatalogUrl(stored || MODELS_DEV_URL)
  }

  /** 启动/读写偏好时把旧同步地址就地迁到 models.dev（best-effort，不阻塞请求）。 */
  function maybeMigrateLegacyCatalogPrefs() {
    try {
      const plus = readPlus()
      const current = str(plus.modelsDevUrl, '') || str(plus.modelsUrl, '') || str(plus.indexUrl, '')
      if (!isLegacyModelsUrl(current)) return
      // fire-and-forget；失败不影响本次读路径
      savePlusPrefs({
        modelsDevUrl: MODELS_DEV_URL,
        modelsUrl: MODELS_DEV_URL,
        indexUrl: MODELS_DEV_URL,
        migratedFromLegacyModelsUrl: true,
      }).catch(() => {})
    } catch (_) {}
  }

  // cacheKey = catalog URL；切换自定义地址时不复用旧缓存
  async function loadModelsDevCatalog(force, catalogUrl) {
    const url = resolveCatalogUrl(catalogUrl || readCatalogUrl())
    const now = Date.now()
    if (!force && modelsDevCache && modelsDevCache.__url === url && (now - modelsDevCacheAt) < 30 * 60 * 1000) {
      return modelsDevCache
    }
    if (!force && modelsDevInflight && modelsDevInflight.__url === url) return modelsDevInflight
    const job = (async () => {
      const text = await httpGetText(url, {
        accept: 'application/json',
      }, MODELS_DEV_TIMEOUT_MS, MAX_MODELS_DEV_BYTES, 0)
      let data
      try { data = JSON.parse(text) } catch (_) {
        throw new Error('目录返回非 JSON：' + url)
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('目录格式无效（需为对象）：' + url)
      }
      // 标记来源 URL，便于缓存命中判断
      try { Object.defineProperty(data, '__url', { value: url, enumerable: false }) } catch (_) { data.__url = url }
      modelsDevCache = data
      modelsDevCacheAt = Date.now()
      return data
    })()
    try { job.__url = url } catch (_) {}
    modelsDevInflight = job
    try {
      return await modelsDevInflight
    } finally {
      if (modelsDevInflight === job) modelsDevInflight = null
    }
  }

  async function enrichModelsList(models, baseURL, api, options) {
    const opts = options || {}
    const enrich = opts.enrich !== false
    if (!enrich || !Array.isArray(models) || !models.length) {
      return { models: models || [], catalogApplied: false, catalogError: '', enrichedCount: 0 }
    }
    try {
      const catalog = await loadModelsDevCatalog(!!opts.forceCatalog, opts.catalogUrl)
      let enrichedCount = 0
      const next = models.map((m) => {
        const e = enrichModelFromCatalog(m, catalog, baseURL, api)
        if (e.catalogHit && e.catalogFilled && e.catalogFilled.length) enrichedCount += 1
        // 去掉仅供调试的临时字段，避免写进 settings
        const out = Object.assign({}, e)
        delete out.catalogHit
        delete out.catalogFilled
        return out
      })
      return {
        models: next,
        catalogApplied: true,
        catalogError: '',
        enrichedCount: enrichedCount,
      }
    } catch (e) {
      return {
        models: models,
        catalogApplied: false,
        catalogError: e && e.message ? e.message : String(e),
        enrichedCount: 0,
      }
    }
  }

  /**
   * 官方 Models 页「获取模型」同款：按草稿 baseURL/api/apiKey 探测端点 /models。
   * 默认再用 models.dev 补全缺失的思考强度/上下文/视觉（参考 model-config 插件）。
   * 不写 settings；仅返回候选列表供添加表单勾选。
   */
  async function discoverModels(args) {
    const baseURL = validateBaseURL(args && args.baseURL)
    const api = str(args && args.api, 'openai-completions').trim() || 'openai-completions'
    if (PROTOCOLS.indexOf(api) < 0) throw new Error('不支持的 API 协议: ' + api)
    if (LISTABLE_PROTOCOLS.indexOf(api) < 0) {
      throw new Error('协议「' + api + '」不支持自动获取模型列表，请手填模型 id')
    }
    const apiKey = validateApiKeyDraft(args && args.apiKey)
    const url = listingUrl(baseURL)
    const headers = {}
    if (apiKey) headers.authorization = 'Bearer ' + apiKey
    let text
    try {
      text = await httpGetText(url, headers, DISCOVER_TIMEOUT_MS, MAX_DISCOVER_BYTES, 0)
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      if (/请求超时|总截止时间|端点返回|API Key|字节限制|重定向|代理/.test(msg)) throw e
      throw new Error('无法访问模型列表: ' + msg)
    }
    let body
    try {
      body = JSON.parse(text)
    } catch (_) {
      throw new Error('端点未返回 JSON 模型列表')
    }
    let models = readOpenAiListing(body)
    if (!models.length) throw new Error('端点未返回可用模型（data 为空）')
    const enrich = args && args.enrich === false ? false : true
    const enriched = await enrichModelsList(models, baseURL, api, { enrich: enrich })
    models = enriched.models
    let message = '已获取 ' + models.length + ' 个模型'
    if (enriched.catalogApplied && enriched.enrichedCount) {
      message += '，models.dev 补全 ' + enriched.enrichedCount + ' 个'
    } else if (enriched.catalogError) {
      message += '（models.dev 不可用：' + clipText(enriched.catalogError, 80) + '）'
    }
    return {
      ok: true,
      url: url,
      api: api,
      models: models,
      count: models.length,
      catalogApplied: enriched.catalogApplied,
      catalogError: enriched.catalogError || undefined,
      enrichedCount: enriched.enrichedCount,
      message: message,
    }
  }

  /**
   * 对已配置供应商拉 /models，标记本地已有 / 新增，供 UI 勾选后合并写入。
   * 对齐官方 Models 页：候选列表 + 默认勾选「本地还没有的」。
   */
  async function refreshProviderModels(args) {
    const provider = str(args && args.provider, '').trim()
    if (!provider) throw new Error('缺少 provider')
    const profile = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)
    const baseURL = str(profile.baseURL, '').trim()
    if (!baseURL) throw new Error('该供应商未配置 baseURL，无法更新模型列表')
    const api = str(profile.api, 'openai-completions').trim() || 'openai-completions'
    if (LISTABLE_PROTOCOLS.indexOf(api) < 0) {
      throw new Error('协议「' + api + '」不支持自动获取模型列表')
    }

    // 优先用草稿 key（若传入），否则读已存 credentials/env
    let apiKey = ''
    if (args && args.apiKey !== undefined && args.apiKey !== null && String(args.apiKey).length) {
      apiKey = validateApiKeyDraft(args.apiKey)
    } else {
      apiKey = await resolveProviderApiKey(profile, '')
    }

    const discovered = await discoverModels({
      baseURL: baseURL,
      api: api,
      apiKey: apiKey,
      enrich: args && args.enrich === false ? false : true,
    })

    const existing = getRawModels(provider)
    const existingSet = Object.create(null)
    for (const m of existing) {
      if (m && m.id) existingSet[String(m.id).toLowerCase()] = true
    }

    const candidates = []
    let newCount = 0
    let knownCount = 0
    for (const m of (discovered.models || [])) {
      if (!m || !m.id) continue
      const isNew = !existingSet[String(m.id).toLowerCase()]
      if (isNew) newCount += 1
      else knownCount += 1
      candidates.push(Object.assign({}, m, { isNew: isNew }))
    }

    return {
      ok: true,
      provider: provider,
      baseURL: baseURL,
      api: api,
      url: discovered.url,
      existingCount: existing.length,
      count: candidates.length,
      newCount: newCount,
      knownCount: knownCount,
      candidates: candidates,
      catalogApplied: discovered.catalogApplied,
      catalogError: discovered.catalogError,
      enrichedCount: discovered.enrichedCount,
      message: newCount
        ? ('发现 ' + candidates.length + ' 个模型，其中新增 ' + newCount + ' 个（已有 ' + knownCount + '）')
        : ('发现 ' + candidates.length + ' 个模型，无新增（本地已有 ' + existing.length + '）'),
    }
  }

  /**
   * 把勾选的模型合并进已有供应商 models：已有 id 保留本地配置，只追加新增。
   */
  async function addProviderModels(args) {
    const provider = str(args && args.provider, '').trim()
    if (!provider) throw new Error('缺少 provider')
    if (!ctx.settings.writable) throw new Error('settings 只读')
    const profile = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)

    const incoming = normalizeCreateModels(args && args.models)
    const existing = getRawModels(provider)
    const byId = Object.create(null)
    const next = []
    for (const m of existing) {
      if (!m || !m.id) continue
      const key = String(m.id).toLowerCase()
      byId[key] = true
      next.push(m)
    }
    const added = []
    for (const m of incoming) {
      const key = String(m.id).toLowerCase()
      if (byId[key]) continue
      byId[key] = true
      next.push(m)
      added.push(m.id)
    }
    if (!added.length) {
      return {
        ok: true,
        skipped: true,
        provider: provider,
        addedCount: 0,
        added: [],
        localCount: existing.length,
        message: '没有可新增的模型（所选 id 均已存在）',
        providers: listProviders(),
      }
    }
    const via = await writeModels(provider, next)
    return {
      ok: true,
      skipped: false,
      provider: provider,
      addedCount: added.length,
      added: added,
      localCount: next.length,
      via: via,
      message: '已新增 ' + added.length + ' 个模型到 ' + provider + '（via ' + via + '）',
      providers: listProviders(),
      models: next.map(modelView),
    }
  }

  /**
   * 对已配置供应商的本地模型，用 models.dev 补全缺失的思考强度/上下文/视觉，并可写回。
   */
  async function enrichProviderModels(args) {
    const provider = str(args && args.provider, '').trim()
    if (!provider) throw new Error('缺少 provider')
    const profile = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)
    const baseURL = str(profile.baseURL, '')
    const api = str(profile.api, 'openai-completions') || 'openai-completions'
    const overwrite = !!(args && args.overwrite === true)
    const apply = args && args.apply === false ? false : true
    const catalogUrl = resolveCatalogUrl(args && (args.catalogUrl || args.modelsDevUrl || args.modelsUrl))
    const existing = getRawModels(provider)
    if (!existing.length) throw new Error('当前供应商没有模型')

    let catalog
    try {
      catalog = await loadModelsDevCatalog(!!(args && args.forceCatalog), catalogUrl)
    } catch (e) {
      throw new Error('无法加载目录：' + (e && e.message ? e.message : String(e)))
    }

    const changes = []
    const nextModels = []
    let hitCount = 0
    for (const m of existing) {
      const local = cloneModel(m) || { id: m.id }
      const record = catalogModelForEndpoint(catalog, local.id, baseURL, api)
      if (!record) {
        nextModels.push(local)
        continue
      }
      hitCount += 1
      // 构造“远程”补丁形态，复用 applyRemoteToLocal 的缺省/覆盖语义
      const limit = record.limit && typeof record.limit === 'object' ? record.limit : {}
      const modalities = record.modalities && typeof record.modalities === 'object' ? record.modalities : {}
      const input = Array.isArray(modalities.input)
        ? modalities.input.filter((v) => v === 'text' || v === 'image')
        : []
      const remote = { id: local.id }
      if (typeof record.name === 'string' && record.name) remote.name = record.name
      const ctx = positiveCatalogLimit(limit.context)
      const out = positiveCatalogLimit(limit.output)
      if (ctx !== undefined) remote.contextWindow = ctx
      if (out !== undefined) remote.maxTokens = out
      if (input.length) remote.input = input
      const efforts = reasoningEffortsFromCatalog(record)
      if (efforts !== undefined) remote.reasoningEfforts = efforts

      // name 单独补
      let nameChanged = false
      if (remote.name && (overwrite || !local.name)) {
        if (local.name !== remote.name) {
          local.name = remote.name
          nameChanged = true
        }
      }
      const applied = applyRemoteToLocal(local, remote, overwrite, true)
      if (nameChanged && applied.notes) applied.notes = (applied.notes ? applied.notes + ',' : '') + '名称'
      else if (nameChanged) applied.notes = '名称'
      if (nameChanged) applied.changed = true
      applied.model = applied.model || local
      if (nameChanged && applied.model.name !== remote.name) applied.model.name = remote.name

      nextModels.push(applied.model)
      if (applied.changed) {
        changes.push({
          id: local.id,
          notes: applied.notes,
          summary: effortSummary(applied.model),
          vision: hasVision(applied.model),
          contextWindow: typeof applied.model.contextWindow === 'number' ? applied.model.contextWindow : 0,
          maxTokens: typeof applied.model.maxTokens === 'number' ? applied.model.maxTokens : 0,
          matchedBy: 'models.dev',
        })
      }
    }

    let via = ''
    if (apply && changes.length) {
      via = await writeModels(provider, nextModels)
    }

    const sampleIds = existing.slice(0, 5).map((m) => m.id).filter(Boolean)
    let message = ''
    if (changes.length) {
      message = (apply ? '已从 models.dev 写回 ' : '可从 models.dev 补全 ')
        + changes.length + ' 个模型（命中 ' + hitCount + '/' + existing.length + '）'
    } else if (hitCount) {
      message = 'models.dev 命中 ' + hitCount + ' 个，但无需补全（已有字段'
        + (overwrite ? '' : '，可开覆盖') + '）'
    } else {
      message = 'models.dev 未命中当前任一模型 id（本地示例：'
        + (sampleIds.join(', ') || '无')
        + '）。已支持去前缀/去 :tag 匹配；若仍为 0，多半是自定义网关私有 id，需手填或改 id 与公开目录一致。'
    }
    return {
      ok: true,
      provider: provider,
      catalogUrl: catalogUrl,
      hitCount: hitCount,
      changeCount: changes.length,
      localCount: existing.length,
      applied: apply && changes.length > 0,
      via: via || undefined,
      changes: changes,
      sampleIds: sampleIds,
      models: apply ? nextModels.map(modelView) : undefined,
      message: message,
    }
  }

  async function saveCatalogUrl(args) {
    const catalogUrl = resolveCatalogUrl(args && (args.catalogUrl || args.modelsDevUrl || args.modelsUrl))
    await savePlusPrefs({ modelsDevUrl: catalogUrl, modelsUrl: catalogUrl, indexUrl: catalogUrl })
    // 清缓存，下次按新地址拉
    modelsDevCache = null
    modelsDevCacheAt = 0
    return {
      ok: true,
      catalogUrl: catalogUrl,
      modelsDevUrl: catalogUrl,
      message: '已保存目录地址',
    }
  }

  /**
   * 写入/清除供应商 retryPolicy（llm-pi-ai.providers.<id>.retryPolicy）。
   * 形态：{ mode: 'normal', maxRetries: N } 或 clear 回平台默认。
   */
  async function saveProviderRetry(args) {
    const provider = str(args && args.provider, '').trim()
    if (!provider) throw new Error('缺少 provider')
    if (!ctx.settings.writable) throw new Error('settings 只读')
    const profile = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)

    const norm = normalizeRetryPolicyInput(args || {})
    refreshHostProto()
    const errors = []
    const expectedRevision = readNsRevision()

    if (norm.clear) {
      try {
        const op = Object.assign(H({ op: 'unset', path: ['providers', provider, 'retryPolicy'] }), {
          op: 'unset',
          path: ['providers', String(provider), 'retryPolicy'],
        })
        await ctx.settings.mutate(NS, [op], expectedRevision)
        return {
          ok: true,
          provider: provider,
          cleared: true,
          retryConfigured: false,
          retryMaxRetries: null,
          retryMode: '',
          message: '已清除 ' + provider + ' 的 retryPolicy（回平台默认）',
          providers: listProviders(),
        }
      } catch (e) {
        if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
        errors.push('mutate-unset:' + (e && e.message ? e.message : String(e)))
      }
      try {
        const user = getUserLayer() || { providers: {} }
        if (!user.providers || typeof user.providers !== 'object') user.providers = {}
        const prev = user.providers[provider] && typeof user.providers[provider] === 'object' ? user.providers[provider] : {}
        const next = Object.assign({}, prev)
        delete next.retryPolicy
        user.providers[provider] = next
        await ctx.settings.replace(NS, H(user), expectedRevision)
        return {
          ok: true,
          provider: provider,
          cleared: true,
          retryConfigured: false,
          retryMaxRetries: null,
          retryMode: '',
          message: '已清除 ' + provider + ' 的 retryPolicy（via replace）',
          providers: listProviders(),
        }
      } catch (e) {
        if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
        errors.push('replace-unset:' + (e && e.message ? e.message : String(e)))
      }
      throw new Error('清除 retryPolicy 失败: ' + errors.join(' | '))
    }

    const value = norm.value
    try {
      const op = Object.assign(H({ op: 'set', path: ['providers', provider, 'retryPolicy'], value: value }), {
        op: 'set',
        path: ['providers', String(provider), 'retryPolicy'],
        value: H(value),
      })
      await ctx.settings.mutate(NS, [op], expectedRevision)
      const view = readRetryPolicyView({ retryPolicy: value })
      return {
        ok: true,
        provider: provider,
        cleared: false,
        retryConfigured: true,
        retryMode: view.mode,
        retryMaxRetries: view.maxRetries,
        retryLabel: view.label,
        message: '已设置 ' + provider + ' 重试：' + view.label,
        providers: listProviders(),
      }
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('mutate:' + (e && e.message ? e.message : String(e)))
    }

    try {
      await ctx.settings.update(NS, H({ providers: { [provider]: { retryPolicy: value } } }), expectedRevision)
      const view = readRetryPolicyView({ retryPolicy: value })
      return {
        ok: true,
        provider: provider,
        cleared: false,
        retryConfigured: true,
        retryMode: view.mode,
        retryMaxRetries: view.maxRetries,
        retryLabel: view.label,
        message: '已设置 ' + provider + ' 重试：' + view.label + '（via update）',
        providers: listProviders(),
      }
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('update:' + (e && e.message ? e.message : String(e)))
    }

    try {
      const user = getUserLayer() || { providers: {} }
      if (!user.providers || typeof user.providers !== 'object') user.providers = {}
      const prev = user.providers[provider] && typeof user.providers[provider] === 'object' ? user.providers[provider] : Object.assign({}, profile)
      user.providers[provider] = Object.assign({}, prev, { retryPolicy: value })
      await ctx.settings.replace(NS, H(user), expectedRevision)
      const view = readRetryPolicyView({ retryPolicy: value })
      return {
        ok: true,
        provider: provider,
        cleared: false,
        retryConfigured: true,
        retryMode: view.mode,
        retryMaxRetries: view.maxRetries,
        retryLabel: view.label,
        message: '已设置 ' + provider + ' 重试：' + view.label + '（via replace）',
        providers: listProviders(),
      }
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('replace:' + (e && e.message ? e.message : String(e)))
    }

    throw new Error('保存 retryPolicy 失败: ' + errors.join(' | '))
  }

  /**
   * 编辑已有供应商：displayName / baseURL / api / API Key / maxRetries。
   * 不改 Provider ID，不碰 models 列表。
   */
  async function saveProvider(args) {
    const provider = str(args && args.provider, '').trim()
    if (!provider) throw new Error('缺少 provider')
    if (!ctx.settings.writable) throw new Error('settings 只读')
    const current = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(current).length) throw new Error('供应商未配置: ' + provider)

    const displayName = str(args && args.displayName, '').trim()
    if (displayName.length > 200) throw new Error('显示名称过长')

    const hasBaseURL = args && Object.prototype.hasOwnProperty.call(args, 'baseURL')
    const baseURL = hasBaseURL ? validateBaseURL(args.baseURL) : str(current.baseURL, '')

    const hasApi = args && Object.prototype.hasOwnProperty.call(args, 'api')
    const api = hasApi
      ? (str(args.api, 'openai-completions').trim() || 'openai-completions')
      : (str(current.api, 'openai-completions').trim() || 'openai-completions')
    if (PROTOCOLS.indexOf(api) < 0) throw new Error('不支持的 API 协议: ' + api)

    // 合并 profile：保留 models / retryPolicy / apiKeyEnv / 其它字段
    const next = Object.assign({}, current, {
      api: api,
    })
    if (baseURL) next.baseURL = baseURL
    else delete next.baseURL

    if (displayName) next.displayName = displayName
    else delete next.displayName

    // 可选更新重试
    if (args && (Object.prototype.hasOwnProperty.call(args, 'maxRetries') || args.clearRetry === true || args.retryPolicy)) {
      const retryNorm = normalizeRetryPolicyInput(args.clearRetry === true
        ? { clear: true }
        : { mode: 'normal', maxRetries: args.maxRetries, retryPolicy: args.retryPolicy })
      if (retryNorm.clear) delete next.retryPolicy
      else next.retryPolicy = retryNorm.value
    }

    // API Key：有新值才写 credentials；并确保 apiKeyEnv 存在
    const apiKey = validateApiKeyDraft(args && args.apiKey)
    const keyRefExisting = str(current.apiKeyEnv, '').trim()
    const keyRef = keyRefExisting || deriveKeyRef(provider)
    let keyStored = false
    let keyWarning = ''
    if (apiKey) {
      next.apiKeyEnv = keyRef
      const credentials = ctx.get('credentials')
      if (!credentials || typeof credentials.set !== 'function') {
        keyWarning = '供应商已更新，但当前环境无 credentials 服务，API Key 未写入；可设置环境变量 ' + keyRef
      } else {
        try {
          await credentials.set(keyRef, apiKey)
          keyStored = true
        } catch (e) {
          keyWarning = '供应商已更新，但 API Key 写入失败: ' + (e && e.message ? e.message : String(e))
        }
      }
    } else if (keyRefExisting) {
      next.apiKeyEnv = keyRefExisting
    }

    refreshHostProto()
    const errors = []
    let via = ''
    const expectedRevision = readNsRevision()

    try {
      const op = Object.assign(H({ op: 'set', path: ['providers', provider], value: next }), {
        op: 'set',
        path: ['providers', String(provider)],
        value: H(next),
      })
      await ctx.settings.mutate(NS, [op], expectedRevision)
      via = 'mutate'
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
      errors.push('mutate:' + (e && e.message ? e.message : String(e)))
      try {
        await ctx.settings.update(NS, H({ providers: { [provider]: next } }), expectedRevision)
        via = 'update'
      } catch (e2) {
        if (isSettingsConflictError(e2)) throw new Error('配置已被其他操作更新，请刷新后重试')
        errors.push('update:' + (e2 && e2.message ? e2.message : String(e2)))
        try {
          const user = getUserLayer() || { providers: {} }
          if (!user.providers || typeof user.providers !== 'object') user.providers = {}
          const prev = user.providers[provider] && typeof user.providers[provider] === 'object'
            ? user.providers[provider]
            : {}
          user.providers[provider] = Object.assign({}, prev, next)
          await ctx.settings.replace(NS, H(user), expectedRevision)
          via = 'replace'
        } catch (e3) {
          if (isSettingsConflictError(e3)) throw new Error('配置已被其他操作更新，请刷新后重试')
          errors.push('replace:' + (e3 && e3.message ? e3.message : String(e3)))
          throw new Error('保存供应商失败: ' + errors.join(' | '))
        }
      }
    }

    const retry = readRetryPolicyView(next)
    return {
      ok: true,
      provider: provider,
      displayName: displayName || provider,
      baseURL: str(next.baseURL, ''),
      api: api,
      apiKeyEnv: str(next.apiKeyEnv, ''),
      keyStored: keyStored,
      retryConfigured: retry.configured,
      retryMaxRetries: retry.maxRetries,
      retryEffectiveMaxRetries: retry.effectiveMaxRetries,
      retryLabel: retry.label,
      via: via,
      message: keyWarning
        ? ('已保存供应商 ' + provider + '（via ' + via + '）。' + keyWarning)
        : ('已保存供应商 ' + provider
          + (keyStored ? '（已更新 API Key）' : '')
          + ' · 重试 ' + retry.label
          + ' · via ' + via),
      warning: keyWarning || undefined,
      providers: listProviders(),
    }
  }

  async function addProvider(args) {
    const route = validateRouteId(args && args.route)
    const displayName = str(args && args.displayName, '').trim()
    if (displayName.length > 200) throw new Error('显示名称过长')
    const baseURL = validateBaseURL(args && args.baseURL)
    const api = str(args && args.api, 'openai-completions').trim() || 'openai-completions'
    if (PROTOCOLS.indexOf(api) < 0) throw new Error('不支持的 API 协议: ' + api + '（可选 ' + PROTOCOLS.join(', ') + '）')
    let modelsInput = args && args.models
    // 未手填模型时：若协议可探测，则默认拉一次 /models（对齐官方「获取模型」）
    if ((!Array.isArray(modelsInput) || !modelsInput.length) && LISTABLE_PROTOCOLS.indexOf(api) >= 0) {
      const discovered = await discoverModels({
        baseURL: baseURL,
        api: api,
        apiKey: args && args.apiKey,
      })
      modelsInput = discovered.models
    }
    const models = normalizeCreateModels(modelsInput)
    const apiKey = validateApiKeyDraft(args && args.apiKey)
    const storesKey = apiKey.length > 0
    const keyRef = deriveKeyRef(route)

    // 再读一次合并视图，避免与官方页并发创建撞车
    if (Object.prototype.hasOwnProperty.call(asObject(readPiAi().providers), route)) {
      throw new Error('已有提供方使用了这个 ID: ' + route)
    }

    const profile = {
      api: api,
      baseURL: baseURL,
      models: models,
    }
    if (displayName) profile.displayName = displayName
    if (storesKey) profile.apiKeyEnv = keyRef
    // 默认重试：与用户配置示例一致 mode:normal + maxRetries
    let retryMax = args && args.maxRetries
    if (retryMax === undefined || retryMax === null || retryMax === '') retryMax = DEFAULT_PROVIDER_MAX_RETRIES
    const retryNorm = normalizeRetryPolicyInput({ mode: 'normal', maxRetries: retryMax })
    if (!retryNorm.clear) profile.retryPolicy = retryNorm.value

    const via = await writeProviderProfile(route, profile)

    let keyStored = false
    let keyWarning = ''
    if (storesKey) {
      const credentials = ctx.get('credentials')
      if (!credentials || typeof credentials.set !== 'function') {
        keyWarning = '提供方已创建，但当前环境无 credentials 服务，API Key 未写入；请稍后在官方「模型」页补填，或设置环境变量 ' + keyRef
      } else {
        try {
          await credentials.set(keyRef, apiKey)
          keyStored = true
        } catch (e) {
          keyWarning = '提供方已创建，但 API Key 写入失败: ' + (e && e.message ? e.message : String(e)) + '（凭据名 ' + keyRef + '）'
        }
      }
    }

    return {
      ok: true,
      provider: route,
      displayName: displayName || route,
      baseURL: baseURL,
      api: api,
      modelCount: models.length,
      apiKeyEnv: storesKey ? keyRef : '',
      keyStored: keyStored,
      via: via,
      message: keyWarning
        ? ('已添加提供方 ' + route + '（via ' + via + '）。' + keyWarning)
        : ('已添加提供方 ' + route + '（' + models.length + ' 个模型' + (keyStored ? '，已存 API Key' : '') + '，via ' + via + '）'),
      warning: keyWarning || undefined,
      providers: listProviders(),
    }
  }

  async function savePlusPrefs(prefs) {
    refreshHostProto()
    const next = Object.assign({}, readPlus(), prefs || {})
    const expectedRevision = readNsRevision()
    try {
      await ctx.settings.update(NS, H({ __modelPlus: next }), expectedRevision)
      return
    } catch (e) {
      if (isSettingsConflictError(e)) throw new Error('配置已被其他操作更新，请刷新后重试')
    }
    const user = getUserLayer() || {}
    user.__modelPlus = next
    await ctx.settings.replace(NS, H(user), expectedRevision)
  }

  function validateModelsUrl(value) {
    const url = migrateCatalogUrl(str(value, '').trim())
    if (!url || url.length > 2048 || !/^https:\/\/[^\s]+$/i.test(url)) throw new Error('models.json 地址必须是 HTTPS URL（最长 2048 字符）')
    // 统一走出站策略（禁云元数据等）；目录拉取强制 HTTPS
    assertOutboundUrlAllowed(url, { requireHttps: true })
    return url
  }

  function httpsGetText(url, timeoutMs, redirectCount, budgetLeft) {
    if (typeof redirectCount !== 'number' || redirectCount < 0) redirectCount = 0
    const timeout = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : FETCH_TIMEOUT_MS
    // 整条请求链（含重定向）的绝对总截止时间：首跳起算，递归时扣掉已耗时
    const budget = (typeof budgetLeft === 'number' && budgetLeft > 0) ? budgetLeft : timeout
    const hopStart = Date.now()
    return new Promise((resolve, reject) => {
      Promise.all([import('node:https'), import('node:http'), import('node:url')]).then(([https, http, urlMod]) => {
        let safe
        try {
          safe = assertOutboundUrlAllowed(url, { requireHttps: true })
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
          return
        }
        const targetHost = safe.hostname
        const targetPort = safe.port || 443
        const targetPath = safe.pathname + (safe.search || '')
        // 检测代理：HTTPS_PROXY / HTTP_PROXY 环境变量；loopback 不走代理
        const proxyUrl = isLoopbackHostname(targetHost)
          ? ''
          : (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '')
        const deadlineSignal = AbortSignal.timeout(budget)
        const doRequest = (opts) => {
          const req = https.request(Object.assign({}, opts, { signal: deadlineSignal }), (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              // 跟随重定向：限制次数，并对目标重新做 HTTPS/出站校验，防止被 302 导向内网/非 HTTPS
              res.resume()
              if (redirectCount >= MAX_REDIRECTS) {
                reject(new Error('重定向次数超限（' + MAX_REDIRECTS + '）'))
                return
              }
              const spent = Date.now() - hopStart
              const nextBudget = budget - spent
              if (nextBudget <= 50) {
                reject(new Error('远程目录请求超过总截止时间（' + timeout + 'ms）'))
                return
              }
              let redirectUrl
              try { redirectUrl = new URL(res.headers.location, url).href } catch (_) {
                reject(new Error('重定向目标非法'))
                return
              }
              try {
                assertOutboundUrlAllowed(redirectUrl, { requireHttps: true })
              } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)))
                return
              }
              httpsGetText(redirectUrl, timeout, redirectCount + 1, nextBudget).then(resolve, reject)
              return
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
              res.resume()
              reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
              return
            }
            const declared = Number(res.headers['content-length'])
            if (Number.isFinite(declared) && declared > MAX_REMOTE_BYTES) {
              res.resume()
              reject(new Error('远程目录超过 2 MiB 限制'))
              return
            }
            const chunks = []
            let total = 0
            let aborted = false
            res.on('data', (c) => {
              if (aborted) return
              total += c.length
              if (total > MAX_REMOTE_BYTES) {
                aborted = true
                res.destroy()
                reject(new Error('远程目录超过 2 MiB 限制'))
                return
              }
              chunks.push(c)
            })
            res.on('end', () => {
              if (aborted) return
              const text = Buffer.concat(chunks).toString('utf8')
              resolve(text)
            })
            res.on('error', (error) => { if (!aborted) reject(error) })
          })
          req.on('error', (error) => {
            if (error && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR')) {
              reject(new Error('远程目录请求超过总截止时间（' + timeout + 'ms）'))
              return
            }
            reject(error)
          })
          req.on('timeout', () => { req.destroy(new Error('远程目录请求超时（' + timeout + 'ms）')) })
          deadlineSignal.addEventListener('abort', () => {
            req.destroy(new Error('远程目录请求超过总截止时间（' + timeout + 'ms）'))
          })
          req.end()
          return req
        }
        const directOpts = {
          hostname: targetHost, port: targetPort, path: targetPath, method: 'GET',
          headers: { 'user-agent': 'dsh-model-plus', 'accept': 'application/json,text/plain,*/*' },
          timeout: timeout,
        }
        if (!proxyUrl) {
          // 直连
          doRequest(directOpts)
          return
        }
        // 走 HTTP CONNECT 隧道代理（CONNECT 阶段同样受绝对截止约束）
        const proxy = urlMod.parse(proxyUrl)
        const tunnelReq = http.request(Object.assign({
          hostname: proxy.hostname, port: proxy.port || 8080, method: 'CONNECT',
          path: targetHost + ':' + targetPort,
          headers: { host: targetHost + ':' + targetPort },
        }, { signal: deadlineSignal }))
        tunnelReq.on('error', (error) => {
          if (error && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR')) {
            reject(new Error('远程目录请求超过总截止时间（' + timeout + 'ms）'))
            return
          }
          reject(error)
        })
        tunnelReq.on('timeout', () => { tunnelReq.destroy(new Error('代理连接超时（' + timeout + 'ms）')) })
        deadlineSignal.addEventListener('abort', () => {
          tunnelReq.destroy(new Error('远程目录请求超过总截止时间（' + timeout + 'ms）'))
        })
        tunnelReq.on('connect', (proxyRes, socket) => {
          if (proxyRes.statusCode !== 200) {
            reject(new Error('代理 CONNECT 失败: HTTP ' + proxyRes.statusCode))
            return
          }
          doRequest(Object.assign({}, directOpts, { socket: socket, agent: false }))
        })
        tunnelReq.end()
      }).catch(reject)
    })
  }

  function setInput(model, input) {
    const next = Object.assign({}, model)
    if (Array.isArray(input) && input.indexOf('image') >= 0) {
      next.input = ['text', 'image']
    } else {
      // 无视觉不落盘 input
      delete next.input
    }
    return next
  }

  function applyRemoteToLocal(localModel, remote, overwrite, syncInput) {
    let next = cloneModel(localModel) || { id: localModel.id }
    const notes = []
    let changed = false
    const hasReasoning = Object.prototype.hasOwnProperty.call(next, 'reasoningEfforts')
    if (remote.reasoningEfforts === false) {
      if (overwrite || !hasReasoning) {
        if (next.reasoningEfforts !== false) { next.reasoningEfforts = false; changed = true; notes.push('关闭推理') }
      }
    } else if (remote.reasoningEfforts && typeof remote.reasoningEfforts === 'object') {
      if (overwrite || !hasReasoning) {
        const before = JSON.stringify(next.reasoningEfforts ?? null)
        const after = JSON.stringify(remote.reasoningEfforts)
        if (before !== after) {
          next.reasoningEfforts = Object.assign({}, remote.reasoningEfforts)
          changed = true
          notes.push('推理档')
        }
      }
    }
    if (syncInput && Array.isArray(remote.input) && remote.input.length) {
      const before = JSON.stringify(next.input || [])
      if (overwrite || !Object.prototype.hasOwnProperty.call(next, 'input')) {
        next = setInput(next, remote.input)
        if (JSON.stringify(next.input || []) !== before) { changed = true; notes.push('输入类型') }
      }
    }
    if (typeof remote.contextWindow === 'number' && remote.contextWindow > 0) {
      if (overwrite || next.contextWindow === undefined) {
        if (next.contextWindow !== remote.contextWindow) {
          next.contextWindow = Math.floor(remote.contextWindow)
          changed = true
          notes.push('上下文')
        }
      }
    }
    if (typeof remote.maxTokens === 'number' && remote.maxTokens > 0) {
      if (overwrite || next.maxTokens === undefined) {
        if (next.maxTokens !== remote.maxTokens) {
          next.maxTokens = Math.floor(remote.maxTokens)
          changed = true
          notes.push('maxTokens')
        }
      }
    }
    return { model: next, changed: changed, notes: notes.join(',') }
  }

  async function saveFromEditor(provider, modelId, editor, messagePrefix) {
    const models = getRawModels(provider)
    const idx = models.findIndex((m) => m.id === modelId)
    if (idx < 0) throw new Error('模型不存在: ' + modelId)
    const norm = normalizeEditor(editor)
    let next = Object.assign({}, models[idx])
    next.reasoningEfforts = norm.reasoningEfforts
    // 无视觉不写 input；有视觉只落 ['text','image']（文本是默认模态）
    if (norm.vision === true) next.input = ['text', 'image']
    else delete next.input
    if (norm.clearContextWindow) delete next.contextWindow
    else if (norm.contextWindow !== undefined) next.contextWindow = norm.contextWindow
    if (norm.clearMaxTokens) delete next.maxTokens
    else if (norm.maxTokens !== undefined) next.maxTokens = norm.maxTokens
    models[idx] = next
    const via = await writeModels(provider, models)
    return { ok: true, model: modelView(next), message: (messagePrefix || '已保存 ') + modelId + '（via ' + via + '）' }
  }

  // ---- RPC handlers (originally harness.handle; now HTTP endpoints) ----

  async function bootstrap() {
    refreshHostProto()
    maybeMigrateLegacyCatalogPrefs()
    const plus = readPlus()
    const credentials = ctx.get('credentials')
    const catalogUrl = readCatalogUrl()
    return {
      writable: !!ctx.settings.writable,
      version: VERSION,
      levels: LEVELS.slice(),
      presets: Object.keys(PRESETS).map((id) => ({ id: id, label: PRESETS[id].label })),
      providers: listProviders(),
      protocols: PROTOCOLS.slice(),
      listableProtocols: LISTABLE_PROTOCOLS.slice(),
      canStoreApiKey: !!(credentials && typeof credentials.set === 'function'),
      defaultTestPrompt: DEFAULT_TEST_PROMPT,
      defaultTestMaxTokens: DEFAULT_TEST_MAX_TOKENS,
      modelsDevUrl: catalogUrl,
      defaultModelsDevUrl: MODELS_DEV_URL,
      // 兼容旧字段名
      defaultModelsUrl: MODELS_DEV_URL,
      modelsUrl: catalogUrl,
      defaultProviderMaxRetries: DEFAULT_PROVIDER_MAX_RETRIES,
      note: '一键同步默认从目录（models.dev 或自定义地址）按模型 id 补全思考强度/上下文/视觉；本地可按供应商编辑，也可添加三方供应商。新建供应商默认 retryPolicy.maxRetries=' + DEFAULT_PROVIDER_MAX_RETRIES + '。',
      repo: 'https://github.com/kingsunb/dsh-model-plus',
      homepage: 'https://github.com/kingsunb/dsh-model-plus#readme',
      issues: 'https://github.com/kingsunb/dsh-model-plus/issues',
    }
  }

  async function listModels(args) {
    const provider = str(args && args.provider, '')
    if (!provider) throw new Error('缺少 provider')
    const profile = asObject(asObject(readPiAi().providers)[provider])
    return {
      provider: provider, baseURL: str(profile.baseURL, ''), api: str(profile.api, ''),
      models: getRawModels(provider).map(modelView), writable: !!ctx.settings.writable,
    }
  }

  async function saveModel(args) {
    const provider = str(args && args.provider, '')
    const modelId = str(args && args.modelId, '')
    if (!provider || !modelId) throw new Error('缺少 provider/modelId')
    return saveFromEditor(provider, modelId, args && args.editor, '已保存 ')
  }

  async function applyPreset(args) {
    const provider = str(args && args.provider, '')
    const modelId = str(args && args.modelId, '')
    const presetId = str(args && args.presetId, '')
    const preset = PRESETS[presetId]
    if (!preset) throw new Error('未知预设')
    if (!provider || !modelId) throw new Error('缺少 provider/modelId')
    const current = getRawModels(provider).find((m) => m.id === modelId)
    const vision = (typeof preset.vision === 'boolean') ? preset.vision : (current ? hasVision(current) : false)
    const editor = { disabled: preset.efforts === false, levels: [], vision: vision }
    if (preset.efforts && preset.efforts !== false) {
      for (const level of LEVELS) {
        if (!Object.prototype.hasOwnProperty.call(preset.efforts, level)) editor.levels.push({ level: level, enabled: false, wire: level === 'off' ? '' : level, wireNull: level === 'off' })
        else if (preset.efforts[level] === null) editor.levels.push({ level: level, enabled: true, wire: '', wireNull: true })
        else editor.levels.push({ level: level, enabled: true, wire: String(preset.efforts[level]), wireNull: false })
      }
    } else {
      editor.levels = LEVELS.map((level) => ({ level: level, enabled: false, wire: level === 'off' ? '' : level, wireNull: level === 'off' }))
    }
    return saveFromEditor(provider, modelId, editor, '已应用预设「' + preset.label + '」到 ')
  }

  async function checkUpdate() {
    const localVersion = VERSION
    const registryUrl = 'https://registry.npmjs.org/@kingsunb/dsh-model-plus/latest'
    let latestVersion = ''
    let npmUrl = 'https://www.npmjs.com/package/@kingsunb/dsh-model-plus'
    try {
      // 优先用 ctx.web.fetch，不可用则回退 Node https 模块
      let text = ''
      const web = ctx.get('web')
      if (web && typeof web.fetch === 'function') {
        try {
          const result = await Promise.race([
            web.fetch({ url: registryUrl }).then((value) => ({ kind: 'result', value: value })),
            ctx.timer.timeout(FETCH_TIMEOUT_MS).then(() => ({ kind: 'timeout' })),
          ])
          if (result.kind === 'timeout') throw new Error('npm registry 请求超时')
          const response = result.value
          if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error('HTTP ' + (response && response.statusCode))
          const body = response.body
          if (typeof body === 'string') text = body
          else if (body && typeof body.content === 'string') text = body.content
          else if (body && typeof body.text === 'string') text = body.text
          else throw new Error('unsupported body')
        } catch (e) {
          const msg = e && (e.code || e.message) ? String(e.code || e.message) : String(e)
          if (!/WEB_PROVIDER_UNAVAILABLE|no usable web provider|not registered|configured web provider/i.test(msg)) throw e
          // 落到 https 模块回退
          text = await httpsGetText(registryUrl, FETCH_TIMEOUT_MS)
        }
      } else {
        text = await httpsGetText(registryUrl, FETCH_TIMEOUT_MS)
      }
      const data = JSON.parse(text)
      latestVersion = str(data.version, '')
      if (typeof data.npmUrl === 'string') npmUrl = data.npmUrl
    } catch (e) {
      return { ok: false, localVersion: localVersion, latestVersion: '', hasUpdate: false, error: e instanceof Error ? e.message : String(e) }
    }
    return {
      ok: true,
      localVersion: localVersion,
      latestVersion: latestVersion,
      hasUpdate: !!latestVersion && !!localVersion && latestVersion !== localVersion,
      npmUrl: npmUrl,
      registryUrl: registryUrl,
    }
  }

  // ---- HTTP route plumbing (mirrors dsh-pet/routes.ts) ----

  function json(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > 256 * 1024) { reject(new Error('body-too-large')); queueMicrotask(() => req.destroy()); return }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (chunks.length === 0) { resolve({}); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch { reject(new Error('invalid-json')) }
      })
      req.on('error', reject)
    })
  }

  /** GET JSON route. */
  function getRoute(path, run) {
    return {
      kind: 'exact', path,
      handler: (req, res) => {
        if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
        run(req).then(
          (value) => json(res, 200, value),
          (error) => json(res, 500, { ok: false, error: routeError(error) }),
        )
      },
    }
  }

  /**
   * 写接口信任栅栏：
   * 1) 有 Origin 时必须与 Host 同源（防 CSRF）
   * 2) 无 Origin 时仅允许 loopback 远端（本机进程）；经反代/暴露后的远程 curl 直接 403
   * 注意：这不是完整会话认证，但堵住了「无 Origin = 放行」的暴露面。
   */
  function assertTrustedWriteRequest(req) {
    const host = req && req.headers ? req.headers.host : ''
    const origin = req && req.headers ? req.headers.origin : undefined
    if (origin) {
      if (!host || !sameOriginHost(origin, host)) {
        const err = new Error('cross-origin denied')
        err.statusCode = 403
        throw err
      }
      return
    }
    const remote = (req && (req.socket && (req.socket.remoteAddress || req.socket.remoteFamily)))
      || (req && req.connection && req.connection.remoteAddress)
      || ''
    // Node 在 trust proxy 场景下 remoteAddress 可能是代理；无 Origin 一律要求直连 loopback
    if (!isLoopbackRemoteAddress(remote)) {
      const err = new Error('unauthenticated write denied')
      err.statusCode = 403
      throw err
    }
  }

  /** POST JSON route (body parsed and passed to run). */
  function postRoute(path, run) {
    return {
      kind: 'exact', path,
      handler: (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
        try {
          assertTrustedWriteRequest(req)
        } catch (error) {
          const status = (error && error.statusCode) || 403
          json(res, status, { ok: false, error: routeError(error) })
          return
        }
        readJsonBody(req).then(
          (body) => {
            const record = (typeof body === 'object' && body !== null) ? body : {}
            return run(record).then(
              (value) => json(res, 200, value),
              (error) => json(res, 400, { ok: false, error: routeError(error) }),
            )
          },
          (error) => json(res, 400, { ok: false, error: routeError(error) }),
        )
      },
    }
  }

  /** Build the /api/plus/* route family. */
  function makeRoutes() {
    return [
      getRoute(`${API_PREFIX}/bootstrap`, () => bootstrap()),
      getRoute(`${API_PREFIX}/list-models`, (req) => {
        const provider = str(new URL(req.url, 'http://x').searchParams.get('provider'), '')
        return listModels({ provider })
      }),
      postRoute(`${API_PREFIX}/save-model`, (b) => saveModel(b)),
      postRoute(`${API_PREFIX}/apply-preset`, (b) => applyPreset(b)),
      postRoute(`${API_PREFIX}/add-provider`, (b) => addProvider(b)),
      postRoute(`${API_PREFIX}/save-provider`, (b) => saveProvider(b)),
      postRoute(`${API_PREFIX}/discover-models`, (b) => discoverModels(b)),
      postRoute(`${API_PREFIX}/refresh-models`, (b) => refreshProviderModels(b)),
      postRoute(`${API_PREFIX}/add-models`, (b) => addProviderModels(b)),
      postRoute(`${API_PREFIX}/enrich-models`, (b) => enrichProviderModels(b)),
      postRoute(`${API_PREFIX}/save-catalog-url`, (b) => saveCatalogUrl(b)),
      postRoute(`${API_PREFIX}/save-provider-retry`, (b) => saveProviderRetry(b)),
      postRoute(`${API_PREFIX}/test-model`, (b) => testModel(b)),
      getRoute(`${API_PREFIX}/check-update`, () => checkUpdate()),
    ]
  }

  const routes = makeRoutes()
  const disposers = routes.map((route) => ctx.webServer.register(route))
  ctx.effect(() => () => { for (const d of disposers) d() }, 'model-plus: routes')
}
