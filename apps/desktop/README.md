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

当前包含公司档案与本地资料库，以及P05自由判断草稿、自动保存、只追加正式历史、复制修订、文字与原因差异，schema v4。最新合同见 `docs/desktop-judgment-contract.md`，权威进度见 `docs/desktop-implementation-progress.html`。核心原生v1→v2及保存失败保护已实看；2026-10-27重启后的判断页与内容保留已补验。保存成功后关闭完整流程与恢复副本选择仍待补验，输入时用户操作窗口，已停止控制并撤除隔离库临时失败模拟，P05不能标全项通过。采集、AI或用户备份页面未实现。用户已明确进入P06，P05历史缺口保留。P06新增手工财务/观测、版本核对与固定派生、ECharts缺值趋势，schema v5，合同见 `docs/desktop-finance-contract.md`，验收结果以权威进度为准，P07已授权并新增指标看板、配置分组/卡片显隐排序、时间范围与事项，schema v6，合同见 `docs/desktop-dashboard-contract.md`；P05/P06历史缺口保留；P07已获继续放行，P08新增来源登记、系统Keychain与手动任务页，schema v7，合同 `docs/desktop-collection-contract.md`。默认源关闭、生产无实际适配器，不联网、不伪称已归档；密钥只回传配置状态，不进SQLite/备份。来源登记保存及默认关闭已原生实看，任务/凭据全流程与重启验收受用户控制中断，仍未全验；权威记录保留缺口。独立P08应用 `src-tauri/target/debug/bundle/macos/价投小角落 P08验收.app` 双击后进入“来源与任务”，与正式库隔离；P09–P13未授权，AI后置、不代提交。独立P07应用为 `src-tauri/target/debug/bundle/macos/价投小角落 P07验收.app`，用于虚构数据隔离验收，不访问正式库。独立P06应用位于 `src-tauri/target/debug/bundle/macos/价投小角落 P06验收.app`，数据为虚构隔离夹具，不与正式库互通。每阶段commit描述自动生成，不代提交。独立debug验收包位于 `src-tauri/target/debug/bundle/macos/价投小角落 P05验收.app`，双击可做隔离样例验收；正式开发使用 `corepack pnpm dev:desktop`，数据目录互不相通。下段为早期骨架验收历史，release包不包含最新P05。未代用户提交。
- `packages/valuation`、`packages/content-schema`：通过 workspace 依赖共享稳定能力。

`dev:desktop:web` 仅是前端浏览器预览。已检查 Homebrew Rust/Cargo 1.94.1（`/opt/homebrew/bin`），临时补齐执行终端 PATH 后，Rust 格式检查、`cargo check` 和 `cargo test` 均通过（1 项单元测试）。此前未找到工具是 PATH 问题，并非未安装；未改动系统配置。原生窗口与 macOS ARM64 release 打包已验证：工作台正常显示，app_info 返回 0.1.0 且连接正常，估值页导航和载入示例成功。DMG 校验和有效，包内二进制与构建输出一致；没有向 /Applications 安装或覆盖已有应用。检测到用户正在操作窗口后停止界面控制，未进一步检查结果区域。产物为本地验证包，未使用 Developer ID 签名或 Apple 公证；Intel/Windows/Linux 未验证。打包产物位于 `src-tauri/target/release/bundle/macos/价投小角落.app` 和 `src-tauri/target/release/bundle/dmg/价投小角落_0.1.0_aarch64.dmg`。若终端找不到 Cargo，在当前终端运行 `export PATH="/opt/homebrew/bin:$PATH"`。当前仅有工作台、连接状态和 DCF 输入计算，不含完整离线阅读、存储、登录或自动更新。模板图标暂保留用于开发，正式发布前需换为品牌图标。
