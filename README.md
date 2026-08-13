# dsh-model-plus

DeepSeek Harness **模型 Plus** 仓库。

## 布局

```text
models.json     # 上游默认：按模型名/id 模式的思考强度与视觉
Plugin/         # DSH 动态插件源码
schema/         # 可选 schema
```

## 同步地址（插件默认）

```text
https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json
```

上游 **只按模型名称/id 模式** 提供默认值，不包含 newapi 等供应商表。  
本地插件仍按供应商逐模型覆盖，并可开关视觉：`input: [text, image]`。

## models.json

每条规则：

| 字段 | 含义 |
|------|------|
| `id` | 精确模型 id |
| `idPattern` | 正则，匹配 id 或 name |
| `reasoningEfforts` | 档位 map，或 `false` |
| `thinkingFormat` | 可选 |
| `vision` | `true` → text+image；`false` → text；省略则不同步视觉 |

## 插件

见 [`Plugin/`](./Plugin/)。
