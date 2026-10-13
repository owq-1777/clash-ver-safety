# Clash Ver Safety

基于 Clash Verge 的桌面代理配置管理项目，使用 Rust、Tauri 2 和 React，内置 Mihomo 内核。

## 功能

- 管理本地配置和远程订阅，支持 Merge、Script 增强及配置编辑。
- 系统代理、代理守卫和 TUN 模式。
- 查看代理节点、规则、连接、流量和运行日志。
- 本地备份的创建、导入、导出和恢复。
- Mihomo 稳定版与 Alpha 内核切换、更新。
- 自定义主题和界面布局。

应用本体采用手动安装新版本的方式更新。内核更新可在设置的内核管理页面中执行；订阅、规则和 GeoIP 数据仍可更新。

## Windows x64 安装

从[本仓库 Releases](https://github.com/owq-1777/clash-ver-safety/releases) 下载 Windows x64 的 `*-setup.exe` 安装包，运行安装向导。

自动构建使用 `x86_64-pc-windows-msvc`，产物为 NSIS `.exe` 安装包。手动构建的安装包可从对应 GitHub Actions 运行的 `windows-x64-installer` artifact 下载。

配置 GPG Secrets 后，Release 会附带安装包的 `.asc` 分离签名、公钥和已签名的 `SHA256SUMS`。GPG 用于验证下载文件；Windows 安装程序的 Authenticode 发布者签名需要单独配置代码签名证书。详见[发布与签名说明](docs/github-release.md)。

## 开发

安装 Node.js、pnpm 和 Rust。pnpm 版本以 `package.json` 为准，Rust 版本以 `rust-toolchain.toml` 为准；系统依赖见 [CONTRIBUTING.md](CONTRIBUTING.md)。

```sh
pnpm install --frozen-lockfile
pnpm prebuild
pnpm dev
```

`prebuild` 下载内核、服务程序和规则数据。`pnpm dev:service` 准备开发服务，`pnpm dev:sidecar` 使用 Sidecar 模式。

## 构建 Windows x64

在 Windows 上安装 Visual Studio Build Tools 的 C++ 桌面开发组件及 Windows SDK，然后执行：

```sh
pnpm install --frozen-lockfile
pnpm prebuild x86_64-pc-windows-msvc
pnpm build --target x86_64-pc-windows-msvc --bundles nsis
```

安装包输出目录：`target/x86_64-pc-windows-msvc/release/bundle/nsis/`。

## 自动发布

[发布工作流](.github/workflows/release.yml) 支持两种触发方式：

- **Actions → Release Windows x64 → Run workflow**：构建并上传安装包 artifact。
- 推送与项目版本一致的 `v<version>` 标签：构建并发布 GitHub Release。

发布上传使用 GitHub 自动提供的 `GITHUB_TOKEN`。可选的 GPG 分离签名使用 `GPG_PRIVATE_KEY`、`GPG_KEY_ID` 和 `GPG_PASSPHRASE`；配置方法见[发布与签名说明](docs/github-release.md)。

## 安全记录

已完成的修复、验证结果和剩余风险见[本地安全审计记录](docs/security-audit-plan.md)。

## 许可证

本项目沿用 GPL-3.0 许可证，保留原项目版权声明。详见 [LICENSE](LICENSE)。
