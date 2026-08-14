# @kingsunb/dsh-model-plus

DSH Web 插件：在设置页「模型 Plus」里按供应商本地编辑每个模型的思考强度档位、视觉能力、上下文窗口与默认输出上限，并可从远程 `models.json` 按模型名同步默认配置到本地供应商。

## 功能

- **本地按供应商编辑模型配置**：针对每个供应商下的每个模型，单独编辑：
  - 思考强度档位（`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`）
  - 视觉能力（`input`: `text` / `image`）
  - 上下文窗口 `contextWindow`（token 数）
  - 默认输出上限 `maxTokens`
- **快捷预设**：一键套用常见组合
  - 关闭推理
  - 通用三档（`low` / `medium` / `high`）
  - 全开（所有档位启用）
  - 视觉 + 全开（`input` 含 `image` 且所有档位启用）
- **远程 `models.json` 同步**：按模型名匹配远程默认配置，同步到本地供应商，避免逐个手填。
- **多供应商切换**：在同一设置页内切换并管理多个供应商的模型配置。

## 安装

这是一个 npm 发布的标准 DSH profile 插件包。

```sh
dsh plugin --profile web add @kingsunb/dsh-model-plus
```

安装完成后重启 `dsh web`，在「设置 → 模型 Plus」打开。

### 从 GitHub 仓库安装（开发调试）

```sh
git clone https://github.com/kingsunb/dsh-model-plus.git
cd dsh-model-plus
pnpm install
pnpm --filter @kingsunb/dsh-model-plus build
dsh plugin --profile web add link:$(pwd)/dsh-model-plus
```

## 验证与卸载

- **验证**：
  - 执行 `dsh --profile web --dump-config`，确认 `model-plus` 出现在 bundles 层列表里；或
  - 重启 `dsh web` 后，设置页出现「模型 Plus」入口。
- **卸载**：
  ```sh
  dsh plugin --profile web remove @kingsunb/dsh-model-plus
  ```
  卸载后重启 `dsh web`。

## models.json 字段

远程默认同步地址：`https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json`

| 字段 | 含义 |
| --- | --- |
| `id` / `idPattern` | 精确 id 或正则，用于按模型名匹配 |
| `reasoningEfforts` | 档位 map（`level`→`wire`），或 `false` 表示关闭推理 |
| `thinkingFormat` | 可选，思考输出格式 |
| `vision` | `true`→`input` 含 `image`；`false`→仅 `text` |
| `contextWindow` | 可选上下文长度（token） |
| `maxTokens` | 可选默认输出上限 |

## 架构

本插件遵循 DSH 标准 profile 插件的 host↔client 通信模式（同源 HTTP JSON 端点）。

- **host 半**（`lib/index.js`）：注册同源 HTTP 端点 `/api/plus/*`，提供以下接口：
  - `bootstrap`：初始化并返回当前配置
  - `list-models`：列出供应商与模型
  - `save-model`：保存单个模型配置
  - `apply-preset`：套用快捷预设
  - `add-provider`：添加三方供应商（未传 models 时对可探测协议默认拉 `/models`）
  - `discover-models`：按草稿 baseURL/api/apiKey 探测端点模型列表（官方「获取模型」同款）
  - `save-sync-url`：保存远程同步地址
  - `sync-preview`：预览远程同步结果
  - `sync-apply`：应用远程同步结果
- **client 半**（`lib/client.js`）：在 `settings.section` slot 注册「模型 Plus」设置页 UI，通过 `fetch` 调用 host 端点完成读写。添加供应商时显示名可选，模型默认「获取模型」勾选或创建时自动拉取。

## 许可

MIT
