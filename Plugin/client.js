return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
      .mp-root{display:flex;flex-direction:column;gap:14px;max-width:920px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-sm-14)}
      .mp-h{margin:0;font:var(--dsw-font-md-16);font-weight:600}
      .mp-sub{margin:0;color:var(--dsw-alias-label-secondary);line-height:1.55}
      .mp-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}
      .mp-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .mp-tab{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}
      .mp-tab[data-on="1"]{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:var(--dsw-alias-label-on-primary,#fff)}
      .mp-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:end}
      .mp-field{display:flex;flex-direction:column;gap:6px;min-width:160px;flex:1}
      .mp-label{color:var(--dsw-alias-label-secondary);font-size:12px}
      .mp-select,.mp-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:8px;padding:8px 10px;font:inherit;color:inherit;width:100%}
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
    `)

    function toEditor(model) {
      return {
        disabled: !!model.disabled,
        vision: !!model.vision,
        contextWindow: model.contextWindow > 0 ? String(model.contextWindow) : '',
        maxTokens: model.maxTokens > 0 ? String(model.maxTokens) : '',
        levels: (model.levels || []).map((l) => ({ level: l.level, enabled: !!l.enabled, wire: l.wire || '', wireNull: !!l.wireNull })),
      }
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

      const loadDetail = React.useCallback(async (prov) => {
        if (!prov) { setDetail(null); setEditors({}); return }
        const res = await host.call('plus-list-models', { provider: prov })
        setDetail(res)
        const map = {}
        for (const m of (res.models || [])) map[m.id] = toEditor(m)
        setEditors(map)
      }, [])

      const reload = React.useCallback(async () => {
        setLoading(true); setError('')
        try {
          const b = await host.call('plus-bootstrap', {})
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
          })
          const res = await host.call('plus-save-model', { provider: provider, modelId: id, editor: editor })
          setOkMsg(res.message || '已保存')
          await loadDetail(provider)
          setBoot(await host.call('plus-bootstrap', {}))
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const applyPreset = async (id, presetId) => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await host.call('plus-apply-preset', { provider: provider, modelId: id, presetId: presetId })
          setOkMsg(res.message || '已应用预设')
          await loadDetail(provider)
          setOpenId(id)
          setBoot(await host.call('plus-bootstrap', {}))
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const saveUrl = async () => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await host.call('plus-save-sync-url', { modelsUrl: modelsUrl, indexUrl: modelsUrl })
          setOkMsg(res.message || '已保存地址')
          setBoot(await host.call('plus-bootstrap', {}))
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const runSyncPreview = async () => {
        setBusy(true); setError(''); setOkMsg(''); setSyncPreview(null)
        try {
          setSyncPreview(await host.call('plus-sync-preview', {
            provider: provider, modelsUrl: modelsUrl, indexUrl: modelsUrl, overwriteEfforts: overwriteEfforts, syncVision: syncVision,
          }))
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      const runSyncApply = async () => {
        setBusy(true); setError(''); setOkMsg('')
        try {
          const res = await host.call('plus-sync-apply', {
            provider: provider, modelsUrl: modelsUrl, indexUrl: modelsUrl, overwriteEfforts: overwriteEfforts, syncVision: syncVision,
          })
          setOkMsg(res.message || '已同步')
          setSyncPreview(res)
          await loadDetail(provider)
          setBoot(await host.call('plus-bootstrap', {}))
        } catch (e) { setError(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }

      if (loading) return React.createElement('div', { className: 'mp-root' }, React.createElement('h2', { className: 'mp-h' }, '模型 Plus'), React.createElement('p', { className: 'mp-sub' }, '加载中…'))

      const providers = (boot && boot.providers) || []
      const presets = (boot && boot.presets) || []
      const models = (detail && detail.models) || []
      const selected = providers.find((p) => p.provider === provider)

      return React.createElement('div', { className: 'mp-root' },
        React.createElement('h2', { className: 'mp-h' }, '模型 Plus'),
        React.createElement('p', { className: 'mp-sub' }, (boot && boot.note) || ''),

        React.createElement('div', { className: 'mp-card' },
          React.createElement('div', { className: 'mp-tabs' },
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'models' ? '1' : '0', onClick: () => setTab('models') }, '模型与强度'),
            React.createElement('button', { type: 'button', className: 'mp-tab', 'data-on': tab === 'sync' ? '1' : '0', onClick: () => setTab('sync') }, '同步设置'),
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

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'thirdparty-reasoning-sync', order: 11, label: '模型 Plus' },
      () => React.createElement(ModelsPlusPage),
    ))
  },
}
