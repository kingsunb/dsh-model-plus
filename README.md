# dsh-model-plus

DeepSeek Harness **模型 Plus** 的远程思考强度目录。

「模型 Plus」插件的「同步设置」从本仓库拉取各模型的 `reasoningEfforts` / `thinkingFormat`，写回本地 `llm-pi-ai` 配置，使 composer 模型菜单出现可选手动推理等级。

## 默认地址

- Index: `https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/catalog/index.json`
- 也可在插件里改成任意 raw index URL（自建 fork / 私有镜像）。

## 目录结构

```
catalog/
  index.json                 # 目录索引
  providers/<id>.json        # 某一类供应商/网关的模型强度表
schema/catalog.schema.json   # 形状说明（文档用）
```

## 匹配规则

插件对本地 `llm-pi-ai.providers.<route>`：

1. 若 `route` id 命中 `match.providerIds` → 用该文件
2. 否则若 `baseURL` 包含 `match.baseURLContains` 任一项 → 用该文件
3. 否则用 index 里的 `defaultProvider`（通常是 openai-compatible 通用表）

模型匹配：

1. 精确 `models[].id`
2. 否则 `models[].idPattern`（正则，忽略大小写）
3. 都未命中则跳过（不覆盖本地）

## 本地字段

每个模型可含：

| 字段 | 含义 |
|------|------|
| `id` | 精确模型 id |
| `idPattern` | 正则，如 `^grok-` |
| `name` | 可选显示名 |
| `reasoningEfforts` | 档位 map，或 `false` 关闭 |
| `thinkingFormat` | openai / deepseek / qwen … |
| `supportsReasoningEffort` | 默认 true（有 efforts 时） |

`reasoningEfforts` 键必须是：`off|minimal|low|medium|high|xhigh|max`。  
`off: null` 表示提供 Off 且不传 wire 参数。

## 贡献

1. Fork 本仓库
2. 在 `catalog/providers/` 增改 JSON
3. 更新 `catalog/index.json` 的 `updatedAt`
4. PR

插件内可把同步 URL 指到你的 fork。

