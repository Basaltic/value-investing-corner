# 价投小角落桌面端

React + Vite + Tauri 2，独立于 `apps/web` 迭代。

从仓库根目录运行：

```sh
corepack pnpm dev:desktop:web
corepack pnpm build:desktop
corepack pnpm dev:desktop
corepack pnpm bundle:desktop
```

- `src/app`：应用布局和路由组织。
- `src/features`：工作台、公司档案、本地资料库与估值工具，按功能分层。
- `src/adapters`：原生调用适配与错误处理；浏览器模式不伪装原生。
- `src-tauri`：Rust 入口、原生命令、窗口配置与最小插件权限。

当前实现公司档案与本地资料库（文件/链接/笔记、标签、编辑归档、内嵌预览、CSV映射），schema v3与资料备份回归可用。最新范围与P04验收限制见根目录 `docs/desktop-material-contract.md` 和 `docs/desktop-implementation-progress.html`。本期不含正式判断版本、指标、采集、AI或用户备份页面。独立debug验收包位于 `src-tauri/target/debug/bundle/macos/价投小角落 P04验收.app`，双击可做隔离样例验收；正式开发使用 `corepack pnpm dev:desktop`，数据目录互不相通。下段为早期骨架验收历史，release包不包含最新P04。未代用户提交。
- `packages/valuation`、`packages/content-schema`：通过 workspace 依赖共享稳定能力。

`dev:desktop:web` 仅是前端浏览器预览。已检查 Homebrew Rust/Cargo 1.94.1（`/opt/homebrew/bin`），临时补齐执行终端 PATH 后，Rust 格式检查、`cargo check` 和 `cargo test` 均通过（1 项单元测试）。此前未找到工具是 PATH 问题，并非未安装；未改动系统配置。原生窗口与 macOS ARM64 release 打包已验证：工作台正常显示，app_info 返回 0.1.0 且连接正常，估值页导航和载入示例成功。DMG 校验和有效，包内二进制与构建输出一致；没有向 /Applications 安装或覆盖已有应用。检测到用户正在操作窗口后停止界面控制，未进一步检查结果区域。产物为本地验证包，未使用 Developer ID 签名或 Apple 公证；Intel/Windows/Linux 未验证。打包产物位于 `src-tauri/target/release/bundle/macos/价投小角落.app` 和 `src-tauri/target/release/bundle/dmg/价投小角落_0.1.0_aarch64.dmg`。若终端找不到 Cargo，在当前终端运行 `export PATH="/opt/homebrew/bin:$PATH"`。当前仅有工作台、连接状态和 DCF 输入计算，不含完整离线阅读、存储、登录或自动更新。模板图标暂保留用于开发，正式发布前需换为品牌图标。
