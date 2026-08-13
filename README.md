# dsh-model-plus

DeepSeek Harness **模型 Plus** 仓库。

## 布局

```text
models.json     # 上游默认：按模型名匹配 reasoning / vision / contextWindow
Plugin/         # DSH 动态插件源码
schema/
```

## 同步地址（插件默认）

```text
https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json
```

上游 **只按模型名称/id 模式** 提供默认值，不包含供应商表。  
本地插件按供应商逐模型覆盖。

## models.json 字段

| 字段 | 含义 |
|------|------|
| `id` / `idPattern` | 精确 id 或正则 |
| `reasoningEfforts` | 档位 map，或 `false` |
| `thinkingFormat` | 可选 |
| `vision` | `true`→`input:[text,image]`；`false`→`[text]` |
| `contextWindow` | 可选上下文长度（token） |
| `maxTokens` | 可选默认输出上限 |

## 插件

见 [`Plugin/`](./Plugin/)。
