# dsh-model-plus

DeepSeek Harness **模型 Plus** 仓库：可发布的 DSH Web 插件包。

## 布局

```text
api.json           # models.dev 目录快照，供 GitHub 国内加速源读取
dsh-model-plus/     # 可发布的 DSH npm 插件包（@kingsunb/dsh-model-plus）
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

同步设置提供三个选项：

- 官方源：`https://models.dev/api.json`
- 国内 GitHub 加速源：`https://gh-proxy.org/https://github.com/kingsunb/dsh-model-plus/raw/refs/heads/main/api.json`
- 自定义 HTTPS 地址

国内源读取仓库根的 `api.json` 快照；更新目录时，重新下载官方 `models.dev/api.json` 覆盖该文件并提交即可。目录按模型 id 补全思考强度 / 上下文 / maxTokens / 视觉，本地仍可按供应商再改。

## 友情链接

[Linux.do 社区](https://linux.do/)

## License

MIT
