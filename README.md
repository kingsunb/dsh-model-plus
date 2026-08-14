# dsh-model-plus

DeepSeek Harness **模型 Plus** 仓库：可发布的 DSH Web 插件包。

## 布局

```text
dsh-model-plus/   # 可发布的 DSH npm 插件包（@kingsunb/dsh-model-plus）
  lib/index.js      # host 半：注册 /api/plus/* HTTP 端点，读写 settings
  lib/client.js     # client 半：设置页「模型 Plus」UI（__ModuleLoader__ 工厂）
  cordis.patch.yml  # 把插件行插入 web profile 的 cordis 层
  package.json      # dsh.bundle + dsh.client 声明
```

## 安装插件

```sh
dsh plugin --profile web add @kingsunb/dsh-model-plus
dsh web
```

装完重启 `dsh web`，设置页出现「模型 Plus」入口。

开发调试：

```sh
git clone https://github.com/kingsunb/dsh-model-plus.git
cd dsh-model-plus
dsh plugin --profile web add link:$(pwd)/dsh-model-plus
```

插件包详情见 [`dsh-model-plus/README.md`](./dsh-model-plus/README.md)。

## 同步源

一键同步默认使用：

```text
https://models.dev/api.json
```

按模型 id 补全思考强度 / 上下文 / maxTokens / 视觉。本地可按供应商再改。

## 友情链接

[Linux.do 社区](https://linux.do/)

## License

MIT
