# dsh-model-plus

DeepSeek Harness **模型 Plus** 的远程默认目录。

上游只按 **模型 id / 名称模式** 提供思考强度与是否视觉的默认值，**不绑定任何供应商**（没有 newapi / openai 供应商表）。

本地插件仍可按供应商逐模型覆盖，并决定是否启用视觉（`input: [text, image]`）。

## 默认地址

```text
https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/catalog/index.json
```

## 结构

```text
catalog/
  index.json      # 指向 models 文件
  models.json     # 按模型名模式的默认规则
```

## models.json 规则

每条规则可含：

| 字段 | 含义 |
|------|------|
| `id` | 精确模型 id（优先） |
| `idPattern` | 正则，匹配模型 id 或 name（忽略大小写） |
| `reasoningEfforts` | 档位 map，或 `false` 关闭推理 |
| `thinkingFormat` | 可选：openai / deepseek / qwen … |
| `vision` | 可选：`true` → `input: [text, image]`；`false` → `input: [text]`；省略则不同步视觉 |

匹配顺序：先精确 `id`，再按数组顺序第一条命中的 `idPattern`。

## 本地插件

- 按供应商查看/编辑每个模型的推理档
- 开关「支持视觉」→ 写 `input: [text, image]` 或 `[text]`
- 「同步设置」从本仓库拉默认规则，默认只补缺，可勾选覆盖
