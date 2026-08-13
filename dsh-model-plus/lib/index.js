/**
 * dsh-model-plus host half — mounts the model-plus HTTP API.
 *
 * 浏览器半区（lib/client.js）通过同源 `/api/plus/*` JSON 端点与本半区通信：
 * 设置页「模型 Plus」按供应商编辑思考强度/视觉/上下文，并从远程 models.json
 * 按模型名同步默认配置。
 *
 * 安装：`dsh plugin --profile web add @kingsunb/dsh-model-plus`
 * cordis.patch.yml 把本插件行插入 web profile 的 cordis 层。
 *
 * 改造自创造模式动态插件（Plugin/host.js），原 harness.handle → ctx.webServer.register。
 * @module @kingsunb/dsh-model-plus
 */

import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

/**
 * Host-side route handler signature: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>.
 * WebRoute shape: { kind: 'exact'|'prefix', path: string, handler } from @deepseek-ai/dsh-host-webserver.
 * These are injected by cordis at runtime (ctx.webServer.register); no value import needed.
 */

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'model-plus'

/** Host 半区所需服务：settings 读写、web 路由、timer 超时。 */
export const inject = ['settings', 'webServer', 'timer']

const NS = 'llm-pi-ai'
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const INPUTS = ['text', 'image']
const VERSION = '0.1.9'
const DEFAULT_MODELS_URL =
  'https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json'
const FETCH_TIMEOUT_MS = 15000
const MAX_REMOTE_BYTES = 2 * 1024 * 1024
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

function isSameOriginPost(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && (site === 'cross-site' || site === 'same-site')) return false
  const origin = req.headers.origin
  const host = req.headers.host
  return typeof origin === 'string' && typeof host === 'string' && sameOriginHost(origin, host)
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

/** Linear-time glob matcher for remote model ids; '*' matches any run, '?' one character. */
function matchIdPattern(pattern, value) {
  let patternIndex = 0
  let valueIndex = 0
  let starIndex = -1
  let starValueIndex = 0
  while (valueIndex < value.length) {
    const patternChar = pattern[patternIndex]
    if (patternChar === value[valueIndex] || patternChar === '?') {
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
  while (pattern[patternIndex] === '*') patternIndex += 1
  return patternIndex === pattern.length
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
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    const idPattern = isSafeIdPattern(entry.idPattern) ? entry.idPattern : ''
    if ((!id || id.length > 200) && !idPattern) return null
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
      if (input.length) out.input = input
    }
    // vision 布尔归一化：显式 input 数组优先，否则用 vision 推导
    if (!out.input) {
      if (entry.vision === true) out.input = ['text', 'image']
      else if (entry.vision === false) out.input = ['text']
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
      return {
        provider: id, displayName: str(p.displayName, id), baseURL: str(p.baseURL, ''), api: str(p.api, ''),
        modelCount: models.length, withEffort: withEffort, withVision: withVision,
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

  async function writeModels(provider, models) {
    if (!ctx.settings.writable) throw new Error('settings 只读')
    refreshHostProto()
    const errors = []
    const profileNow = asObject(asObject(readPiAi().providers)[provider])

    try {
      const providerPatch = { models: models }
      await ctx.settings.update(NS, H({ providers: { [provider]: providerPatch } }))
      return 'update'
    } catch (e) { errors.push('update:' + (e && e.message ? e.message : String(e))) }

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
      user.providers[provider] = nextProfile
      await ctx.settings.replace(NS, H(user))
      return 'replace'
    } catch (e) { errors.push('replace:' + (e && e.message ? e.message : String(e))) }

    try {
      const ops = []
      const op1 = H({ op: 'set', path: ['providers', provider, 'models'], value: models })
      op1.op = 'set'
      op1.path = ['providers', String(provider), 'models']
      ops.push(op1)
      await ctx.settings.mutate(NS, ops)
      return 'mutate'
    } catch (e) { errors.push('mutate:' + (e && e.message ? e.message : String(e))) }

    throw new Error('写回失败: ' + errors.join(' | '))
  }

  async function savePlusPrefs(prefs) {
    refreshHostProto()
    const next = Object.assign({}, readPlus(), prefs || {})
    try { await ctx.settings.update(NS, H({ __modelPlus: next })); return } catch (_) {}
    const user = getUserLayer() || {}
    user.__modelPlus = next
    await ctx.settings.replace(NS, H(user))
  }

  function validateModelsUrl(value) {
    const url = str(value, '').trim()
    if (!url || url.length > 2048 || !/^https:\/\/[^\s]+$/i.test(url)) throw new Error('models.json 地址必须是 HTTPS URL（最长 2048 字符）')
    return url
  }

  function httpsGetText(url, timeoutMs, redirectCount) {
    if (typeof redirectCount !== 'number' || redirectCount < 0) redirectCount = 0
    return new Promise((resolve, reject) => {
      Promise.all([import('node:https'), import('node:http'), import('node:url')]).then(([https, http, urlMod]) => {
        const parsed = urlMod.parse(url)
        const targetHost = parsed.hostname
        const targetPort = parsed.port || 443
        const targetPath = parsed.path
        // 检测代理：HTTPS_PROXY / HTTP_PROXY 环境变量
        const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || ''
        const doRequest = (opts) => {
          const req = https.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              // 跟随重定向：限制次数，并对目标重新做 HTTPS 校验，防止被 302 导向内网/非 HTTPS
              res.resume()
              if (redirectCount >= MAX_REDIRECTS) {
                reject(new Error('重定向次数超限（' + MAX_REDIRECTS + '）'))
                return
              }
              const redirectUrl = urlMod.resolve(url, res.headers.location)
              try { validateModelsUrl(redirectUrl) } catch (e) { reject(e); return }
              httpsGetText(redirectUrl, timeoutMs, redirectCount + 1).then(resolve, reject)
              return
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
              res.resume()
              reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
              return
            }
            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8')
              if (new TextEncoder().encode(text).length > MAX_REMOTE_BYTES) {
                reject(new Error('远程目录超过 2 MiB 限制'))
                return
              }
              resolve(text)
            })
            res.on('error', reject)
          })
          req.on('error', reject)
          req.on('timeout', () => { req.destroy(); reject(new Error('远程目录请求超时（' + timeoutMs + 'ms）')) })
          req.end()
          return req
        }
        const directOpts = {
          hostname: targetHost, port: targetPort, path: targetPath, method: 'GET',
          headers: { 'user-agent': 'dsh-model-plus', 'accept': 'application/json,text/plain,*/*' },
          timeout: timeoutMs,
        }
        if (!proxyUrl) {
          // 直连
          doRequest(directOpts)
          return
        }
        // 走 HTTP CONNECT 隧道代理
        const proxy = urlMod.parse(proxyUrl)
        const tunnelReq = http.request({
          hostname: proxy.hostname, port: proxy.port || 8080, method: 'CONNECT',
          path: targetHost + ':' + targetPort, timeout: timeoutMs,
          headers: { host: targetHost + ':' + targetPort },
        })
        tunnelReq.on('error', reject)
        tunnelReq.on('timeout', () => { tunnelReq.destroy(); reject(new Error('代理连接超时（' + timeoutMs + 'ms）')) })
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

  async function fetchText(url) {
    const safeUrl = validateModelsUrl(url)
    // 优先用 ctx.web（如果有 fetch provider 注册且可用）；否则回退到 Node https 模块
    const web = ctx.get('web')
    if (web && typeof web.fetch === 'function') {
      try {
        const result = await Promise.race([
          web.fetch({ url: safeUrl }).then((value) => ({ kind: 'result', value: value })),
          ctx.timer.timeout(FETCH_TIMEOUT_MS).then(() => ({ kind: 'timeout' })),
        ])
        if (result.kind === 'timeout') throw new Error('远程目录请求超时（' + FETCH_TIMEOUT_MS + 'ms）')
        const response = result.value
        if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error('HTTP ' + (response && response.statusCode) + ' for ' + safeUrl)
        const body = response.body
        let text = ''
        if (typeof body === 'string') text = body
        else if (body && (body.type === 'text' || body.type === 'html')) text = String(body.content || body.text || '')
        else if (body && typeof body.content === 'string') text = body.content
        else if (body && typeof body.text === 'string') text = body.text
        else throw new Error('unsupported body from web.fetch')
        if (new TextEncoder().encode(text).length > MAX_REMOTE_BYTES) throw new Error('远程目录超过 2 MiB 限制')
        return text
      } catch (e) {
        // web provider 不可用时回退到 https 模块；其它错误继续抛出
        const msg = e && (e.code || e.message) ? String(e.code || e.message) : String(e)
        if (!/WEB_PROVIDER_UNAVAILABLE|no usable web provider|not registered|configured web provider/i.test(msg)) throw e
        // 落到下方 https 模块回退
      }
    }
    // 回退：Node.js 内置 https 模块（直连，不依赖 fetch 环境）
    return httpsGetText(safeUrl, FETCH_TIMEOUT_MS)
  }

  async function fetchJson(url) {
    const text = await fetchText(url)
    try { return JSON.parse(text) } catch (e) { throw new Error('JSON 解析失败: ' + url + ' / ' + (e && e.message ? e.message : e)) }
  }

  function matchRemoteModel(remoteModels, localId) {
    const id = String(localId || '')
    const idLower = id.toLowerCase()
    for (const m of (remoteModels || [])) {
      if (!m) continue
      if (typeof m.id === 'string' && m.id.toLowerCase() === idLower) return m
      if (typeof m.idPattern === 'string' && matchIdPattern(m.idPattern, id)) return m
    }
    return null
  }

  function setInput(model, input) {
    const next = Object.assign({}, model)
    if (Array.isArray(input) && input.length) next.input = input.slice()
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

  async function loadRemoteModels(modelsUrl) {
    const safeUrl = validateModelsUrl(modelsUrl)
    const data = await fetchJson(safeUrl)
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.models)) {
      throw new Error('远程 JSON 必须是包含 models 数组的目录: ' + safeUrl)
    }
    const models = []
    const seen = {}
    for (const raw of data.models) {
      const model = cloneModel(raw)
      if (!model || model.id.length > 200 || seen[model.id]) continue
      seen[model.id] = true
      models.push(model)
    }
    if (!models.length) throw new Error('远程目录没有有效模型条目')
    return { catalog: data, models: models, modelsUrl: safeUrl }
  }

  async function syncFromRemote(args) {
    const provider = str(args && args.provider, '')
    if (!provider) throw new Error('缺少 provider')
    const modelsUrl = str(args && args.modelsUrl, '') || str(args && args.indexUrl, '') || str(readPlus().modelsUrl, '') || str(readPlus().indexUrl, '') || DEFAULT_MODELS_URL
    const overwrite = !!(args && args.overwriteEfforts === true)
    const syncInput = args && args.syncVision === false ? false : true
    const profile = asObject(asObject(readPiAi().providers)[provider])
    if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)

    const remote = await loadRemoteModels(modelsUrl)
    const existing = getRawModels(provider)
    const changes = []
    const nextModels = []
    for (const m of existing) {
      const hit = matchRemoteModel(remote.models, m.id)
      if (!hit) { nextModels.push(m); continue }
      const applied = applyRemoteToLocal(m, hit, overwrite, syncInput)
      nextModels.push(applied.model)
      if (applied.changed) changes.push({
        id: m.id, notes: applied.notes, summary: effortSummary(applied.model), vision: hasVision(applied.model),
        contextWindow: typeof applied.model.contextWindow === 'number' ? applied.model.contextWindow : 0,
        matchedBy: hit.id ? ('id:' + hit.id) : ('pattern:' + (hit.idPattern || '')),
      })
    }
    return {
      modelsUrl: remote.modelsUrl, indexName: str(remote.catalog.name, 'dsh-model-plus'), updatedAt: str(remote.catalog.updatedAt, ''),
      remoteRules: remote.models.length, localCount: existing.length, changeCount: changes.length, changes: changes,
      nextModels: nextModels, overwriteEfforts: overwrite, syncVision: syncInput,
    }
  }

  async function saveFromEditor(provider, modelId, editor, messagePrefix) {
    const models = getRawModels(provider)
    const idx = models.findIndex((m) => m.id === modelId)
    if (idx < 0) throw new Error('模型不存在: ' + modelId)
    const norm = normalizeEditor(editor)
    let next = Object.assign({}, models[idx])
    next.reasoningEfforts = norm.reasoningEfforts
    next.input = norm.vision === true ? ['text', 'image'] : ['text']
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
    const plus = readPlus()
    return {
      writable: !!ctx.settings.writable,
      version: VERSION,
      levels: LEVELS.slice(),
      presets: Object.keys(PRESETS).map((id) => ({ id: id, label: PRESETS[id].label })),
      providers: listProviders(),
      defaultModelsUrl: DEFAULT_MODELS_URL,
      modelsUrl: str(plus.modelsUrl, '') || str(plus.indexUrl, DEFAULT_MODELS_URL) || DEFAULT_MODELS_URL,
      note: '远程 models.json 仅按精确模型 id 同步推理档、输入类型和 token 限额；本地可按供应商编辑。默认 kingsunb/dsh-model-plus/models.json',
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

  async function saveSyncUrl(args) {
    const modelsUrl = str(args && args.modelsUrl, '') || str(args && args.indexUrl, DEFAULT_MODELS_URL) || DEFAULT_MODELS_URL
    validateModelsUrl(modelsUrl) // 提前校验，避免坏地址落盘后延迟到同步才报错
    await savePlusPrefs({ modelsUrl: modelsUrl, indexUrl: modelsUrl })
    return { ok: true, modelsUrl: modelsUrl, indexUrl: modelsUrl, message: '已保存同步地址' }
  }

  async function syncPreview(args) {
    const plan = await syncFromRemote(args || {})
    return {
      modelsUrl: plan.modelsUrl, indexUrl: plan.modelsUrl, indexName: plan.indexName, updatedAt: plan.updatedAt,
      remoteRules: plan.remoteRules, localCount: plan.localCount, changeCount: plan.changeCount, changes: plan.changes,
      overwriteEfforts: plan.overwriteEfforts, syncVision: plan.syncVision,
    }
  }

  async function syncApply(args) {
    const provider = str(args && args.provider, '')
    const plan = await syncFromRemote(args || {})
    if (!plan.changeCount) {
      return {
        ok: true, skipped: true, changeCount: 0,
        message: '远程 models.json 无匹配变更（或本地已是最新）。只按模型名匹配。',
        modelsUrl: plan.modelsUrl, indexUrl: plan.modelsUrl, changes: [], localCount: plan.localCount,
      }
    }
    const via = await writeModels(provider, plan.nextModels)
    await savePlusPrefs({ modelsUrl: plan.modelsUrl, indexUrl: plan.modelsUrl, lastSyncAt: Date.now() })
    return {
      ok: true, skipped: false, changeCount: plan.changeCount,
      message: '已按模型名从 models.json 写回 ' + plan.changeCount + ' 项（via ' + via + '）。',
      modelsUrl: plan.modelsUrl, indexUrl: plan.modelsUrl, changes: plan.changes, localCount: plan.localCount,
      models: plan.nextModels.map(modelView),
    }
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

  /** POST JSON route (body parsed and passed to run). */
  function postRoute(path, run) {
    return {
      kind: 'exact', path,
      handler: (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
        // CSRF defense: reject cross-origin browser requests (curl/no-Origin is allowed)
        const origin = req.headers.origin
        if (origin) {
          const host = req.headers.host
          if (host && !sameOriginHost(origin, host)) {
            json(res, 403, { ok: false, error: 'cross-origin denied' }); return
          }
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
      postRoute(`${API_PREFIX}/save-sync-url`, (b) => saveSyncUrl(b)),
      postRoute(`${API_PREFIX}/sync-preview`, (b) => syncPreview(b)),
      postRoute(`${API_PREFIX}/sync-apply`, (b) => syncApply(b)),
      getRoute(`${API_PREFIX}/check-update`, () => checkUpdate()),
    ]
  }

  const routes = makeRoutes()
  const disposers = routes.map((route) => ctx.webServer.register(route))
  ctx.effect(() => () => { for (const d of disposers) d() }, 'model-plus: routes')
}
