# dsh-model-plus

DeepSeek Harness **模型 Plus** 仓库：可发布的 DSH Web 插件包 + 远程 models.json 默认配置。

## 布局

```text
dsh-model-plus/   # 可发布的 DSH npm 插件包（@kingsunb/dsh-model-plus）
  lib/index.js      # host 半：注册 /api/plus/* HTTP 端点，读写 settings
  lib/client.js     # client 半：设置页「模型 Plus」UI（__ModuleLoader__ 工厂）
  cordis.patch.yml  # 把插件行插入 web profile 的 cordis 层
  package.json      # dsh.bundle + dsh.client 声明
models.json       # 上游默认：按模型名匹配 reasoning / vision / contextWindow
schema/           # models.json 的 JSON Schema
```

## 安装插件

```sh
dsh plugin --profile web add @kingsunb/dsh-model-plus
dsh web
```

装完重启 `dsh web`，设置页出现「模型 Plus」入口。

开发调试（从 GitHub 仓库安装）：

```sh
git clone https://github.com/kingsunb/dsh-model-plus.git
cd dsh-model-plus
dsh plugin --profile web add link:$(pwd)/dsh-model-plus
```

插件包详情见 [`dsh-model-plus/README.md`](./dsh-model-plus/README.md)。

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

## 友情链接

- [Linux.do 社区](https://linux.do/)

## License

MIT
