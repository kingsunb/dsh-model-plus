# @kingsunb/dsh-model-plus

DSH Web 插件：在设置页「模型 Plus」里按供应商本地编辑每个模型的思考强度档位、视觉能力、上下文窗口与默认输出上限；一键同步默认从 [models.dev](https://models.dev) 按模型 id 补全。

## 功能

- **本地按供应商编辑模型配置**：针对每个供应商下的每个模型，单独编辑：
  - 思考强度档位（`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`）
  - 视觉能力（`input`: `text` / `image`）
  - 上下文窗口 `contextWindow`（token 数）
  - 默认输出上限 `maxTokens`
- **快捷预设**：一键套用常见组合（关闭推理 / 通用三档 / 全开 / 视觉+全开）
- **models.dev 同步**：按模型 id 补全思考强度、上下文、maxTokens、视觉（默认只补缺，可覆盖）
- **添加供应商**：支持 URL+Key 一键导入、获取模型列表、创建时默认拉取
- **模型测试**：可单测/全测，默认提示词可自定义，支持 SVG 预览
- **多供应商切换**：在同一设置页内切换并管理多个供应商的模型配置

## 安装

```sh
dsh plugin --profile web add @kingsunb/dsh-model-plus
```

安装完成后重启 `dsh web`，在「设置 → 模型 Plus」打开。

## 架构

- **host 半**（`lib/index.js`）：注册同源 HTTP 端点 `/api/plus/*`
  - `bootstrap` / `list-models` / `save-model` / `apply-preset`
  - `add-provider` / `discover-models`（获取模型时可 models.dev 补全）
  - `enrich-models`（一键同步 / 同步设置页：models.dev 预览与写回）
  - `test-model`（模型可用性与创意输出测试）
- **client 半**（`lib/client.js`）：`settings.section` 注册「模型 Plus」UI

## 许可

MIT
