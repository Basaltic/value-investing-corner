# Tauri 与独立 Web 目录迁移实施计划

**目标**：在现有仓库内建立可独立迭代的 Next.js Web 与 React/Vite/Tauri 桌面骨架，不改原始资料、网站导航和业务结果。

**架构**：`apps/web` 保留网站页面与网站专属搜索；`apps/desktop` 使用官方 Tauri React TypeScript 模板。`packages/valuation` 仅含现有 DCF 算法与测试，`packages/content-schema` 仅含框架无关资料元数据校验。原始资料仍在根目录 `content`，网站静态资源迁入 `apps/web/public`。

**约束**：当前分支 `feat/mono`，不提交、不推送、不部署、不改远端 Vercel。保留环境文件但不读出密钥。本轮不实现完整离线阅读、数据库、自动更新或登录；桌面展示基础入口、真实原生连接检查与共享算法计算。

## 实施清单

- [x] 新增仓库结构测试并确认迁移前失败：检查独立包名、workspace 声明、共享依赖、网站/桌面目录及网站构建入口。
- [x] 移动网站 app/components/lib/public 和 Next.js 配置至 apps/web；网站搜索脚本同迁移，根目录保留资料导入脚本。
- [x] 将 DCF 算法及原测试迁入 packages/valuation；在两端显式声明 `workspace:*` 依赖，不允许 apps 互相引用。
- [x] 测试先定义元数据校验边界，再抽出 content-schema；Fumadocs 集合通过 extend 适配，保持原 schema 语义。
- [x] 修正 Fumadocs 要求的目录字符串与脚本工作目录、搜索导出 CI fixture、原资料导入静态资源路径；根目录原有 dev/build/search 命令委托 web。
- [x] 从官方 create-tauri-app React TypeScript 模板整理桌面 src/app、features、adapters；Tauri 仅保留必需权限，删除模板网络跳转与示例问候功能。
- [x] 根目录统一 pnpm 锁文件和代码规范；更新 README 与 Vercel 迁移说明。Web build 保留搜索同步，验证时显式禁用远端写入。
- [x] 运行共享/结构/搜索测试、lint、类型检查、Web/桌面构建；核对资料和静态资源迁移前后哈希。
- [x] 验证桌面前端真实渲染；如 Rust 可用，运行原生检查、构建和窗口验证，否则明确记录工具链阻塞，不宣称原生可运行。

## 验证命令

```sh
corepack pnpm install
corepack pnpm test
corepack pnpm check
ALGOLIA_SKIP_SYNC=true corepack pnpm build:web
corepack pnpm build:desktop
corepack pnpm dev:desktop:web
corepack pnpm dev:desktop
```

最终使用仓库现有文件交付修改，说明新增结构、命令、验证覆盖和未完成项。
