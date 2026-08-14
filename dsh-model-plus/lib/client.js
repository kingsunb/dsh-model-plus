/**
 * dsh-model-plus browser half — registers the「模型 Plus」settings page.
 *
 * 通过 `settings.section` slot 在设置页注册「模型 Plus」分区，用户可本地按
 * 供应商编辑模型思考强度/视觉/上下文；一键同步默认从 models.dev 补全。
 *
 * 本文件是 DSH client bundle 形态：window.__ModuleLoader__.load 工厂。
 * - React 通过 require('react') 从 loader 模块表解析（平台种子模块）。
 * - host 通信走同源 fetch('/api/plus/*')（host 半 lib/index.js 注册的端点）。
 * - 样式运行时注入 <style data-plugin>（卸载时 loader 自动移除）。
 *
 * 改造自创造模式动态插件（Plugin/client.js）：
 * - 裸 React → require('react')
 * - host.call(name, args) → fetch('/api/plus/<endpoint>')
 * - styles.insert(css) → 运行时 <style data-plugin> 注入
 * @module @kingsunb/dsh-model-plus/client
 */
window.__ModuleLoader__.load({
  id: '@kingsunb/dsh-model-plus',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    const API = '/api/plus';

    /** Same-origin JSON fetch helper (GET without body, POST with JSON body). */
    async function plusFetch(path, body) {
      const response = await fetch(path, body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
      if (!response.ok) {
        let msg = 'plus ' + path + ' failed: ' + response.status;
        try {
          const data = await response.json();
          if (data && data.error) msg = data.error;
        } catch (_) {}
        throw new Error(msg);
      }
      return await response.json();
    }

    /** The host model-plus API as the browser sees it. */
    const api = {
      bootstrap: () => plusFetch(API + '/bootstrap'),
      listModels: (provider) => plusFetch(API + '/list-models?provider=' + encodeURIComponent(provider)),
      saveModel: (args) => plusFetch(API + '/save-model', args),
      applyPreset: (args) => plusFetch(API + '/apply-preset', args),
      addProvider: (args) => plusFetch(API + '/add-provider', args),
      discoverModels: (args) => plusFetch(API + '/discover-models', args),
      enrichModels: (args) => plusFetch(API + '/enrich-models', args),
      saveCatalogUrl: (args) => plusFetch(API + '/save-catalog-url', args),
      testModel: (args) => plusFetch(API + '/test-model', args),
      checkUpdate: () => plusFetch(API + '/check-update'),
    };

    /** Idempotent <style data-plugin> injection (loader removes on unload). */
    const PLUGIN_CSS_ID = '@kingsunb/dsh-model-plus/styles';
    function insertStyles(css) {
      if (typeof document === 'undefined') return;
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(PLUGIN_CSS_ID) + ']')) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = '@kingsunb/dsh-model-plus';
      tag.dataset.pluginCss = PLUGIN_CSS_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    insertStyles(`
      .mp-root{display:flex;flex-direction:column;gap:14px;max-width:920px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-sm-14)}
      .mp-h{margin:0;font:var(--dsw-font-md-16);font-weight:600}
      .mp-sub{margin:0;color:var(--dsw-alias-label-secondary);line-height:1.55}
      .mp-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}
      .mp-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .mp-tab{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}
      .mp-tab[data-on="1"]{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:var(--dsw-alias-label-on-primary,#fff)}
      .mp-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-start}
      .mp-field{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
      .mp-field-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;align-items:start}
      @media (max-width:640px){.mp-field-pair{grid-template-columns:1fr}}
      .mp-label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;min-height:18px}
      .mp-field-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;min-height:18px}
      .mp-import{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-base,transparent)}
      .mp-import-row{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch}
      .mp-import-row .mp-input{flex:1;min-width:180px}
      .mp-import-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .mp-test-out{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-base,transparent);white-space:pre-wrap;word-break:break-word;line-height:1.5;max-height:220px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
      .mp-test-meta{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
      .mp-test-grid{display:flex;flex-direction:column;gap:10px}
      .mp-test-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1,transparent)}
      .mp-test-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .mp-svg-frame{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden;background:#0b1220;min-height:200px}
      .mp-svg-frame iframe{display:block;width:100%;height:240px;border:0;background:#0b1220}
      .mp-test-progress{color:var(--dsw-alias-label-secondary);font-size:12px}
      .mp-select,.mp-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:8px;padding:8px 10px;font:inherit;color:inherit;width:100%;box-sizing:border-box;max-width:100%;min-width:0}
      .mp-input.wire{max-width:120px}
      .mp-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-secondary);color:inherit;border-radius:8px;padding:7px 11px;cursor:pointer;font:inherit}
      .mp-btn:disabled{opacity:.55;cursor:default}
      .mp-btn.primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:var(--dsw-alias-label-on-primary,#fff)}
      .mp-btn.small{padding:4px 8px;font-size:12px}
      .mp-error{color:var(--dsw-alias-state-danger,#f66);margin:0;white-space:pre-wrap}
      .mp-ok{color:var(--dsw-alias-state-success,#3c3);margin:0;white-space:pre-wrap}
      .mp-muted{color:var(--dsw-alias-label-tertiary);font-size:12px}
      .mp-model{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}
      .mp-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .mp-pill{display:inline-block;border-radius:999px;padding:1px 8px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.16));font-size:11px;margin-right:6px}
      .mp-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .mp-presets{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .mp-levels{display:flex;flex-direction:column;gap:6px}
      .mp-level{display:grid;grid-template-columns:24px 84px 1fr auto;gap:8px;align-items:center}
      .mp-level.disabled{opacity:.42}
      .mp-checkline{display:flex;gap:8px;align-items:center}
      .mp-ms{display:flex;flex-direction:column;gap:6px}
      .mp-ms-label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .mp-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .mp-chip{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base,transparent);color:inherit;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:12px;line-height:18px}
      .mp-chip[data-on="1"]{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:var(--dsw-alias-label-on-primary,#fff)}
      .mp-chip[data-locked="1"]{opacity:.72;cursor:default}
      .mp-chip:disabled{opacity:.5;cursor:default}
      .mp-ms-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .mp-wire-box{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px}
      .mp-linkbtn{border:0;background:transparent;color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-size:12px;padding:0;text-align:left}
      .mp-linkbtn:disabled{opacity:.55;cursor:default}
      .mp-linkbtn:hover:not(:disabled){text-decoration:underline}
      .mp-add-models{display:flex;flex-direction:column;gap:8px}
      .mp-add-model-row{display:grid;grid-template-columns:1.2fr 1fr auto;gap:8px;align-items:center}
      .mp-discover-box{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;max-height:240px;overflow:auto}
      .mp-discover-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
      .mp-discover-item{display:flex;gap:8px;align-items:flex-start}
      .mp-discover-item label{display:flex;gap:8px;align-items:flex-start;cursor:pointer;flex:1;min-width:0}
      .mp-discover-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4}
      .mp-warn{color:var(--dsw-alias-state-warning,#c90);margin:0;white-space:pre-wrap}
      .mp-table{width:100%;border-collapse:collapse;font-size:12px}
      .mp-table th,.mp-table td{border-top:1px solid var(--dsw-alias-border-l2);padding:8px 6px;text-align:left;vertical-align:top}
      .mp-table th{color:var(--dsw-alias-label-secondary);font-weight:500}
      .mp-prov{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px}
      .mp-quick{flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px}
      .mp-quick-main{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;flex:1;min-width:0}
      .mp-quick-text{display:flex;flex-direction:column;gap:2px;min-width:0}
      .mp-quick-btn{padding:9px 18px;font-weight:600}
      .mp-quick-result{margin:0}
      .mp-about-grid{display:flex;flex-direction:column;gap:10px}
      .mp-about-row{display:flex;flex-direction:column;gap:2px}
      .mp-about-val{color:var(--dsw-alias-label-primary);font-family:inherit}
      .mp-about-row code{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.16));border-radius:6px;padding:2px 6px;font-size:12px}
      .mp-link{color:var(--dsw-alias-state-business-primary);text-decoration:none;word-break:break-all}
      .mp-link:hover{text-decoration:underline}
      .mp-version-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .mp-update-result{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
      .mp-update-new{color:var(--dsw-alias-state-business-primary);font-weight:600}
    `);

    const LEVEL_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const ROUTE_PATTERN_CLIENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
    const FALLBACK_TEST_PROMPT = 'SVG绘制一个鹈鹕骑自行车的2D动画';

    function extractSvgClient(text) {
      let s = String(text || '').trim()
      if (!s) return ''
      const fenced = s.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i)
      if (fenced && fenced[1]) s = fenced[1].trim()
      const lower = s.toLowerCase()
      const start = lower.indexOf('<svg')
      if (start < 0) return ''
      const end = lower.lastIndexOf('</svg>')
      if (end < 0 || end < start) return ''
      const svg = s.slice(start, end + 6).trim()
      if (svg.length < 20) return ''
      if (/<script[\s>]/i.test(svg) || /\bon[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg)) return ''
      return svg
    }

    function SvgPreview(props) {
      const svg = props.svg || ''
      const title = props.title || 'SVG 预览'
      const srcDoc = React.useMemo(() => {
        if (!svg) return ''
        return '<!doctype html><html><head><meta charset="utf-8"/>'
          + '<style>html,body{margin:0;height:100%;background:#0b1220;display:flex;align-items:center;justify-content:center;overflow:hidden}'
          + 'svg{max-width:100%;max-height:100%;height:auto;width:auto}</style></head><body>'
          + svg + '</body></html>'
      }, [svg])
      if (!svg) return null
      return React.createElement('div', { className: 'mp-field' },
        React.createElement('span', { className: 'mp-label' }, title),
        React.createElement('div', { className: 'mp-svg-frame' },
          React.createElement('iframe', {
            title: title,
            sandbox: '',
            srcDoc: srcDoc,
          }),
        ),
      )
    }

    /** Hostname → 合法 Provider ID（点号变短横线）。ai.superaiapi.kdns.fr → ai-superaiapi-kdns-fr */
    function routeFromHostname(hostname) {
      let s = String(hostname || '').toLowerCase().replace(/^www\./, '')
      s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
      if (!s) s = 'gateway'
      if (!/^[a-z]/.test(s)) s = 'p-' + s
      if (s.length > 64) s = s.slice(0, 64).replace(/-+$/g, '')
      if (!ROUTE_PATTERN_CLIENT.test(s)) s = 'gateway'
      return s
    }

    function uniqueRouteId(base, takenList) {
      const taken = new Set((takenList || []).map((x) => String(x || '').toLowerCase()))
      let route = base
      let n = 2
      while (taken.has(route.toLowerCase())) {
        const suffix = '-' + n
        route = base.slice(0, Math.max(1, 64 - suffix.length)).replace(/-+$/g, '') + suffix
        n += 1
        if (n > 99) break
      }
      return route
    }

    /**
     * 从剪贴板/粘贴文本识别 baseURL + API Key。
     * 例：https://ai.superaiapi.kdns.fr/v1  sk-1234567
     *     https://x.com/v1,sk-xxx
     *     多行 URL / Key
     */
    function parseProviderPaste(text) {
      const raw = String(text || '').replace(/\u00a0/g, ' ').trim()
      if (!raw) return { ok: false, error: '内容为空' }

      const urlMatches = raw.match(/https?:\/\/[^\s,;，|'"`<>]+/gi) || []
      const urls = urlMatches.map((u) => u.replace(/[),.;]+$/g, '')).filter(Boolean)

      let baseURL = ''
      for (const u of urls) {
        try {
          const parsed = new URL(u)
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            baseURL = u
            break
          }
        } catch (_) {}
      }

      let rest = raw
      for (const u of urlMatches) rest = rest.split(u).join(' ')
      rest = rest
        .replace(/(?:^|[\s,;，])(?:api[_-]?key|token|authorization|bearer)\s*[:=]?\s*/gi, ' ')
        .replace(/[|，,;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      let apiKey = ''
      const bearer = raw.match(/\bbearer\s+([^\s,;，'"`]+)/i)
      if (bearer && bearer[1]) apiKey = bearer[1].replace(/^['"`]+|['"`]+$/g, '')
      if (!apiKey) {
        const sk = rest.match(/\b(sk-[A-Za-z0-9._\-]{6,})\b/) || raw.match(/\b(sk-[A-Za-z0-9._\-]{6,})\b/)
        if (sk && sk[1]) apiKey = sk[1]
      }
      if (!apiKey) {
        const tokens = rest.split(/\s+/).filter(Boolean)
        for (const t of tokens) {
          const cleaned = t.replace(/^['"`]+|['"`]+$/g, '')
          if (!cleaned || /^https?:/i.test(cleaned)) continue
          if (/^[A-Za-z0-9._\-]{16,4096}$/.test(cleaned) && /[A-Za-z]/.test(cleaned) && /\d/.test(cleaned)) {
            apiKey = cleaned
            break
          }
          if (/^sk-/i.test(cleaned) && cleaned.length >= 8) {
            apiKey = cleaned
            break
          }
        }
      }

      if (!baseURL && !apiKey) {
        return { ok: false, error: '未识别到 URL 或 API Key（示例：https://host/v1  sk-xxx）' }
      }

      let route = ''
      let displayName = ''
      let hostname = ''
      if (baseURL) {
        try {
          const u = new URL(baseURL)
          hostname = (u.hostname || '').replace(/^www\./i, '')
          route = routeFromHostname(hostname)
          displayName = hostname
        } catch (_) {}
      }

      return {
        ok: true,
        baseURL: baseURL,
        apiKey: apiKey,
        route: route,
        displayName: displayName,
        hostname: hostname,
      }
    }

    function toEditor(model) {
      return {
        disabled: !!model.disabled,
        vision: !!model.vision,
        contextWindow: model.contextWindow > 0 ? String(model.contextWindow) : '',
        maxTokens: model.maxTokens > 0 ? String(model.maxTokens) : '',
        levels: (model.levels || []).map((l) => ({ level: l.level, enabled: !!l.enabled, wire: l.wire || '', wireNull: !!l.wireNull })),
        showWire: false,
      };
    }

    function effortSummaryFromEditor(ed) {
      if (!ed) return '未设置';
      if (ed.disabled) return '关闭';
      const levels = ed.levels || [];
      const positive = LEVEL_ORDER.filter((lv) => lv !== 'off' && levels.some((r) => r.level === lv && r.enabled));
      if (positive.length) return positive[positive.length - 1];
      if (levels.some((r) => r.level === 'off' && r.enabled)) return '关闭';
      return '未设置';
    }

    function selectedLevels(ed) {
      if (!ed || ed.disabled) return [];
      return (ed.levels || []).filter((r) => r.enabled).map((r) => r.level);
    }

    /** Chip multi-select: toggle stays open-style (no dropdown), closer to official multi-select UX. */
    function MultiSelectChips(props) {
      const { label, options, selected, onToggle, disabled, hint } = props;
      const selectedSet = new Set(selected || []);
      return React.createElement('div', { className: 'mp-ms' },
        label ? React.createElement('div', { className: 'mp-ms-label' }, label) : null,
        React.createElement('div', { className: 'mp-chips' },
          (options || []).map((opt) => {
            const on = selectedSet.has(opt.value);
            const locked = !!opt.locked;
            return React.createElement('button', {
              key: opt.value,
              type: 'button',
              className: 'mp-chip',
              'data-on': on ? '1' : '0',
              'data-locked': locked ? '1' : '0',
              disabled: !!disabled || locked,
              title: opt.title || opt.label,
              onClick: () => { if (!locked && !disabled) onToggle(opt.value); },
            }, opt.label);
          }),
        ),
        hint ? React.createElement('div', { className: 'mp-ms-hint' }, hint) : null,
      );
    }

    function ModelsPlusPage() {
      const [loading, setLoading] = React.useState(true)
      const [busy, setBusy] = React.useState(false)
      const [tab, setTab] = React.useState('models')
      const [boot, setBoot] = React.useState(null)
      const [provider, setProvider] = React.useState('')
      const [detail, setDetail] = React.useState(null)
      const [editors, setEditors] = React.useState({})
      const [openId, setOpenId] = React.useState('')
      const [error, setError] = React.useState('')
      const [okMsg, setOkMsg] = React.useState('')
      const [overwriteEfforts, setOverwriteEfforts] = React.useState(false)
      const [catalogUrl, setCatalogUrl] = React.useState('https://models.dev/api.json')
      const [quickResult, setQuickResult] = React.useState(null)
      const [updateInfo, setUpdateInfo] = React.useState(null)
      const [checking, setChecking] = React.useState(false)
      const [showAdd, setShowAdd] = React.useState(false)
      const [addRoute, setAddRoute] = React.useState('')
      const [addName, setAddName] = React.useState('')
      const [addBaseURL, setAddBaseURL] = React.useState('')
      const [addApi, setAddApi] = React.useState('openai-completions')
      const [addKey, setAddKey] = React.useState('')
      const [addModelsText, setAddModelsText] = React.useState('')
      const [addModelRows, setAddModelRows] = React.useState([{ id: '', name: '' }])
      const [addShowManual, setAddShowManual] = React.useState(false)
      const [addImportText, setAddImportText] = React.useState('')
      const [addImportMsg, setAddImportMsg] = React.useState('')
      const [addImportErr, setAddImportErr] = React.useState('')
      const [importBusy, setImportBusy] = React.useState(false)
      const [discoverBusy, setDiscoverBusy] = React.useState(false)
      const [discoverError, setDiscoverError] = React.useState('')
      const [discoverCandidates, setDiscoverCandidates] = React.useState(null)
      const [discoverPicked, setDiscoverPicked] = React.useState({})
      const [testPrompt, setTestPrompt] = React.useState(FALLBACK_TEST_PROMPT)
      // 单模型思考强度覆盖：undefined/'' 表示「自动=该模型最高档」
      const [testEffortByModel, setTestEffortByModel] = React.useState({})
      // 并行单测：用 map 记录多个 in-flight 模型，不再全局只锁一个
      const [testBusyMap, setTestBusyMap] = React.useState({})
      const [testBatch, setTestBatch] = React.useState(false)
      const [testProgress, setTestProgress] = React.useState('')
      const [testResults, setTestResults] = React.useState({})
      const testStopRef = React.useRef(false)
      const testBusyCount = Object.keys(testBusyMap || {}).length
      const anyTestBusy = testBusyCount > 0

      /** 取模型已配置的最高思考档（off/关闭不算）；无配置或关闭推理 → 不传（关闭）。 */
      const maxEffortOfModel = (m) => {
        if (!m) return ''
        if (m.disabled) return ''
        const enabled = (m.levels || [])
          .filter((row) => row && row.enabled && row.level && row.level !== 'off')
          .map((row) => row.level)
        const ordered = LEVEL_ORDER.filter((lv) => lv !== 'off' && enabled.indexOf(lv) >= 0)
        if (ordered.length) return ordered[ordered.length - 1]
        // summary 可能已是最高档文案
        if (m.summary && m.summary !== '关闭' && m.summary !== '未设置' && LEVEL_ORDER.indexOf(m.summary) >= 0) {
          return m.summary
        }
        // 未配置强度：默认关闭推理（不传 effort）
        return ''
      }

      const resolveTestEffort = (modelId, model) => {
        const override = testEffortByModel && Object.prototype.hasOwnProperty.call(testEffortByModel, modelId)
          ? testEffortByModel[modelId]
          : undefined
        // 显式选了「不传」
        if (override === '__none__') return ''
        // 显式选了某档
        if (override && override !== '__auto__') return override
        // 自动：模型最高档
        return maxEffortOfModel(model)
      }
      const [enrichBusy, setEnrichBusy] = React.useState(false)
      const [enrichPreview, setEnrichPreview] = React.useState(null)

      const loadDetail = React.useCallback(async (prov) => {
        if (!prov) { setDetail(null); setEditors({}); return }
        const res = await api.listModels(prov)
        setDetail(res)
        const map = {}
        for (const m of (res.models || [])) map[m.id] = toEditor(m)
        setEditors(map)
      }, [])

      const reload = React.useCallback(async () => {
        setLoading(true); setError('')
        try {
          const b = await api.bootstrap()
          setBoot(b)
          setCatalogUrl(b.modelsDevUrl || b.defaultModelsDevUrl || b.defaultModelsUrl || 'https://models.dev/api.json')
          if (b.defaultTestPrompt) {
            setTestPrompt((prev) => (!prev || prev === FALLBACK_TEST_PROMPT) ? b.defaultTestPrompt : prev)
          }
          const rows = b.providers || []
          let prov = provider
          if (!prov || !rows.some((r) => r.provider === prov)) {
            const preferred = rows.find((r) => r.provider === 'newapi') || rows[0]
            prov = preferred ? preferred.provider : ''
            setProvider(prov)
          }
          await loadDetail(prov)
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setLoading(false) }
      }, [provider, loadDetail])

      React.useEffect(() => { reload() }, [])

      const switchProvider = async (next) => {
        setProvider(next); setOkMsg(''); setError(''); setBusy(true)
        testStopRef.current = true
        setTestResults({}); setTestProgress(''); setTestBusyMap({}); setTestBatch(false); setTestEffortByModel({})
        setEnrichPreview(null)
        try { await loadDetail(next) } catch (e) { setError(e && e.message ? e.message : String(e)) } finally { setBusy(false) }
      }

      const markTestBusy = (modelId, on) => {
        setTestBusyMap((prev) => {
          const next = Object.assign({}, prev || {})
          if (on) next[modelId] = true
          else delete next[modelId]
          return next
        })
      }

      const normalizeTestResult = (res, modelId) => {
        const base = res && typeof res === 'object' ? res : { ok: false, error: String(res || '空结果') }
        const text = base.text || ''
        const svg = base.svg || extractSvgClient(text)
        return Object.assign({}, base, {
          modelId: base.modelId || modelId,
          svg: svg || '',
          hasSvg: !!(svg || base.hasSvg),
          at: Date.now(),
        })
      }

      const runTestOne = async (modelId) => {
        const id = String(modelId || '').trim()
        if (!provider) throw new Error('请先选择供应商')
        if (!id) throw new Error('缺少模型 id')
        const model = ((detail && detail.models) || []).find((m) => m && m.id === id)
        const effort = resolveTestEffort(id, model)
        const payload = {
          provider: provider,
          modelId: id,
          prompt: testPrompt,
          maxTokens: (boot && boot.defaultTestMaxTokens) || 16384,
        }
        if (effort) payload.effort = effort
        try {
          const res = await api.testModel(payload)
          return normalizeTestResult(Object.assign({}, res, { effortUsed: effort || '' }), id)
        } catch (e) {
          return normalizeTestResult({
            ok: false,
            modelId: id,
            effortUsed: effort || '',
            error: e && e.message ? e.message : String(e),
            message: e && e.message ? e.message : String(e),
          }, id)
        }
      }

      const runTestModel = async (modelId) => {
        // 全量测试进行中时，禁止再开并行单测，避免进度混乱
        if (testBatch) return
        if (!modelId || testBusyMap[modelId]) return
        setError(''); setOkMsg('')
        markTestBusy(modelId, true)
        setTestResults((prev) => Object.assign({}, prev, {
          [modelId]: { ok: null, modelId: modelId, pending: true, message: '测试中…' },
        }))
        try {
          const res = await runTestOne(modelId)
          setTestResults((prev) => Object.assign({}, prev, { [modelId]: res }))
          if (res.ok) setOkMsg((res.modelId || modelId) + ' · ' + (res.message || '成功'))
          else setError((res.modelId || modelId) + ' · ' + (res.error || res.message || '失败'))
        } finally {
          markTestBusy(modelId, false)
        }
      }

      const runTestAll = async () => {
        if (testBatch || anyTestBusy) return
        if (!provider) { setError('请先选择供应商'); return }
        const ids = ((detail && detail.models) || []).map((m) => m.id).filter(Boolean)
        if (!ids.length) { setError('当前供应商没有模型可测'); return }
        testStopRef.current = false
        setTestBatch(true); setError(''); setOkMsg(''); setTestProgress('0/' + ids.length)
        let pass = 0
        let fail = 0
        try {
          for (let i = 0; i < ids.length; i++) {
            if (testStopRef.current) {
              setTestProgress('已停止 · ' + (i) + '/' + ids.length)
              break
            }
            const id = ids[i]
            markTestBusy(id, true)
            setTestProgress((i + 1) + '/' + ids.length + ' · ' + id)
            setTestResults((prev) => Object.assign({}, prev, {
              [id]: { ok: null, modelId: id, pending: true, message: '测试中…' },
            }))
            try {
              const res = await runTestOne(id)
              if (res.ok) pass += 1
              else fail += 1
              setTestResults((prev) => Object.assign({}, prev, { [id]: res }))
            } finally {
              markTestBusy(id, false)
            }
          }
          if (!testStopRef.current) {
            setOkMsg('全量测试完成：成功 ' + pass + ' · 失败 ' + fail)
            setTestProgress('完成 · 成功 ' + pass + ' · 失败 ' + fail)
          }
        } finally {
          setTestBusyMap({})
          setTestBatch(false)
        }
      }

      const stopTestAll = () => {
        testStopRef.current = true
        setTestProgress((p) => (p ? (p + ' · 停止中…') : '停止中…'))
      }

      const clearTestResults = () => {
        setTestResults({})
        setTestProgress('')
        setOkMsg('')
        setError('')
      }

      const resetTestPrompt = () => {
        setTestPrompt((boot && boot.defaultTestPrompt) || FALLBACK_TEST_PROMPT)
      }

      const runEnrichModels = async (apply) => {
        if (!provider) { setError('请先选择供应商'); return }
        setEnrichBusy(true); setError(''); setOkMsg('')
        try {
          const res = await api.enrichModels({
            provider: provider,
            apply: !!apply,
            overwrite: !!overwriteEfforts,
            catalogUrl: catalogUrl,
          })
          setEnrichPreview(res)
          if (apply && res.applied) {
            setOkMsg(res.message || '已补全并写回')
            await loadDetail(provider)
            setBoot(await api.bootstrap())
          } else {
            setOkMsg(res.message || '预览完成')
          }
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        } finally {
          setEnrichBusy(false)
        }
      }

      const patchEditor = (id, patch) => setEditors((prev) => Object.assign({}, prev, { [id]: Object.assign({}, prev[id] || {}, patch) }))
      const patchLevel = (id, level, patch) => setEditors((prev) => {
        const cur = prev[id] || { levels: [] }
        const levels = (cur.levels || []).map((row) => row.level === level ? Object.assign({}, row, patch) : row)
        return Object.assign({}, prev, { [id]: Object.assign({}, cur, { levels: levels }) })
      })

      /** Toggle a reasoning level chip. Empty selection ⇒ disabled (reasoningEfforts: false). */
      const toggleEffortChip = (id, level) => setEditors((prev) => {
        const cur = Object.assign({ levels: [], disabled: false, vision: false }, prev[id] || {})
        let levels = (cur.levels || []).map((row) => Object.assign({}, row))
        if (!levels.length) {
          levels = LEVEL_ORDER.map((lv) => ({
            level: lv,
            enabled: false,
            wire: lv === 'off' ? '' : lv,
            wireNull: lv === 'off',
          }))
        }
        const idx = levels.findIndex((row) => row.level === level)
        if (idx < 0) {
          levels.push({
            level: level,
            enabled: true,
            wire: level === 'off' ? '' : level,
            wireNull: level === 'off',
          })
        } else {
          const row = levels[idx]
          const nextEnabled = !row.enabled
          levels[idx] = Object.assign({}, row, {
            enabled: nextEnabled,
            wire: nextEnabled
              ? (row.wireNull ? '' : (row.wire || (level === 'off' ? '' : level)))
              : row.wire,
          })
        }
        const anyPositive = levels.some((row) => row.enabled && row.level !== 'off')
        const anyEnabled = levels.some((row) => row.enabled)
        // No chips / only off → treat as 关闭推理（与 host normalizeEditor 一致）
        const disabled = !anyPositive
        if (disabled) {
          // keep off checked visually only when user explicitly had only-off; otherwise clear all
          if (!anyEnabled) {
            levels = levels.map((row) => Object.assign({}, row, { enabled: false }))
          }
        }
        return Object.assign({}, prev, {
          [id]: Object.assign({}, cur, {
            levels: levels,
            disabled: disabled,
          }),
        })
      })

      const toggleVisionChip = (id, value) => {
        if (value === 'text') return
        setEditors((prev) => {
          const cur = prev[id] || {}
          return Object.assign({}, prev, {
            [id]: Object.assign({}, cur, { vision: !cur.vision }),
          })
        })
      }

      const saveModel = async (id) => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const ed0 = editors[id] || {}
          const editor = Object.assign({}, ed0, {
            contextWindow: ed0.contextWindow ? Number(ed0.contextWindow) : 0,
            maxTokens: ed0.maxTokens ? Number(ed0.maxTokens) : 0,
            clearContextWindow: !ed0.contextWindow,
            clearMaxTokens: !ed0.maxTokens,
          })
          const res = await api.saveModel({ provider: provider, modelId: id, editor: editor })
          setOkMsg(res.message || '已保存')
          await loadDetail(provider)
          setBoot(await api.bootstrap())
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const applyPreset = async (id, presetId) => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await api.applyPreset({ provider: provider, modelId: id, presetId: presetId })
          setOkMsg(res.message || '已应用预设')
          await loadDetail(provider)
          setOpenId(id)
          setBoot(await api.bootstrap())
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const quickSync = async () => {
        // 一键同步 = 目录补全并写回（默认 models.dev，可自定义）
        if (!provider) { setError('请先选择供应商'); return }
        setBusy(true); setError(''); setOkMsg(''); setQuickResult(null)
        try {
          const res = await api.enrichModels({
            provider: provider,
            apply: true,
            overwrite: !!overwriteEfforts,
            catalogUrl: catalogUrl,
          })
          setQuickResult(res)
          setEnrichPreview(res)
          setOkMsg(res.message || '已同步')
          await loadDetail(provider)
          setBoot(await api.bootstrap())
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
          setQuickResult({ error: e && e.message ? e.message : String(e) })
        }
        finally { setBusy(false) }
      }

      const saveCatalogUrl = async () => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await api.saveCatalogUrl({ catalogUrl: catalogUrl })
          setOkMsg(res.message || '已保存目录地址')
          if (res.catalogUrl) setCatalogUrl(res.catalogUrl)
          setBoot(await api.bootstrap())
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }

      const runCheckUpdate = async () => {
        setChecking(true); setUpdateInfo(null)
        try {
          setUpdateInfo(await api.checkUpdate())
        } catch (e) {
          setUpdateInfo({ ok: false, error: e && e.message ? e.message : String(e) })
        }
        finally { setChecking(false) }
      }

      const resetAddForm = () => {
        setAddRoute('')
        setAddName('')
        setAddBaseURL('')
        setAddApi('openai-completions')
        setAddKey('')
        setAddModelsText('')
        setAddModelRows([{ id: '', name: '' }])
        setAddShowManual(false)
        setAddImportText('')
        setAddImportMsg('')
        setAddImportErr('')
        setImportBusy(false)
        setDiscoverBusy(false)
        setDiscoverError('')
        setDiscoverCandidates(null)
        setDiscoverPicked({})
      }

      const listableProtocols = (boot && boot.listableProtocols) || ['openai-completions', 'openai-responses']
      const addApiListable = listableProtocols.indexOf(addApi) >= 0

      /** 识别粘贴文本并填入添加表单；route 默认用主机名（点→短横线）。 */
      const applyProviderImport = (text, opts) => {
        const options = opts || {}
        const parsed = parseProviderPaste(text)
        if (!parsed.ok) {
          setAddImportErr(parsed.error || '识别失败')
          setAddImportMsg('')
          return false
        }
        const taken = ((boot && boot.providers) || []).map((p) => p.provider)
        const parts = []
        if (parsed.baseURL) {
          setAddBaseURL(parsed.baseURL)
          parts.push('baseURL')
        }
        if (parsed.apiKey) {
          setAddKey(parsed.apiKey)
          parts.push('API Key')
        }
        // ID：空着或允许覆盖时，用主机名生成
        if (parsed.route && (options.forceRoute || !String(addRoute || '').trim())) {
          const route = uniqueRouteId(parsed.route, taken)
          setAddRoute(route)
          parts.push('ID=' + route)
        }
        // 显示名：默认填主机名（用户可再改/清空）
        if (parsed.displayName && (options.forceName || !String(addName || '').trim())) {
          setAddName(parsed.displayName)
          parts.push('名称=' + parsed.displayName)
        }
        // 有 URL 时默认 openai-completions（可探测）
        if (parsed.baseURL && addApi === 'anthropic-messages') {
          setAddApi('openai-completions')
        }
        setDiscoverCandidates(null)
        setDiscoverPicked({})
        setDiscoverError('')
        setAddImportErr('')
        setAddImportMsg('已识别并填入：' + parts.join(' · '))
        setOkMsg('')
        setError('')
        return true
      }

      const importFromClipboard = async () => {
        setImportBusy(true)
        setAddImportErr('')
        setAddImportMsg('')
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
            throw new Error('当前环境无法读剪贴板，请粘贴到上方输入框后点「识别填入」')
          }
          const text = await navigator.clipboard.readText()
          setAddImportText(text || '')
          if (!applyProviderImport(text, { forceRoute: !String(addRoute || '').trim(), forceName: !String(addName || '').trim() })) {
            // error already set
          }
        } catch (e) {
          setAddImportErr(e && e.message ? e.message : String(e))
        } finally {
          setImportBusy(false)
        }
      }

      const importFromText = () => {
        applyProviderImport(addImportText, {
          forceRoute: !String(addRoute || '').trim(),
          forceName: !String(addName || '').trim(),
        })
      }

      const parseAddModels = () => {
        // 1) 勾选的探测结果  2) 多行粘贴  3) 手填表格行
        const fromDiscover = []
        if (discoverCandidates && discoverCandidates.length) {
          for (const c of discoverCandidates) {
            if (!c || !c.id || !discoverPicked[c.id]) continue
            const m = { id: c.id }
            if (c.name) m.name = c.name
            if (typeof c.contextWindow === 'number' && c.contextWindow > 0) m.contextWindow = c.contextWindow
            if (typeof c.maxTokens === 'number' && c.maxTokens > 0) m.maxTokens = c.maxTokens
            fromDiscover.push(m)
          }
        }
        const fromText = String(addModelsText || '')
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('|').map((p) => p.trim())
            const id = parts[0] || ''
            const name = parts[1] || ''
            return name ? { id: id, name: name } : { id: id }
          })
        const fromRows = (addModelRows || [])
          .map((r) => ({ id: String(r.id || '').trim(), name: String(r.name || '').trim() }))
          .filter((r) => r.id)
          .map((r) => (r.name ? { id: r.id, name: r.name } : { id: r.id }))
        const merged = []
        const seen = Object.create(null)
        for (const m of fromDiscover.concat(fromText).concat(fromRows)) {
          const key = String(m.id || '').toLowerCase()
          if (!m.id || seen[key]) continue
          seen[key] = true
          merged.push(m)
        }
        return merged
      }

      const runDiscoverModels = async () => {
        setDiscoverBusy(true); setDiscoverError(''); setOkMsg('')
        try {
          if (!addBaseURL.trim()) throw new Error('请先填写 baseURL')
          if (!addApiListable) throw new Error('当前协议不支持自动获取模型，请手填')
          const res = await api.discoverModels({
            baseURL: addBaseURL.trim(),
            api: addApi,
            apiKey: addKey,
          })
          const found = res.models || []
          setDiscoverCandidates(found)
          const picked = {}
          for (const m of found) if (m && m.id) picked[m.id] = true
          setDiscoverPicked(picked)
          setOkMsg(res.message || ('已获取 ' + found.length + ' 个模型'))
        } catch (e) {
          setDiscoverCandidates(null)
          setDiscoverPicked({})
          setDiscoverError(e && e.message ? e.message : String(e))
        } finally {
          setDiscoverBusy(false)
        }
      }

      const toggleDiscoverPick = (id) => {
        setDiscoverPicked((prev) => {
          const next = Object.assign({}, prev)
          next[id] = !next[id]
          return next
        })
      }

      const pickAllDiscover = (on) => {
        if (!discoverCandidates) return
        const next = {}
        for (const m of discoverCandidates) if (m && m.id) next[m.id] = !!on
        setDiscoverPicked(next)
      }

      const submitAddProvider = async () => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const models = parseAddModels()
          // 已点过「获取模型」：必须至少勾选/手填一个，避免误把全量再拉一遍
          // 从未探测且无手填：不传 models，host 对 listable 协议默认拉一次
          if (discoverCandidates && !models.length) {
            throw new Error('请至少勾选一个模型，或改用手填')
          }
          if (!addApiListable && !models.length) {
            throw new Error('当前协议需至少手填一个模型 id')
          }
          const payload = {
            route: addRoute.trim(),
            displayName: addName.trim(),
            baseURL: addBaseURL.trim(),
            api: addApi,
            apiKey: addKey,
          }
          if (models.length) payload.models = models
          const res = await api.addProvider(payload)
          setOkMsg(res.message || ('已添加 ' + (res.provider || addRoute)))
          if (res.warning) setError(res.warning)
          setShowAdd(false)
          resetAddForm()
          const nextProv = res.provider || addRoute.trim()
          setProvider(nextProv)
          const b = await api.bootstrap()
          setBoot(b)
          await loadDetail(nextProv)
          setTab('models')
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }

      if (loading) return React.createElement('div', { className: 'mp-root' }, React.createElement('h2', { className: 'mp-h' }, '模型 Plus'), React.createElement('p', { className: 'mp-sub' }, '加载中…'))

      const providers = (boot && boot.providers) || []
      const presets = (boot && boot.presets) || []
      const models = (detail && detail.models) || []
      const selected = providers.find((p) => p.provider === provider)

      return React.createElement('div', { className: 'mp-root' },
        React.createElement('h2', { className: 'mp-h' }, '模型 Plus'),
        React.createElement('p', { className: 'mp-sub' }, (boot && boot.note) || ''),

        React.createElement('div', { className: 'mp-card mp-quick' },
          React.createElement('div', { className: 'mp-quick-main' },
            React.createElement('div', { className: 'mp-quick-text' },
              React.createElement('strong', null, '一键同步'),
              React.createElement('span', { className: 'mp-muted' }, '按模型 id 补全思考强度 / 上下文 / 视觉，并写回当前供应商'),
            ),
            React.createElement('button', {
              type: 'button', className: 'mp-btn primary mp-quick-btn',
              disabled: busy || enrichBusy || !provider || !(boot && boot.writable),
              title: provider ? ('同步到：' + provider) : '请先选择供应商',
              onClick: quickSync,
            }, (busy || enrichBusy) ? '同步中…' : '一键同步'),
          ),
          quickResult && React.createElement('div', { className: 'mp-muted mp-quick-result' },
            quickResult.error
              ? '同步失败：' + quickResult.error
              : ((quickResult.message || ('变更 ' + (quickResult.changeCount || 0)))
                + (quickResult.hitCount != null ? (' · 命中 ' + quickResult.hitCount + '/' + (quickResult.localCount || 0)) : '')),
          ),
        ),

        React.createElement('div', { className: 'mp-card' },
          React.createElement('div', { className: 'mp-tabs' },
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'models' ? '1' : '0', onClick: () => setTab('models') }, '思考强度'),
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'context' ? '1' : '0', onClick: () => setTab('context') }, '上下文'),
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'test' ? '1' : '0', onClick: () => setTab('test') }, '模型测试'),
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'sync' ? '1' : '0', onClick: () => setTab('sync') }, '同步设置'),
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'about' ? '1' : '0', onClick: () => setTab('about') }, '关于'),
          ),
          React.createElement('div', { className: 'mp-row' },
            React.createElement('div', { className: 'mp-field' },
              React.createElement('span', { className: 'mp-label' }, '本地供应商（仅本地编辑/应用范围）'),
              React.createElement('select', {
                className: 'mp-select', value: provider, disabled: busy || !providers.length,
                onChange: (ev) => switchProvider(ev.target.value),
              }, !providers.length
                ? React.createElement('option', { value: '' }, '无供应商')
                : providers.map((p) => React.createElement('option', { key: p.provider, value: p.provider },
                  (p.displayName || p.provider) + ' · 强度 ' + (p.withEffort || 0) + '/' + (p.modelCount || 0) + ' · 视觉 ' + (p.withVision || 0)))),
            ),
            React.createElement('button', {
              type: 'button', className: 'mp-btn primary', disabled: busy || !(boot && boot.writable),
              onClick: () => { setShowAdd((v) => !v); setError(''); setOkMsg('') },
            }, showAdd ? '收起添加' : '添加供应商'),
            React.createElement('button', { type: 'button', className: 'mp-btn', disabled: busy, onClick: reload }, '刷新'),
          ),
          selected && React.createElement('div', { className: 'mp-prov' },
            React.createElement('div', null, React.createElement('strong', null, selected.displayName || selected.provider)),
            React.createElement('div', { className: 'mp-muted' },
              (selected.baseURL || '无 baseURL') + (selected.api ? (' · ' + selected.api) : ''),
            ),
          ),
          showAdd && React.createElement('div', { className: 'mp-prov', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement('strong', null, '添加自定义提供方'),
            React.createElement('p', { className: 'mp-muted', style: { margin: 0 } },
              '可一键识别「URL + Key」填入；也可手填。创建时 listable 协议会默认获取模型。',
            ),
            React.createElement('div', { className: 'mp-import' },
              React.createElement('div', { className: 'mp-discover-head' },
                React.createElement('span', { className: 'mp-label' }, '一键导入（URL + API Key）'),
                React.createElement('div', { className: 'mp-import-actions' },
                  React.createElement('button', {
                    type: 'button', className: 'mp-btn small primary',
                    disabled: busy || discoverBusy || importBusy,
                    title: '读取系统剪贴板并识别',
                    onClick: importFromClipboard,
                  }, importBusy ? '读取中…' : '从剪贴板导入'),
                  React.createElement('button', {
                    type: 'button', className: 'mp-btn small',
                    disabled: busy || discoverBusy || importBusy || !String(addImportText || '').trim(),
                    onClick: importFromText,
                  }, '识别填入'),
                ),
              ),
              React.createElement('div', { className: 'mp-import-row' },
                React.createElement('input', {
                  className: 'mp-input',
                  value: addImportText,
                  disabled: busy || discoverBusy || importBusy,
                  placeholder: '粘贴：https://ai.example.com/v1  sk-xxxx',
                  onChange: (ev) => {
                    setAddImportText(ev.target.value)
                    setAddImportErr('')
                    setAddImportMsg('')
                  },
                  onPaste: (ev) => {
                    // 粘贴后自动识别（下一 tick 读 value 更稳，这里直接用 clipboardData）
                    try {
                      const clip = ev.clipboardData && ev.clipboardData.getData
                        ? ev.clipboardData.getData('text')
                        : ''
                      if (clip && clip.trim()) {
                        // 让受控输入先吃到粘贴内容
                        setTimeout(() => {
                          setAddImportText(clip)
                          applyProviderImport(clip, {
                            forceRoute: !String(addRoute || '').trim(),
                            forceName: !String(addName || '').trim(),
                          })
                        }, 0)
                      }
                    } catch (_) {}
                  },
                }),
              ),
              React.createElement('span', { className: 'mp-field-hint' },
                '支持空格/逗号/换行分隔。ID 默认用主机名（点→短横线），如 ai.superaiapi.kdns.fr → ai-superaiapi-kdns-fr',
              ),
              addImportMsg && React.createElement('p', { className: 'mp-ok', style: { margin: 0 } }, addImportMsg),
              addImportErr && React.createElement('p', { className: 'mp-error', style: { margin: 0 } }, addImportErr),
            ),
            React.createElement('div', { className: 'mp-field-pair' },
              React.createElement('div', { className: 'mp-field' },
                React.createElement('span', { className: 'mp-label' }, 'Provider ID（必填）'),
                React.createElement('input', {
                  className: 'mp-input', value: addRoute, disabled: busy,
                  placeholder: 'acme-gateway',
                  onChange: (ev) => setAddRoute(ev.target.value),
                }),
                React.createElement('span', { className: 'mp-field-hint' }, '小写字母开头，仅 a-z / 0-9 / -'),
              ),
              React.createElement('div', { className: 'mp-field' },
                React.createElement('span', { className: 'mp-label' }, '显示名称（可选）'),
                React.createElement('input', {
                  className: 'mp-input', value: addName, disabled: busy,
                  placeholder: addRoute || '默认用 Provider ID',
                  onChange: (ev) => setAddName(ev.target.value),
                }),
                React.createElement('span', { className: 'mp-field-hint' }, '可不填；导入时默认填主机名'),
              ),
            ),
            React.createElement('div', { className: 'mp-field-pair' },
              React.createElement('div', { className: 'mp-field' },
                React.createElement('span', { className: 'mp-label' }, 'API 地址 baseURL（必填）'),
                React.createElement('input', {
                  className: 'mp-input', value: addBaseURL, disabled: busy || discoverBusy,
                  placeholder: 'https://gateway.example/v1',
                  onChange: (ev) => setAddBaseURL(ev.target.value),
                }),
                React.createElement('span', { className: 'mp-field-hint' }, 'OpenAI 兼容网关一般以 /v1 结尾'),
              ),
              React.createElement('div', { className: 'mp-field' },
                React.createElement('span', { className: 'mp-label' }, 'API 协议'),
                React.createElement('select', {
                  className: 'mp-select', value: addApi, disabled: busy || discoverBusy,
                  onChange: (ev) => {
                    setAddApi(ev.target.value)
                    setDiscoverCandidates(null)
                    setDiscoverPicked({})
                    setDiscoverError('')
                  },
                }, ((boot && boot.protocols) || ['openai-completions', 'openai-responses', 'anthropic-messages']).map((p) =>
                  React.createElement('option', { key: p, value: p }, p))),
                React.createElement('span', { className: 'mp-field-hint' },
                  addApiListable ? '支持「获取模型」' : '需手填模型 id'),
              ),
            ),
            React.createElement('div', { className: 'mp-field' },
              React.createElement('span', { className: 'mp-label' }, 'API Key（可选，探测时一并带上）'),
              React.createElement('input', {
                className: 'mp-input', type: 'password', autoComplete: 'off',
                value: addKey, disabled: busy || discoverBusy,
                placeholder: (boot && boot.canStoreApiKey) ? 'sk-…（保存到凭据库）' : '当前环境可能无法写入凭据，可稍后在官方模型页补填',
                onChange: (ev) => setAddKey(ev.target.value),
              }),
              !(boot && boot.canStoreApiKey) && React.createElement('span', { className: 'mp-warn' },
                '未检测到 credentials 服务：仍可创建提供方，但 Key 不会落盘。'),
            ),
            React.createElement('div', { className: 'mp-field' },
              React.createElement('div', { className: 'mp-discover-head' },
                React.createElement('span', { className: 'mp-label' }, '模型列表'),
                React.createElement('div', { className: 'mp-actions' },
                  React.createElement('button', {
                    type: 'button', className: 'mp-btn small primary',
                    disabled: busy || discoverBusy || !addBaseURL.trim() || !addApiListable,
                    title: addApiListable ? '请求 baseURL/models（官方同款）' : '当前协议不支持自动获取',
                    onClick: runDiscoverModels,
                  }, discoverBusy ? '获取中…' : '获取模型'),
                  React.createElement('button', {
                    type: 'button', className: 'mp-linkbtn',
                    disabled: busy || discoverBusy,
                    onClick: () => setAddShowManual((v) => !v),
                  }, addShowManual ? '收起手填' : '手填 / 粘贴'),
                ),
              ),
              !addApiListable && React.createElement('p', { className: 'mp-muted', style: { margin: 0 } },
                '协议「' + addApi + '」不支持自动列表，请用手填。'),
              addApiListable && !discoverCandidates && React.createElement('p', { className: 'mp-muted', style: { margin: 0 } },
                '可点「获取模型」勾选（会用 models.dev 补全强度/上下文）；不点直接创建时也会默认拉一次。'),
              discoverError && React.createElement('p', { className: 'mp-error' }, discoverError),
              discoverCandidates && discoverCandidates.length > 0 && React.createElement('div', { className: 'mp-discover-box' },
                React.createElement('div', { className: 'mp-discover-head' },
                  React.createElement('span', { className: 'mp-muted' },
                    '共 ' + discoverCandidates.length + ' 个 · 已选 ' + discoverCandidates.filter((m) => m && m.id && discoverPicked[m.id]).length),
                  React.createElement('div', { className: 'mp-actions' },
                    React.createElement('button', { type: 'button', className: 'mp-linkbtn', disabled: busy || discoverBusy, onClick: () => pickAllDiscover(true) }, '全选'),
                    React.createElement('button', { type: 'button', className: 'mp-linkbtn', disabled: busy || discoverBusy, onClick: () => pickAllDiscover(false) }, '全不选'),
                  ),
                ),
                discoverCandidates.map((m) => React.createElement('div', { key: m.id, className: 'mp-discover-item' },
                  React.createElement('label', null,
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: !!discoverPicked[m.id],
                      disabled: busy || discoverBusy,
                      onChange: () => toggleDiscoverPick(m.id),
                    }),
                    React.createElement('span', null,
                      React.createElement('div', null, m.id),
                      React.createElement('div', { className: 'mp-discover-meta' },
                        [m.name, m.contextWindow ? ('ctx ' + m.contextWindow) : '', m.maxTokens ? ('max ' + m.maxTokens) : '']
                          .filter(Boolean).join(' · ') || '无附加字段',
                      ),
                    ),
                  ),
                )),
              ),
              addShowManual && React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'mp-add-models' },
                  (addModelRows || []).map((row, idx) => React.createElement('div', { key: idx, className: 'mp-add-model-row' },
                    React.createElement('input', {
                      className: 'mp-input', value: row.id, disabled: busy, placeholder: '模型 id，如 gpt-4o',
                      onChange: (ev) => setAddModelRows((prev) => prev.map((r, i) => i === idx ? Object.assign({}, r, { id: ev.target.value }) : r)),
                    }),
                    React.createElement('input', {
                      className: 'mp-input', value: row.name || '', disabled: busy, placeholder: '显示名（可选）',
                      onChange: (ev) => setAddModelRows((prev) => prev.map((r, i) => i === idx ? Object.assign({}, r, { name: ev.target.value }) : r)),
                    }),
                    React.createElement('button', {
                      type: 'button', className: 'mp-btn small', disabled: busy || addModelRows.length <= 1,
                      onClick: () => setAddModelRows((prev) => prev.filter((_, i) => i !== idx)),
                    }, '删'),
                  )),
                  React.createElement('div', { className: 'mp-actions' },
                    React.createElement('button', {
                      type: 'button', className: 'mp-btn small', disabled: busy,
                      onClick: () => setAddModelRows((prev) => prev.concat([{ id: '', name: '' }])),
                    }, '添加模型行'),
                  ),
                ),
                React.createElement('span', { className: 'mp-label', style: { marginTop: 6 } }, '或批量粘贴（每行一个 id，可用 id|显示名）'),
                React.createElement('textarea', {
                  className: 'mp-input', rows: 3, disabled: busy, value: addModelsText,
                  placeholder: 'claude-sonnet-4\ngpt-4o|GPT-4o',
                  onChange: (ev) => setAddModelsText(ev.target.value),
                  style: { resize: 'vertical', minHeight: 64, fontFamily: 'inherit' },
                }),
              ),
            ),
            React.createElement('div', { className: 'mp-actions' },
              React.createElement('button', {
                type: 'button', className: 'mp-btn primary',
                disabled: busy || discoverBusy || !(boot && boot.writable) || !addRoute.trim() || !addBaseURL.trim(),
                onClick: submitAddProvider,
              }, busy ? '创建中…' : '创建提供方'),
              React.createElement('button', {
                type: 'button', className: 'mp-btn', disabled: busy || discoverBusy,
                onClick: () => { setShowAdd(false); resetAddForm() },
              }, '取消'),
            ),
          ),
          error && React.createElement('p', { className: 'mp-error' }, error),
          okMsg && React.createElement('p', { className: 'mp-ok' }, okMsg),
        ),

        tab === 'context' && React.createElement('div', { className: 'mp-card' },
          React.createElement('p', { className: 'mp-sub', style: { margin: 0 } },
            '编辑当前供应商各模型的上下文窗口和默认输出上限。保存后写入对应模型，不会创建 compat。',
          ),
          !models.length
            ? React.createElement('p', { className: 'mp-sub' }, '当前供应商没有可编辑模型。')
            : React.createElement('table', { className: 'mp-table' },
                React.createElement('thead', null, React.createElement('tr', null,
                  React.createElement('th', null, '模型'),
                  React.createElement('th', null, 'contextWindow'),
                  React.createElement('th', null, 'maxTokens'),
                  React.createElement('th', null, '操作'),
                )),
                React.createElement('tbody', null, models.map((m) => {
                  const ed = editors[m.id] || toEditor(m)
                  return React.createElement('tr', { key: m.id },
                    React.createElement('td', null,
                      React.createElement('strong', null, m.id),
                      React.createElement('div', { className: 'mp-muted' }, m.name || ''),
                    ),
                    React.createElement('td', null, React.createElement('input', {
                      className: 'mp-input', type: 'number', min: 1, step: 1,
                      value: ed.contextWindow || '', disabled: busy,
                      placeholder: '例如 500000',
                      onChange: (ev) => patchEditor(m.id, { contextWindow: ev.target.value }),
                    })),
                    React.createElement('td', null, React.createElement('input', {
                      className: 'mp-input', type: 'number', min: 1, step: 1,
                      value: ed.maxTokens || '', disabled: busy,
                      placeholder: '例如 128000',
                      onChange: (ev) => patchEditor(m.id, { maxTokens: ev.target.value }),
                    })),
                    React.createElement('td', null, React.createElement('button', {
                      type: 'button', className: 'mp-btn small primary', disabled: busy,
                      onClick: () => saveModel(m.id),
                    }, '保存')),
                  )
                })),
              ),
        ),

        tab === 'test' && React.createElement('div', { className: 'mp-card' },
          React.createElement('p', { className: 'mp-sub', style: { margin: 0 } },
            '默认提示词：SVG绘制一个鹈鹕骑自行车的2D动画。成功后尽量解析并预览 SVG。支持单模型并行测试与一键全测。',
          ),
          !provider
            ? React.createElement('p', { className: 'mp-sub' }, '请先选择供应商。')
            : React.createElement(React.Fragment, null,
              selected && React.createElement('div', { className: 'mp-muted' },
                (selected.displayName || selected.provider) + ' · ' + (selected.baseURL || '无 baseURL') + (selected.api ? (' · ' + selected.api) : '')
                + ' · ' + models.length + ' 个模型',
              ),
              React.createElement('div', { className: 'mp-field' },
                React.createElement('span', { className: 'mp-label' }, '批量操作'),
                React.createElement('div', { className: 'mp-actions' },
                  React.createElement('button', {
                    type: 'button',
                    className: 'mp-btn primary',
                    disabled: busy || anyTestBusy || testBatch || !models.length,
                    onClick: runTestAll,
                  }, testBatch ? '全量测试中…' : ('一键测试全部（' + models.length + '）')),
                  testBatch && React.createElement('button', {
                    type: 'button', className: 'mp-btn', onClick: stopTestAll,
                  }, '停止'),
                  React.createElement('button', {
                    type: 'button',
                    className: 'mp-btn',
                    disabled: busy || anyTestBusy || testBatch || !Object.keys(testResults).length,
                    onClick: clearTestResults,
                  }, '清空结果'),
                ),
                React.createElement('span', { className: 'mp-field-hint' },
                  '默认：已配置则用最高档；未配置则关闭推理（不传）。可在单模型卡片上单独改。',
                ),
                testProgress
                  ? React.createElement('div', { className: 'mp-test-progress' }, testProgress)
                  : (anyTestBusy
                    ? React.createElement('div', { className: 'mp-test-progress' }, '并行测试中 · ' + testBusyCount + ' 个')
                    : null),
              ),
              React.createElement('div', { className: 'mp-field' },
                React.createElement('div', { className: 'mp-discover-head' },
                  React.createElement('span', { className: 'mp-label' }, '测试提示词'),
                  React.createElement('button', {
                    type: 'button', className: 'mp-linkbtn',
                    disabled: busy || anyTestBusy || testBatch,
                    onClick: resetTestPrompt,
                  }, '恢复默认（鹈鹕自行车 SVG）'),
                ),
                React.createElement('textarea', {
                  className: 'mp-input',
                  rows: 5,
                  disabled: busy || anyTestBusy || testBatch,
                  value: testPrompt,
                  onChange: (ev) => setTestPrompt(ev.target.value),
                  style: { resize: 'vertical', minHeight: 96, fontFamily: 'inherit' },
                }),
              ),
              !models.length
                ? React.createElement('p', { className: 'mp-sub' }, '当前供应商没有模型。可先在「思考强度」同步/添加模型。')
                : React.createElement('div', { className: 'mp-test-grid' },
                  models.map((m) => {
                    const tr = testResults[m.id]
                    const pending = !!(tr && tr.pending) || !!testBusyMap[m.id]
                    const autoEffort = maxEffortOfModel(m)
                    const effortSelect = Object.prototype.hasOwnProperty.call(testEffortByModel, m.id)
                      ? testEffortByModel[m.id]
                      : '__auto__'
                    const effortNow = resolveTestEffort(m.id, m)
                    const statusLabel = pending
                      ? '测试中…'
                      : !tr
                        ? '未测'
                        : tr.ok
                          ? (tr.hasSvg ? '成功 · SVG' : '成功')
                          : '失败'
                    const statusClass = pending ? 'mp-muted' : !tr ? 'mp-muted' : tr.ok ? 'mp-ok' : 'mp-error'
                    return React.createElement('div', { key: m.id, className: 'mp-test-card' },
                      React.createElement('div', { className: 'mp-test-card-head' },
                        React.createElement('div', null,
                          React.createElement('strong', null, m.id),
                          React.createElement('div', { className: 'mp-muted' }, m.name || ''),
                          React.createElement('div', { className: 'mp-test-meta', style: { marginTop: 4 } },
                            React.createElement('span', { className: statusClass, style: { margin: 0 } }, statusLabel),
                            React.createElement('span', { className: 'mp-muted' },
                              '强度 ' + (effortNow || '关闭') + (effortSelect === '__auto__' ? '（自动）' : '')),
                            tr && tr.effortUsed != null && tr.effortUsed !== '' && React.createElement('span', { className: 'mp-muted' }, '已用 ' + tr.effortUsed),
                            tr && tr.elapsedMs != null && React.createElement('span', { className: 'mp-muted' }, tr.elapsedMs + ' ms'),
                            tr && tr.statusCode != null && React.createElement('span', { className: 'mp-muted' }, 'HTTP ' + tr.statusCode),
                            tr && tr.hasApiKey != null && React.createElement('span', { className: 'mp-muted' }, tr.hasApiKey ? '已带 Key' : '未带 Key'),
                            tr && tr.finishReason && React.createElement('span', { className: 'mp-muted' }, 'finish ' + tr.finishReason),
                            tr && tr.truncated && React.createElement('span', { className: 'mp-warn' }, '可能截断'),
                            tr && tr.usage && React.createElement('span', { className: 'mp-muted' },
                              [
                                tr.usage.promptTokens != null ? ('in ' + tr.usage.promptTokens) : '',
                                tr.usage.completionTokens != null ? ('out ' + tr.usage.completionTokens) : '',
                                tr.usage.reasoningTokens != null ? ('think ' + tr.usage.reasoningTokens) : '',
                              ].filter(Boolean).join(' · ')),
                          ),
                        ),
                        React.createElement('div', { className: 'mp-actions', style: { alignItems: 'center' } },
                          React.createElement('select', {
                            className: 'mp-select',
                            style: { width: 'auto', minWidth: 140 },
                            value: effortSelect,
                            disabled: busy || testBatch || !!testBusyMap[m.id],
                            title: '自动=已配置则最高档，未配置则关闭（当前：' + (autoEffort || '关闭') + '）',
                            onChange: (ev) => {
                              const v = ev.target.value
                              setTestEffortByModel((prev) => {
                                const next = Object.assign({}, prev || {})
                                if (v === '__auto__') delete next[m.id]
                                else next[m.id] = v
                                return next
                              })
                            },
                          },
                            React.createElement('option', { value: '__auto__' }, '自动（' + (autoEffort || '关闭') + '）'),
                            React.createElement('option', { value: '__none__' }, '不传/关闭'),
                            LEVEL_ORDER.filter((lv) => lv !== 'off').map((lv) =>
                              React.createElement('option', { key: lv, value: lv }, lv)),
                          ),
                          React.createElement('button', {
                            type: 'button',
                            className: 'mp-btn small primary',
                            // 仅锁住「当前这个模型」和「全量测试中」；其它模型可并行点
                            disabled: busy || testBatch || !!testBusyMap[m.id],
                            onClick: () => runTestModel(m.id),
                          }, pending ? '测试中…' : '测试'),
                        ),
                      ),
                      tr && tr.hasSvg && tr.svg
                        ? React.createElement(SvgPreview, { svg: tr.svg, title: m.id + ' · SVG 动画预览' })
                        : null,
                      tr && !tr.pending && !tr.hasSvg && tr.ok && tr.text && React.createElement('div', { className: 'mp-test-out' },
                        tr.text,
                      ),
                      tr && !tr.pending && React.createElement('details', null,
                        React.createElement('summary', { className: 'mp-linkbtn', style: { cursor: 'pointer' } },
                          tr.ok
                            ? (tr.reasoningText && !tr.contentText ? '查看 reasoning 输出' : '查看原始输出')
                            : '查看错误详情'),
                        React.createElement('div', { className: 'mp-test-out' },
                          tr.ok
                            ? (
                              (tr.contentText ? ('[content]\n' + tr.contentText) : '')
                              + (tr.contentText && tr.reasoningText ? '\n\n' : '')
                              + (tr.reasoningText ? ('[reasoning_content]\n' + tr.reasoningText) : '')
                              + (!tr.contentText && !tr.reasoningText ? (tr.text || '(空)') : '')
                            )
                            : ((tr.error || tr.message || '失败') + (tr.raw ? ('\n\n' + tr.raw) : '')),
                        ),
                      ),
                    )
                  }),
                ),
            ),
        ),

        tab === 'sync' && React.createElement('div', { className: 'mp-card' },
          React.createElement('div', { className: 'mp-field' },
            React.createElement('span', { className: 'mp-label' }, '目录地址'),
            React.createElement('input', {
              className: 'mp-input',
              value: catalogUrl,
              disabled: busy || enrichBusy,
              placeholder: 'https://models.dev/api.json',
              onChange: (ev) => setCatalogUrl(ev.target.value),
            }),
          ),
          React.createElement('div', { className: 'mp-actions' },
            React.createElement('button', {
              type: 'button', className: 'mp-btn',
              disabled: busy || enrichBusy || !(boot && boot.writable),
              onClick: saveCatalogUrl,
            }, '保存地址'),
            React.createElement('button', {
              type: 'button', className: 'mp-btn',
              disabled: busy || enrichBusy,
              onClick: () => setCatalogUrl((boot && (boot.defaultModelsDevUrl || boot.defaultModelsUrl)) || 'https://models.dev/api.json'),
            }, '恢复默认'),
          ),
          React.createElement('label', { className: 'mp-checkline' },
            React.createElement('input', {
              type: 'checkbox',
              checked: overwriteEfforts,
              disabled: busy || enrichBusy,
              onChange: (ev) => setOverwriteEfforts(!!ev.target.checked),
            }),
            React.createElement('span', null, '覆盖本地已有字段（默认只补缺）'),
          ),
          React.createElement('div', { className: 'mp-actions' },
            React.createElement('button', {
              type: 'button', className: 'mp-btn',
              disabled: busy || enrichBusy || !provider,
              onClick: () => runEnrichModels(false),
            }, enrichBusy ? '查询中…' : '预览补全'),
            React.createElement('button', {
              type: 'button', className: 'mp-btn primary',
              disabled: busy || enrichBusy || !provider || !(boot && boot.writable),
              onClick: quickSync,
            }, (busy || enrichBusy) ? '同步中…' : '写回本地供应商'),
          ),
          enrichPreview && React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'mp-muted' },
              (enrichPreview.message || '')
              + (enrichPreview.hitCount != null ? (' · 命中 ' + enrichPreview.hitCount + '/' + (enrichPreview.localCount || 0)) : '')
              + (enrichPreview.catalogUrl ? (' · ' + enrichPreview.catalogUrl) : ''),
            ),
            (!enrichPreview.changes || !enrichPreview.changes.length)
              ? React.createElement('p', { className: 'mp-sub' }, '没有可写回变更。')
              : React.createElement('table', { className: 'mp-table' },
                React.createElement('thead', null, React.createElement('tr', null,
                  React.createElement('th', null, '模型'),
                  React.createElement('th', null, '匹配'),
                  React.createElement('th', null, '变更'),
                  React.createElement('th', null, '强度/视觉/上下文'),
                )),
                React.createElement('tbody', null, enrichPreview.changes.map((c) => React.createElement('tr', { key: c.id },
                  React.createElement('td', null, c.id),
                  React.createElement('td', null, c.matchedBy || 'models.dev'),
                  React.createElement('td', null, c.notes || ''),
                  React.createElement('td', null,
                    (c.summary || '')
                    + (c.vision ? ' · 视觉' : '')
                    + (c.contextWindow ? (' · ctx ' + c.contextWindow) : '')
                    + (c.maxTokens ? (' · max ' + c.maxTokens) : '')),
                ))),
              ),
          ),
        ),

        tab === 'about' && React.createElement('div', { className: 'mp-card' },
          React.createElement('h3', { className: 'mp-h' }, '模型 Plus'),
          React.createElement('p', { className: 'mp-sub', style: { margin: 0 } },
            '本地按供应商编辑模型思考强度 / 视觉 / 上下文；一键同步默认从 models.dev 按模型 id 补全。',
          ),
          React.createElement('div', { className: 'mp-about-grid' },
            React.createElement('div', { className: 'mp-about-row' },
              React.createElement('span', { className: 'mp-label' }, '版本'),
              React.createElement('div', { className: 'mp-version-line' },
                React.createElement('span', { className: 'mp-about-val' }, (boot && boot.version) || '未知'),
                React.createElement('button', {
                  type: 'button', className: 'mp-btn small', disabled: checking, onClick: runCheckUpdate,
                }, checking ? '检测中…' : '检查更新'),
              ),
              updateInfo && React.createElement('div', { className: 'mp-update-result' },
                updateInfo.ok === false
                  ? React.createElement('span', { className: 'mp-error' }, '检测失败：' + (updateInfo.error || ''))
                  : updateInfo.hasUpdate
                    ? React.createElement(React.Fragment, null,
                      React.createElement('span', { className: 'mp-update-new' }, '发现新版本：' + updateInfo.latestVersion),
                      React.createElement('a', { className: 'mp-link', href: updateInfo.npmUrl, target: '_blank', rel: 'noopener noreferrer' }, '前往 npm 查看'),
                    )
                    : React.createElement('span', { className: 'mp-ok' }, '已是最新版本（' + updateInfo.latestVersion + '）'),
              ),
            ),
            React.createElement('div', { className: 'mp-about-row' },
              React.createElement('span', { className: 'mp-label' }, '包名'),
              React.createElement('code', { className: 'mp-about-val' }, '@kingsunb/dsh-model-plus'),
            ),
            React.createElement('div', { className: 'mp-about-row' },
              React.createElement('span', { className: 'mp-label' }, 'GitHub'),
              React.createElement('a', { className: 'mp-link', href: (boot && boot.repo) || 'https://github.com/kingsunb/dsh-model-plus', target: '_blank', rel: 'noopener noreferrer' },
                (boot && boot.repo) || 'https://github.com/kingsunb/dsh-model-plus'),
            ),
            React.createElement('div', { className: 'mp-about-row' },
              React.createElement('span', { className: 'mp-label' }, '说明文档'),
              React.createElement('a', { className: 'mp-link', href: (boot && boot.homepage) || 'https://github.com/kingsunb/dsh-model-plus#readme', target: '_blank', rel: 'noopener noreferrer' },
                (boot && boot.homepage) || 'https://github.com/kingsunb/dsh-model-plus#readme'),
            ),
            React.createElement('div', { className: 'mp-about-row' },
              React.createElement('span', { className: 'mp-label' }, '问题反馈'),
              React.createElement('a', { className: 'mp-link', href: (boot && boot.issues) || 'https://github.com/kingsunb/dsh-model-plus/issues', target: '_blank', rel: 'noopener noreferrer' },
                (boot && boot.issues) || 'https://github.com/kingsunb/dsh-model-plus/issues'),
            ),
            React.createElement('div', { className: 'mp-about-row' },
              React.createElement('span', { className: 'mp-label' }, '默认同步源'),
              React.createElement('a', {
                className: 'mp-link',
                href: catalogUrl || (boot && (boot.modelsDevUrl || boot.defaultModelsDevUrl || boot.defaultModelsUrl)) || 'https://models.dev/api.json',
                target: '_blank',
                rel: 'noopener noreferrer',
              }, catalogUrl || (boot && (boot.modelsDevUrl || boot.defaultModelsDevUrl || boot.defaultModelsUrl)) || 'https://models.dev/api.json'),
            ),
          ),
          React.createElement('p', { className: 'mp-muted', style: { margin: 0 } }, 'MIT License · Powered by DeepSeek Harness'),
        ),

        tab === 'models' && models.map((m) => {
          const ed = editors[m.id] || toEditor(m)
          const opened = openId === m.id
          const liveSummary = opened ? effortSummaryFromEditor(ed) : (m.summary || '未设置')
          const liveVision = opened ? !!ed.vision : !!m.vision
          const effortSelected = selectedLevels(ed)
          const modalitySelected = liveVision ? ['text', 'image'] : ['text']
          return React.createElement('div', { key: m.id, className: 'mp-model' },
            React.createElement('div', { className: 'mp-head' },
              React.createElement('div', null,
                React.createElement('strong', null, m.id),
                React.createElement('div', { className: 'mp-muted' }, '强度: ' + liveSummary + (liveVision ? ' · 视觉' : ' · 纯文本') + ((ed.contextWindow || m.contextWindow) ? (' · ctx ' + (ed.contextWindow || m.contextWindow)) : '') + ((ed.maxTokens || m.maxTokens) ? (' · maxOut ' + (ed.maxTokens || m.maxTokens)) : '')),
              ),
              React.createElement('div', { className: 'mp-actions' },
                React.createElement('span', { className: 'mp-pill' }, ed.disabled ? '已关闭' : (effortSelected.some((lv) => lv !== 'off') || m.hasEffort ? '已配置' : '未配置')),
                liveVision ? React.createElement('span', { className: 'mp-pill' }, '视觉') : null,
                React.createElement('button', { type: 'button', className: 'mp-btn small', disabled: busy, onClick: () => setOpenId(opened ? '' : m.id) }, opened ? '收起' : '编辑'),
              ),
            ),
            opened && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'mp-presets' },
                React.createElement('span', { className: 'mp-label' }, '快捷预设'),
                presets.map((p) => React.createElement('button', {
                  key: p.id, type: 'button', className: 'mp-btn small', disabled: busy,
                  onClick: () => applyPreset(m.id, p.id),
                }, p.label)),
              ),
              React.createElement(MultiSelectChips, {
                label: '输入模态',
                options: [
                  { value: 'text', label: '文本', locked: true, title: '文本为底线，不可取消' },
                  { value: 'image', label: '图片（视觉）', title: '勾选后写入 input: text + image' },
                ],
                selected: modalitySelected,
                onToggle: (value) => toggleVisionChip(m.id, value),
                disabled: busy,
                hint: liveVision ? '当前：text + image' : '当前：仅 text（纯文本）',
              }),
              React.createElement(MultiSelectChips, {
                label: '思考强度',
                options: LEVEL_ORDER.map((lv) => ({ value: lv, label: lv, title: lv === 'off' ? 'off：支持但不发送强度' : ('启用 ' + lv) })),
                selected: effortSelected,
                onToggle: (value) => toggleEffortChip(m.id, value),
                disabled: busy,
                hint: ed.disabled
                  ? '未选非 off 档 → 保存为关闭推理（reasoningEfforts: false）'
                  : ('已选 ' + effortSelected.join(', ') + ' · 摘要 ' + liveSummary),
              }),
              React.createElement('div', { className: 'mp-row' },
                React.createElement('div', { className: 'mp-field' },
                  React.createElement('span', { className: 'mp-label' }, '上下文长度 contextWindow'),
                  React.createElement('input', {
                    className: 'mp-input',
                    value: ed.contextWindow || '',
                    disabled: busy,
                    placeholder: '例如 128000，空=不设置',
                    onChange: (ev) => patchEditor(m.id, { contextWindow: ev.target.value }),
                  }),
                ),
                React.createElement('div', { className: 'mp-field' },
                  React.createElement('span', { className: 'mp-label' }, '默认输出上限 maxTokens'),
                  React.createElement('input', {
                    className: 'mp-input',
                    value: ed.maxTokens || '',
                    disabled: busy,
                    placeholder: '可选',
                    onChange: (ev) => patchEditor(m.id, { maxTokens: ev.target.value }),
                  }),
                ),
              ),
              React.createElement('div', null,
                React.createElement('button', {
                  type: 'button',
                  className: 'mp-linkbtn',
                  disabled: busy || ed.disabled,
                  onClick: () => patchEditor(m.id, { showWire: !ed.showWire }),
                }, ed.showWire ? '收起 wire 高级编辑' : '展开 wire 高级编辑（网关映射）'),
              ),
              ed.showWire && !ed.disabled && React.createElement('div', { className: 'mp-wire-box' },
                React.createElement('div', { className: 'mp-ms-hint' }, '仅在网关 wire 值与档位名不同时需要改。off 勾选「空传」表示发送 null。'),
                React.createElement('div', { className: 'mp-levels' },
                  (ed.levels || []).map((row) => React.createElement('div', {
                    key: row.level,
                    className: 'mp-level' + (row.enabled ? '' : ' disabled'),
                  },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: !!row.enabled,
                      disabled: busy,
                      onChange: (ev) => {
                        const enabled = !!ev.target.checked
                        // 与芯片逻辑对齐：无非 off 档时标 disabled
                        setEditors((prev) => {
                          const cur = prev[m.id] || {}
                          const levels = (cur.levels || []).map((r) => r.level === row.level ? Object.assign({}, r, { enabled: enabled }) : r)
                          const anyPositive = levels.some((r) => r.enabled && r.level !== 'off')
                          return Object.assign({}, prev, {
                            [m.id]: Object.assign({}, cur, { levels: levels, disabled: !anyPositive }),
                          })
                        })
                      },
                    }),
                    React.createElement('span', null, row.level),
                    React.createElement('input', {
                      className: 'mp-input wire',
                      value: row.wireNull ? '' : (row.wire || ''),
                      disabled: busy || !row.enabled || (row.level === 'off' && row.wireNull),
                      onChange: (ev) => patchLevel(m.id, row.level, { wire: ev.target.value, wireNull: false }),
                    }),
                    row.level === 'off'
                      ? React.createElement('label', { className: 'mp-checkline' },
                          React.createElement('input', {
                            type: 'checkbox', checked: !!row.wireNull, disabled: busy || !row.enabled,
                            onChange: (ev) => patchLevel(m.id, 'off', { wireNull: !!ev.target.checked, wire: ev.target.checked ? '' : (row.wire || 'off') }),
                          }),
                          React.createElement('span', { className: 'mp-muted' }, '空传'),
                        )
                      : React.createElement('span', { className: 'mp-muted' }, 'wire'),
                  )),
                ),
              ),
              React.createElement('div', { className: 'mp-actions' },
                React.createElement('button', { type: 'button', className: 'mp-btn primary', disabled: busy, onClick: () => saveModel(m.id) }, busy ? '保存中…' : '保存此模型'),
              ),
            ),
          )
        }),
      )
    }

    exports.inject = ['slots'];
    exports.apply = function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'model-plus', order: 11, label: '模型 Plus' },
        () => React.createElement(ModelsPlusPage),
      ))
    };

    return module.exports;
  },
});
