return {
  inject: ['llm', 'settings'],
  apply(ctx) {
    const NS = 'llm-pi-ai'
    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    const DEFAULT_MODELS_URL = 'https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json'
    const ALL_EFFORTS = { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
    const PRESETS = {
      none: { label: '关闭推理', efforts: false },
      basic: { label: '通用三档', efforts: { low: 'low', medium: 'medium', high: 'high' } },
      all: { label: '全开', efforts: ALL_EFFORTS },
      visionAll: { label: '视觉+全开', efforts: ALL_EFFORTS, vision: true },
    }

    let hostProto = null
    function refreshHostProto() {
      try {
        const list = ctx.settings.describe()
        if (Array.isArray(list) && list.length) { hostProto = Object.getPrototypeOf(list[0]); return }
      } catch (_) {}
      try { const v = ctx.settings.get(NS); if (v && typeof v === 'object') hostProto = Object.getPrototypeOf(v) } catch (_) {}
    }
    refreshHostProto()

    function H(data) {
      if (data === null || typeof data === 'string' || typeof data === 'boolean' || typeof data === 'number') return data
      if (Array.isArray(data)) { const a = []; for (let i = 0; i < data.length; i++) a[i] = H(data[i]); return a }
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
      if (!id) return null
      const out = { id: id }
      if (typeof entry.name === 'string' && entry.name) out.name = entry.name
      if (typeof entry.contextWindow === 'number') out.contextWindow = entry.contextWindow
      if (typeof entry.maxTokens === 'number') out.maxTokens = entry.maxTokens
      if (Array.isArray(entry.input)) out.input = entry.input.filter((x) => typeof x === 'string')
      if (entry.reasoningEfforts === false) out.reasoningEfforts = false
      else if (entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object' && !Array.isArray(entry.reasoningEfforts)) {
        const efforts = {}
        for (const k of Object.keys(entry.reasoningEfforts)) {
          const w = entry.reasoningEfforts[k]
          if (w === null) efforts[k] = null
          else if (typeof w === 'string') efforts[k] = w
        }
        out.reasoningEfforts = efforts
      }
      if (entry.compat && typeof entry.compat === 'object' && !Array.isArray(entry.compat)) {
        const c = {}
        if (typeof entry.compat.thinkingFormat === 'string') c.thinkingFormat = entry.compat.thinkingFormat
        if (entry.compat.supportsReasoningEffort === true) c.supportsReasoningEffort = true
        if (entry.compat.supportsReasoningEffort === false) c.supportsReasoningEffort = false
        if (Object.keys(c).length) out.compat = c
      }
      return out
    }

    function hasVision(m) { return Array.isArray(m.input) && m.input.map(String).indexOf('image') >= 0 }
    function effortSummary(m) {
      if (m.reasoningEfforts === false) return '关闭'
      if (m.reasoningEfforts && typeof m.reasoningEfforts === 'object') {
        const keys = Object.keys(m.reasoningEfforts)
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
      const contextWindow = (typeof editor.contextWindow === 'number' && editor.contextWindow > 0) ? Math.floor(editor.contextWindow) : 0
      const maxTokens = (typeof editor.maxTokens === 'number' && editor.maxTokens > 0) ? Math.floor(editor.maxTokens) : 0
      if (editor.disabled === true) return { reasoningEfforts: false, vision: vision, contextWindow: contextWindow, maxTokens: maxTokens }
      const efforts = {}
      let positive = 0
      for (const row of (Array.isArray(editor.levels) ? editor.levels : [])) {
        if (!row || row.enabled !== true) continue
        const level = str(row.level, '')
        if (LEVELS.indexOf(level) < 0) continue
        if (level === 'off' && (row.wireNull === true || str(row.wire, '') === '')) efforts.off = null
        else {
          const wire = str(row.wire, level)
          if (!wire) throw new Error(level + ' 需要 wire 值')
          efforts[level] = wire
          if (level !== 'off') positive += 1
        }
      }
      if (!Object.keys(efforts).length) return { reasoningEfforts: false, vision: vision, contextWindow: contextWindow, maxTokens: maxTokens }
      if (!positive) throw new Error('至少启用一个非 off 档，或勾选关闭推理')
      return { reasoningEfforts: efforts, vision: vision, contextWindow: contextWindow, maxTokens: maxTokens }
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
      const routeFormat = (profileNow.compat && typeof profileNow.compat.thinkingFormat === 'string') ? profileNow.compat.thinkingFormat : 'openai'
      const needCompat = models.some((m) => m.reasoningEfforts && m.reasoningEfforts !== false)

      try {
        const providerPatch = { models: models }
        if (needCompat) providerPatch.compat = { thinkingFormat: routeFormat || 'openai', supportsReasoningEffort: true }
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
        if (needCompat) {
          nextProfile.compat = Object.assign({}, prev.compat || {}, {
            thinkingFormat: (prev.compat && prev.compat.thinkingFormat) || routeFormat || 'openai',
            supportsReasoningEffort: true,
          })
        }
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
        if (needCompat) {
          const op2 = H({ op: 'set', path: ['providers', provider, 'compat'], value: { thinkingFormat: routeFormat || 'openai', supportsReasoningEffort: true } })
          op2.op = 'set'
          op2.path = ['providers', String(provider), 'compat']
          ops.push(op2)
        }
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

    async function fetchText(url) {
      const web = ctx.get('web')
      if (web && typeof web.fetch === 'function') {
        try {
          const result = await web.fetch({ url: url })
          if (result && result.statusCode >= 200 && result.statusCode < 300) {
            const body = result.body
            if (typeof body === 'string') return body
            if (body && (body.kind === 'text' || body.kind === 'html' || body.type === 'text' || body.type === 'html')) {
              return String(body.content || body.text || '')
            }
            if (body && typeof body.content === 'string') return body.content
            if (body && typeof body.text === 'string') return body.text
          }
        } catch (e) {
          // fall through to client fetch
        }
      }
      const err = new Error('NEED_CLIENT_FETCH:' + url)
      err.code = 'NEED_CLIENT_FETCH'
      err.url = url
      throw err
    }

    async function fetchJson(url) {
      const text = await fetchText(url)
      try { return JSON.parse(text) } catch (e) { throw new Error('JSON 解析失败: ' + url + ' / ' + (e && e.message ? e.message : e)) }
    }

    function matchRemoteModel(remoteModels, localId, localName) {
      const id = String(localId || '')
      const name = String(localName || '')
      const text = id + ' ' + name
      const exact = (remoteModels || []).find((m) => m && typeof m.id === 'string' && m.id === id)
      if (exact) return exact
      for (const m of remoteModels || []) {
        if (!m || typeof m.idPattern !== 'string' || !m.idPattern) continue
        try {
          const re = new RegExp(m.idPattern, 'i')
          if (re.test(id) || re.test(name) || re.test(text)) return m
        } catch (_) {}
      }
      return null
    }

    function setVision(model, vision) {
      const next = Object.assign({}, model)
      if (vision === true) next.input = ['text', 'image']
      else if (vision === false) next.input = ['text']
      return next
    }

    function applyRemoteToLocal(localModel, remote, overwrite, syncVision) {
      let next = cloneModel(localModel) || { id: localModel.id }
      const notes = []
      let changed = false
      const has = next.reasoningEfforts && next.reasoningEfforts !== false && typeof next.reasoningEfforts === 'object' && Object.keys(next.reasoningEfforts).length
      if (remote.reasoningEfforts === false) {
        if (overwrite || !has) {
          if (next.reasoningEfforts !== false) { next.reasoningEfforts = false; changed = true; notes.push('关闭推理') }
        }
      } else if (remote.reasoningEfforts && typeof remote.reasoningEfforts === 'object') {
        if (overwrite || !has) {
          next.reasoningEfforts = Object.assign({}, remote.reasoningEfforts)
          changed = true
          notes.push('推理档')
        }
      }
      if (typeof remote.thinkingFormat === 'string' && remote.thinkingFormat) {
        const c = next.compat && typeof next.compat === 'object' ? Object.assign({}, next.compat) : {}
        if (overwrite || !c.thinkingFormat) {
          if (c.thinkingFormat !== remote.thinkingFormat) { c.thinkingFormat = remote.thinkingFormat; changed = true; notes.push('方言') }
        }
        if (next.reasoningEfforts && next.reasoningEfforts !== false) c.supportsReasoningEffort = true
        next.compat = c
      } else if (next.reasoningEfforts && next.reasoningEfforts !== false) {
        const c = next.compat && typeof next.compat === 'object' ? Object.assign({}, next.compat) : {}
        if (c.supportsReasoningEffort !== true) { c.supportsReasoningEffort = true; next.compat = c; changed = true }
      }
      if (syncVision && typeof remote.vision === 'boolean') {
        const before = hasVision(next)
        if (overwrite || next.input === undefined) {
          next = setVision(next, remote.vision)
          if (before !== remote.vision) { changed = true; notes.push(remote.vision ? '视觉开' : '视觉关') }
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

    async function loadRemoteModels(modelsUrl, preloaded) {
      if (preloaded && typeof preloaded === 'object') {
        if (Array.isArray(preloaded.models)) return { catalog: preloaded, models: preloaded.models, modelsUrl: modelsUrl || '' }
        if (Array.isArray(preloaded)) return { catalog: { models: preloaded }, models: preloaded, modelsUrl: modelsUrl || '' }
      }

      const data = await fetchJson(modelsUrl)
      // Root models.json: { models: [...] }
      // Backward compatible: index with modelsFile, or inline models
      if (Array.isArray(data.models)) return { catalog: data, models: data.models, modelsUrl: modelsUrl }
      if (data.modelsFile) {
        // old index shape: join relative
        const base = String(modelsUrl).replace(/\\/g, '/').replace(/\/[^/]*$/, '/')
        const url = /^https?:\/\//i.test(data.modelsFile) ? data.modelsFile : (base + String(data.modelsFile).replace(/^\.\//, ''))
        const cat = await fetchJson(url)
        return { catalog: cat, models: Array.isArray(cat.models) ? cat.models : [], modelsUrl: url }
      }
      throw new Error('远程 JSON 缺少 models 数组: ' + modelsUrl)
    }

    async function syncFromRemote(args) {
      const provider = str(args && args.provider, '')
      if (!provider) throw new Error('缺少 provider')
      const modelsUrl = str(args && args.modelsUrl, '') || str(args && args.indexUrl, '') || str(readPlus().modelsUrl, '') || str(readPlus().indexUrl, '') || DEFAULT_MODELS_URL
      const overwrite = !!(args && args.overwriteEfforts === true)
      const syncVision = args && args.syncVision === false ? false : true
      const profile = asObject(asObject(readPiAi().providers)[provider])
      if (!Object.keys(profile).length) throw new Error('供应商未配置: ' + provider)

      const remote = await loadRemoteModels(modelsUrl, args && (args.catalog || args.models))
      const existing = getRawModels(provider)
      const changes = []
      const nextModels = []
      for (const m of existing) {
        const hit = matchRemoteModel(remote.models, m.id, m.name)
        if (!hit) { nextModels.push(m); continue }
        const applied = applyRemoteToLocal(m, hit, overwrite, syncVision)
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
        nextModels: nextModels, overwriteEfforts: overwrite, syncVision: syncVision,
      }
    }

    async function saveFromEditor(provider, modelId, editor, messagePrefix) {
      const models = getRawModels(provider)
      const idx = models.findIndex((m) => m.id === modelId)
      if (idx < 0) throw new Error('模型不存在: ' + modelId)
      const norm = normalizeEditor(editor)
      let next = Object.assign({}, models[idx])
      if (norm.reasoningEfforts === false) {
        next.reasoningEfforts = false
        if (next.compat) {
          const c = Object.assign({}, next.compat)
          delete c.supportsReasoningEffort
          if (Object.keys(c).length) next.compat = c
          else delete next.compat
        }
      } else {
        next.reasoningEfforts = norm.reasoningEfforts
        const c = next.compat && typeof next.compat === 'object' ? Object.assign({}, next.compat) : {}
        c.supportsReasoningEffort = true
        next.compat = c
      }
      next = setVision(next, norm.vision === true)
      if (norm.contextWindow > 0) next.contextWindow = norm.contextWindow
      else delete next.contextWindow
      if (norm.maxTokens > 0) next.maxTokens = norm.maxTokens
      else delete next.maxTokens
      models[idx] = next
      const via = await writeModels(provider, models)
      return { ok: true, model: modelView(next), message: (messagePrefix || '已保存 ') + modelId + '（via ' + via + '）' }
    }

    harness.handle('plus-bootstrap', async () => {
      refreshHostProto()
      const plus = readPlus()
      return {
        writable: !!ctx.settings.writable,
        levels: LEVELS.slice(),
        presets: Object.keys(PRESETS).map((id) => ({ id: id, label: PRESETS[id].label })),
        providers: listProviders(),
        defaultModelsUrl: DEFAULT_MODELS_URL,
        modelsUrl: str(plus.modelsUrl, '') || str(plus.indexUrl, DEFAULT_MODELS_URL) || DEFAULT_MODELS_URL,
        note: '远程 models.json 按模型名同步思考强度/视觉/上下文；本地可按供应商编辑。默认 kingsunb/dsh-model-plus/models.json',
        repo: 'https://github.com/kingsunb/dsh-model-plus',
        hostProto: hostProto ? 'ok' : 'null-proto-fallback',
      }
    })

    harness.handle('plus-list-models', async (args) => {
      const provider = str(args && args.provider, '')
      if (!provider) throw new Error('缺少 provider')
      const profile = asObject(asObject(readPiAi().providers)[provider])
      return {
        provider: provider, baseURL: str(profile.baseURL, ''), api: str(profile.api, ''),
        models: getRawModels(provider).map(modelView), writable: !!ctx.settings.writable,
      }
    })

    harness.handle('plus-save-model', async (args) => {
      const provider = str(args && args.provider, '')
      const modelId = str(args && args.modelId, '')
      if (!provider || !modelId) throw new Error('缺少 provider/modelId')
      return saveFromEditor(provider, modelId, args && args.editor, '已保存 ')
    })

    harness.handle('plus-apply-preset', async (args) => {
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
    })

    harness.handle('plus-save-sync-url', async (args) => {
      const modelsUrl = str(args && args.modelsUrl, '') || str(args && args.indexUrl, DEFAULT_MODELS_URL) || DEFAULT_MODELS_URL
      await savePlusPrefs({ modelsUrl: modelsUrl, indexUrl: modelsUrl })
      return { ok: true, modelsUrl: modelsUrl, indexUrl: modelsUrl, message: '已保存同步地址' }
    })

    harness.handle('plus-sync-preview', async (args) => {
      try {
        const plan = await syncFromRemote(args || {})
        return {
          modelsUrl: plan.modelsUrl,
          indexUrl: plan.modelsUrl,
          indexName: plan.indexName,
          updatedAt: plan.updatedAt,
          remoteRules: plan.remoteRules,
          localCount: plan.localCount,
          changeCount: plan.changeCount,
          changes: plan.changes,
          overwriteEfforts: plan.overwriteEfforts,
          syncVision: plan.syncVision,
        }
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e)
        if (e && (e.code === 'NEED_CLIENT_FETCH' || msg.indexOf('NEED_CLIENT_FETCH:') === 0)) {
          const url = e.url || msg.replace(/^NEED_CLIENT_FETCH:/, '')
          return {
            needClientFetch: true,
            modelsUrl: url,
            message: 'Host 无可用 web provider，改由浏览器拉取远程 models.json',
          }
        }
        throw e
      }
    })

    harness.handle('plus-sync-apply', async (args) => {
      const provider = str(args && args.provider, '')
      try {
        const plan = await syncFromRemote(args || {})
        if (!plan.changeCount) {
          return {
            ok: true,
            skipped: true,
            changeCount: 0,
            message: '远程 models.json 无匹配变更（或本地已是最新）。只按模型名匹配。',
            modelsUrl: plan.modelsUrl,
            indexUrl: plan.modelsUrl,
            changes: [],
            localCount: plan.localCount,
          }
        }
        const via = await writeModels(provider, plan.nextModels)
        await savePlusPrefs({ modelsUrl: plan.modelsUrl, indexUrl: plan.modelsUrl, lastSyncAt: Date.now() })
        return {
          ok: true,
          skipped: false,
          changeCount: plan.changeCount,
          message: '已按模型名从 models.json 写回 ' + plan.changeCount + ' 项（via ' + via + '）。',
          modelsUrl: plan.modelsUrl,
          indexUrl: plan.modelsUrl,
          changes: plan.changes,
          localCount: plan.localCount,
          models: plan.nextModels.map(modelView),
        }
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e)
        if (e && (e.code === 'NEED_CLIENT_FETCH' || msg.indexOf('NEED_CLIENT_FETCH:') === 0)) {
          const url = e.url || msg.replace(/^NEED_CLIENT_FETCH:/, '')
          return {
            needClientFetch: true,
            modelsUrl: url,
            message: 'Host 无可用 web provider，改由浏览器拉取远程 models.json 后再写回',
          }
        }
        throw e
      }
    })
  },
}
