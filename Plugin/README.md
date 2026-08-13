# Plugin

DeepSeek Harness 动态 Cordis 插件源码（模型 Plus）。

## 文件

| 文件 | 说明 |
|------|------|
| `meta.json` | 插件元信息与默认 models.json 地址 |
| `host.js` | Host 半：settings 读写、远程同步、预设 |
| `client.js` | Client 半：设置页「模型 Plus」UI |

## 默认远程配置

```text
https://raw.githubusercontent.com/kingsunb/dsh-model-plus/main/models.json
```

## 在创造模式中加载

1. 读取 `host.js` / `client.js` 全文作为 `code.host` / `code.client`
2. `cordis_define` → `cordis_run`
3. 打开 **设置 → 模型 Plus**

本地可按供应商编辑每个模型的思考强度与「支持视觉」；同步时只按模型名匹配上游 `models.json`。
