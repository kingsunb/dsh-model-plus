/**
 * dsh-model-plus browser half — registers the「模型 Plus」settings page.
 *
 * 通过 `settings.section` slot 在设置页注册「模型 Plus」分区，用户可本地按
 * 供应商编辑模型思考强度/视觉/上下文，并从远程 models.json 按模型名同步。
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
      saveSyncUrl: (args) => plusFetch(API + '/save-sync-url', args),
      syncPreview: (args) => plusFetch(API + '/sync-preview', args),
      syncApply: (args) => plusFetch(API + '/sync-apply', args),
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
      .mp-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:end}
      .mp-field{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
      .mp-label{color:var(--dsw-alias-label-secondary);font-size:12px}
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

    function toEditor(model) {
      return {
        disabled: !!model.disabled,
        vision: !!model.vision,
        contextWindow: model.contextWindow > 0 ? String(model.contextWindow) : '',
        maxTokens: model.maxTokens > 0 ? String(model.maxTokens) : '',
        levels: (model.levels || []).map((l) => ({ level: l.level, enabled: !!l.enabled, wire: l.wire || '', wireNull: !!l.wireNull })),
      };
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
      const [modelsUrl, setModelsUrl] = React.useState('')
      const [overwriteEfforts, setOverwriteEfforts] = React.useState(false)
      const [syncVision, setSyncVision] = React.useState(true)
      const [syncPreview, setSyncPreview] = React.useState(null)
      const [quickResult, setQuickResult] = React.useState(null)
      const [updateInfo, setUpdateInfo] = React.useState(null)
      const [checking, setChecking] = React.useState(false)

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
          setModelsUrl(b.modelsUrl || b.defaultModelsUrl || '')
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
        setProvider(next); setOkMsg(''); setError(''); setSyncPreview(null); setBusy(true)
        try { await loadDetail(next) } catch (e) { setError(e && e.message ? e.message : String(e)) } finally { setBusy(false) }
      }

      const patchEditor = (id, patch) => setEditors((prev) => Object.assign({}, prev, { [id]: Object.assign({}, prev[id] || {}, patch) }))
      const patchLevel = (id, level, patch) => setEditors((prev) => {
        const cur = prev[id] || { levels: [] }
        const levels = (cur.levels || []).map((row) => row.level === level ? Object.assign({}, row, patch) : row)
        return Object.assign({}, prev, { [id]: Object.assign({}, cur, { levels: levels }) })
      })

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

      const saveUrl = async () => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await api.saveSyncUrl({ modelsUrl: modelsUrl, indexUrl: modelsUrl })
          setOkMsg(res.message || '已保存地址')
          setBoot(await api.bootstrap())
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const runSyncPreview = async () => {
        setBusy(true); setError(''); setOkMsg(''); setSyncPreview(null)
        try {
          setSyncPreview(await api.syncPreview({
            provider: provider, modelsUrl: modelsUrl, indexUrl: modelsUrl, overwriteEfforts: overwriteEfforts, syncVision: syncVision,
          }))
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const runSyncApply = async () => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await api.syncApply({
            provider: provider, modelsUrl: modelsUrl, indexUrl: modelsUrl, overwriteEfforts: overwriteEfforts, syncVision: syncVision,
          })
          setOkMsg(res.message || '已同步')
          setSyncPreview(res)
          await loadDetail(provider)
          setBoot(await api.bootstrap())
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const quickSync = async () => {
        setBusy(true); setError(''); setOkMsg(''); setQuickResult(null)
        try {
          const res = await api.syncApply({
            provider: provider, modelsUrl: modelsUrl, indexUrl: modelsUrl,
            overwriteEfforts: overwriteEfforts, syncVision: syncVision,
          })
          setQuickResult(res)
          setOkMsg(res.message || '已同步')
          await loadDetail(provider)
          setBoot(await api.bootstrap())
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
          setQuickResult({ error: e && e.message ? e.message : String(e) })
        }
        finally { setBusy(false) }
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
              React.createElement('span', { className: 'mp-muted' }, '从远程 models.json 按模型名写回当前供应商'),
            ),
            React.createElement('button', {
              type: 'button', className: 'mp-btn primary mp-quick-btn',
              disabled: busy || !provider || !(boot && boot.writable),
              title: provider ? ('同步到：' + provider) : '请先选择供应商',
              onClick: quickSync,
            }, busy ? '同步中…' : '一键同步'),
          ),
          quickResult && React.createElement('div', { className: 'mp-muted mp-quick-result' },
            quickResult.error
              ? '同步失败：' + quickResult.error
              : ('已同步 ' + (quickResult.changeCount || 0) + ' 项 · 本地模型 ' + (quickResult.localCount || 0) + (quickResult.skipped ? ' · 无变更' : '')),
          ),
        ),

        React.createElement('div', { className: 'mp-card' },
          React.createElement('div', { className: 'mp-tabs' },
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'models' ? '1' : '0', onClick: () => setTab('models') }, '思考强度'),
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'context' ? '1' : '0', onClick: () => setTab('context') }, '上下文'),
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
            React.createElement('button', { type: 'button', className: 'mp-btn', disabled: busy, onClick: reload }, '刷新'),
          ),
          selected && React.createElement('div', { className: 'mp-prov' },
            React.createElement('div', null, React.createElement('strong', null, selected.displayName || selected.provider)),
            React.createElement('div', { className: 'mp-muted' }, selected.baseURL || '无 baseURL'),
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

        tab === 'sync' && React.createElement('div', { className: 'mp-card' },
          React.createElement('p', { className: 'mp-sub', style: { margin: 0 } },
            '上游 models.json 按模型名同步思考/视觉/上下文。默认：' + ((boot && boot.defaultModelsUrl) || ''),
          ),
          React.createElement('div', { className: 'mp-field' },
            React.createElement('span', { className: 'mp-label' }, '远程 models.json'),
            React.createElement('input', { className: 'mp-input', value: modelsUrl, disabled: busy, onChange: (ev) => setModelsUrl(ev.target.value) }),
          ),
          React.createElement('div', { className: 'mp-actions' },
            React.createElement('button', { type: 'button', className: 'mp-btn', disabled: busy, onClick: saveUrl }, '保存地址'),
            React.createElement('button', { type: 'button', className: 'mp-btn', disabled: busy, onClick: () => setModelsUrl((boot && boot.defaultModelsUrl) || modelsUrl) }, '恢复默认'),
          ),
          React.createElement('label', { className: 'mp-checkline' },
            React.createElement('input', { type: 'checkbox', checked: overwriteEfforts, disabled: busy, onChange: (ev) => setOverwriteEfforts(!!ev.target.checked) }),
            React.createElement('span', null, '覆盖本地已有推理档（默认只补缺）'),
          ),
          React.createElement('label', { className: 'mp-checkline' },
            React.createElement('input', { type: 'checkbox', checked: syncVision, disabled: busy, onChange: (ev) => setSyncVision(!!ev.target.checked) }),
            React.createElement('span', null, '同步视觉能力（写 input: text/image）'),
          ),
          React.createElement('div', { className: 'mp-actions' },
            React.createElement('button', { type: 'button', className: 'mp-btn', disabled: busy || !provider, onClick: runSyncPreview }, '预览同步'),
            React.createElement('button', { type: 'button', className: 'mp-btn primary', disabled: busy || !provider, onClick: runSyncApply }, busy ? '同步中…' : '按模型名写回本地供应商'),
          ),
          syncPreview && React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'mp-muted' },
              '规则 ' + (syncPreview.remoteRules || 0) +
              ' · 本地模型 ' + (syncPreview.localCount || 0) +
              ' · 变更 ' + (syncPreview.changeCount || 0),
            ),
            (syncPreview.modelsUrl || syncPreview.indexUrl) ? React.createElement('div', { className: 'mp-muted' }, syncPreview.modelsUrl || syncPreview.indexUrl) : null,
            (!syncPreview.changes || !syncPreview.changes.length)
              ? React.createElement('p', { className: 'mp-sub' }, '没有变更。')
              : React.createElement('table', { className: 'mp-table' },
                React.createElement('thead', null, React.createElement('tr', null,
                  React.createElement('th', null, '模型'), React.createElement('th', null, '匹配'), React.createElement('th', null, '变更'), React.createElement('th', null, '强度/视觉/上下文'))),
                React.createElement('tbody', null, syncPreview.changes.map((c) => React.createElement('tr', { key: c.id },
                  React.createElement('td', null, c.id),
                  React.createElement('td', null, c.matchedBy || ''),
                  React.createElement('td', null, c.notes || ''),
                  React.createElement('td', null, (c.summary || '') + (c.vision ? ' · 视觉' : '') + (c.contextWindow ? (' · ctx ' + c.contextWindow) : '')),
                ))),
              ),
          ),
        ),

        tab === 'about' && React.createElement('div', { className: 'mp-card' },
          React.createElement('h3', { className: 'mp-h' }, '模型 Plus'),
          React.createElement('p', { className: 'mp-sub', style: { margin: 0 } },
            '本地按供应商编辑模型思考强度 / 视觉 / 上下文，并从远程 models.json 按模型名同步默认配置。',
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
              React.createElement('a', { className: 'mp-link', href: (boot && boot.defaultModelsUrl) || '', target: '_blank', rel: 'noopener noreferrer' },
                (boot && boot.defaultModelsUrl) || ''),
            ),
          ),
          React.createElement('p', { className: 'mp-muted', style: { margin: 0 } }, 'MIT License · Powered by DeepSeek Harness'),
        ),

        tab === 'models' && models.map((m) => {
          const ed = editors[m.id] || toEditor(m)
          const opened = openId === m.id
          return React.createElement('div', { key: m.id, className: 'mp-model' },
            React.createElement('div', { className: 'mp-head' },
              React.createElement('div', null,
                React.createElement('strong', null, m.id),
                React.createElement('div', { className: 'mp-muted' }, '强度: ' + (m.summary || '未设置') + (m.vision ? ' · 视觉' : ' · 纯文本') + (m.contextWindow ? (' · ctx ' + m.contextWindow) : '') + (m.maxTokens ? (' · maxOut ' + m.maxTokens) : '')),
              ),
              React.createElement('div', { className: 'mp-actions' },
                React.createElement('span', { className: 'mp-pill' }, m.hasEffort ? '已配置' : (m.disabled ? '已关闭' : '未配置')),
                m.vision ? React.createElement('span', { className: 'mp-pill' }, '视觉') : null,
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
              React.createElement('label', { className: 'mp-checkline' },
                React.createElement('input', { type: 'checkbox', checked: !!ed.disabled, disabled: busy, onChange: (ev) => patchEditor(m.id, { disabled: !!ev.target.checked }) }),
                React.createElement('span', null, '关闭推理'),
              ),
              React.createElement('label', { className: 'mp-checkline' },
                React.createElement('input', { type: 'checkbox', checked: !!ed.vision, disabled: busy, onChange: (ev) => patchEditor(m.id, { vision: !!ev.target.checked }) }),
                React.createElement('span', null, '支持视觉（input: text + image）'),
              ),
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
              !ed.disabled && React.createElement('div', { className: 'mp-levels' },
                (ed.levels || []).map((row) => React.createElement('div', {
                  key: row.level,
                  className: 'mp-level' + (row.enabled ? '' : ' disabled'),
                },
                  React.createElement('input', { type: 'checkbox', checked: !!row.enabled, disabled: busy, onChange: (ev) => patchLevel(m.id, row.level, { enabled: !!ev.target.checked }) }),
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
