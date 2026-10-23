# 迁移与验证结果

## 已完成

- Web 移至 apps/web，保留页面、路由、导航与搜索功能。
- 桌面端 apps/desktop 采用官方 React TypeScript Tauri 模板，整理 app/features/adapters；新增工作台、原生连接状态和共享算法 DCF 页面。
- packages/valuation 提取现有算法及测试，packages/content-schema 提取元数据校验。
- content 保留根目录并声明 workspace，供 MDX 编译解析 React；网站静态资源移至 apps/web/public。
- 根目录保留统一锁文件、开发构建入口及本地验证脚本；搜索导出/同步仅属于 Web。
- README 记录开发、测试、架构边界、Vercel 迁移要求。

## 验证

- 原始资料与静态资源：迁移前后 339 个文件归一化路径后哈希一致，未更改正文或资源像素。
- 网站独立搜索导出：245 篇文档，CI fixture 在无 Next 产物和环境文件时能导出与 dry-run 校验。
- 结构、DCF、元数据、原生适配、搜索回归及本地凭据隔离测试均通过。
- Web 生产首页已通过浏览器渲染验证；资料页、DCF、搜索 API 和图片请求返回 HTTP 200。Vercel analytics/speed-insights 的平台脚本在本地服务中产生 404，未改动网站原有线上监测行为。
- lint 与两端/共享包 TypeScript 检查在无 Algolia 凭据环境验证。
- Web 完整生产构建成功（禁用远端搜索写入），桌面前端生产构建成功。
- 桌面前端通过浏览器检查工作台、估值页面、空输入、载入示例和刷新清空；修复 favicon 404 后控制台无错误。

## 未完成与注意

- 已核实 Homebrew Rust/Cargo 1.94.1 位于 `/opt/homebrew/bin`。此前 cargo metadata 不可执行是执行终端 PATH 缺少该目录，并非未安装。临时补齐 PATH 后，`cargo fmt --check`、`cargo check`、`cargo test` 全部退出码 0；Rust 单元测试 1 项通过、0 项失败。生成 `apps/desktop/src-tauri/Cargo.lock` 固定依赖。未修改系统工具链或 shell 配置。

## 原生窗口与 macOS 打包验证

- `tauri build --bundles app,dmg --ci` 成功，退出码 0。构建本机 ARM64 release 应用与 DMG，版本 0.1.0。
- `.app` 大小约 4.00 MiB，DMG 约 1.93 MiB；二进制识别为 Mach-O 64-bit arm64。
- 通过桌面控制打开打包后的 `.app`，实际 WebView 地址 tauri://localhost，工作台正常渲染且显示“价投小角落 · 0.1.0 · 原生连接正常”。
- 重新检查连接及进入估值页正常；载入示例后显示虚构数据提示，全部输入字段填入预期示例值。检测到用户正在操作应用后停止界面控制；结果区域未进一步验证，未宣称完整原生功能测试通过。
- `hdiutil verify` 显示 checksum VALID；镜像已只读挂载，包内应用与构建输出比对无差异，二进制 cmp 一致。验证后已卸载镜像，未向 /Applications 安装或覆盖已有应用。
- DMG SHA-256：`5f263d0f07b34b9c383ac990c4a7a406669f148d3fb2d4476664d79671fa2d64`。
- 签名检查显示 adhoc/linker-signed，无 TeamIdentifier；未使用 Developer ID 签名或 Apple 公证。这是本地验证包，不代表可无提示公开分发。未验证 Intel、Windows、Linux 或全新机器的 Gatekeeper 安装流程。
- `.app`：`apps/desktop/src-tauri/target/release/bundle/macos/价投小角落.app`。
- DMG：`apps/desktop/src-tauri/target/release/bundle/dmg/价投小角落_0.1.0_aarch64.dmg`。

## 保留的注意项
- 原 apps/web/.env.local 触发搜索密钥等于写入密钥的保护；保留原值，正式构建仍会阻止此配置。check:local/build:web:local 仅隔离验证子进程，不构成生产凭据验证。
- Fumadocs/webpack 缓存动态 import 和 CSS ::highlight 优化器产生依赖层警告；Web 构建成功，未修改依赖库或禁用检查。后续需按框架版本升级排查缓存失效与 CSS 兼容性。
- 未实现完整离线阅读、笔记、收藏、数据库、登录或自动更新。
- 未提交、推送、发布或修改 Vercel。推送前应将既有 Vercel 项目根目录更新为 apps/web，并允许根目录外源码。
- Tauri 官方模板图标暂用于开发，未建立品牌安装包图标。
