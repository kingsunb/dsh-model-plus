# @kingsunb/dsh-model-plus

[中文文档](./README.zh.md)

DSH Web plugin: on the Settings page, under "模型 Plus" (Models Plus), edit each model's reasoning-effort tiers, vision capability, context window, and default output limit per provider, entirely in your local configuration. One-click sync fills in missing fields from [models.dev](https://models.dev) by model id.

## Features

- **Per-provider, per-model configuration**
  - Reasoning-effort tiers (`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`)
  - Vision capability (`input`: `text` / `image`)
  - Context window `contextWindow` (tokens)
  - Default output limit `maxTokens`
- **Quick presets**: apply common combinations in one click (reasoning off / basic 3-tier / all-open / vision + all-open)
- **models.dev sync**: fill in reasoning tiers, context, maxTokens, vision by model id (only fills missing by default; can overwrite)
- **Add providers**: URL + API key import, fetch model lists, auto-fetch on creation
- **Model testing**: single or batch tests, customizable default prompt, SVG preview
- **Multi-provider switching**: manage multiple providers on one settings page

## Installation

```sh
dsh plugin --profile web add @kingsunb/dsh-model-plus
```

Restart `dsh web`, then open **Settings → 模型 Plus**.

## Architecture

- **Host half** (`lib/index.js`): registers same-origin HTTP endpoints `/api/plus/*`
  - `bootstrap` / `list-models` / `save-model` / `apply-preset`
  - `add-provider` / `discover-models` (models.dev enrichment when fetching models)
  - `enrich-models` (one-click sync / sync settings page: models.dev preview and apply)
  - `test-model` (model availability and creative output testing)
- **Client half** (`lib/client.js`): registers the "模型 Plus" settings section

## License

MIT