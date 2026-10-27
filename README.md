# 价投小角落

**Value Investing Corner**

一个专注价值投资、记录理性思考与长期成长的内容角落。Web 使用 Next.js、Fumadocs 和 Markdown，桌面端使用 React、Vite 与 Tauri 2；两端通过 pnpm workspace 独立迭代。

## 本地运行

```bash
corepack pnpm install
corepack pnpm dev:web
```

打开 [http://localhost:3000](http://localhost:3000)。

## 仓库结构与边界

```text
apps/web/               Next.js 网站：页面、API、Fumadocs 和线上搜索
apps/desktop/           React + Vite 前端与 src-tauri 原生工程
packages/valuation/     共享 DCF 算法与测试，不依赖页面或平台
packages/content-schema/共享资料元数据类型与 Zod 校验
content/                共享原始资料 workspace，React 用于 MDX 编译
scripts/                资料导入与仓库级验证工具
```

应用之间不得互相导入代码。共享包不得依赖应用、Next.js 或 Tauri。仅抽取两端确实相同且稳定的能力；页面、导航、状态、搜索与存储各端独立维护。不预先创建通用 UI 包。

原始资料和文章仍在根目录 `content`；网站图片、PDF 等静态资源在 `apps/web/public`。内容导入脚本已相应更新。`.env.local` 已移至 `apps/web`，始终被 Git 忽略。网站内容集合使用 Fumadocs 要求的目录字符串 `../../content/knowledge`、`../../content/blog`，索引导出脚本主动切换至 Web 目录，避免由调用位置改变路径。

## 桌面端

```bash
corepack pnpm dev:desktop:web   # 浏览器预览，默认 localhost:28743
corepack pnpm build:desktop     # 仅构建桌面前端 dist，不调用网站同步
corepack pnpm dev:desktop       # Rust 工具链可用后启动 Tauri 窗口
corepack pnpm bundle:desktop    # 构建原生安装包
```

当前桌面端包含公司列表、新建公司、详情、多证券与名称/代码搜索，以及公司详情中的本地资料库：文件/链接/文本笔记、编辑、标签搜索、归档恢复、PDF/图片/TXT/Markdown预览和CSV列映射确认。资料存SQLite，复制文件存附件目录；外部引用不复制原件，失效可重新定位同内容文件。schema v3支持v1/v2安全升级，详细合同见 `docs/desktop-material-contract.md`。CSV只作为资料结构，不写财务/指标。公司数据与Web独立，不送Algolia；DCF仍不保存或上传输入。基本备份核心覆盖公司证券与资料往返，但尚无用户备份页面。

P05新增自由判断草稿、900ms停笔保存、失败重试/恢复提示、只追加正式版、复制修订、时间线与逐行正文/原因差异，schema升级至v4；合同见 `docs/desktop-judgment-contract.md`。核心原生v1→v2、旧版只读、保存失败保护与重试已验证；2026-10-27补齐重启后判断页，草稿/原因/正式链和差异保留。关窗后观察到应用退出，但动作回执不确定；保存成功后关闭完整流程和恢复副本选择仍待补验（输入时用户正在操作，已停止控制并撤除隔离库失败模拟），不能标全项通过。指标、采集、AI与用户备份页面仍未实现。未提交、推送、安装或发布；release/DMG仍为历史产物，独立P05 debug包用于隔离验收，未签名公证或验证其他平台。

P04历史验收：Rust24/24、桌面适配7/7、Web24/24、Clippy、类型/lint及桌面前端/debug构建通过；原生实看建档、笔记保存/Markdown、PDF导入与字体修复、两页翻页、重启保留与归档恢复。图片/CSV/外部重定位未逐项GUI实看，文件与SQLite测试覆盖数据路径；当轮浏览器控制未返回观察。capabilities仍core:default，CSP仅扩展本地blob/同源字体与worker，不开放远程网络。资料笔记手动保存，与P05正式判断独立。

## 本地验证与生产构建

```bash
corepack pnpm test             # 结构、算法、资料模型、原生适配、搜索回归
corepack pnpm check:local      # 隔离 Algolia 凭据后执行 lint 与全部类型检查
corepack pnpm build:web:local  # 隔离 Algolia 凭据、不写远端的 Web 构建
corepack pnpm build:web        # 正常 Web 构建，按原配置同步搜索
```

`check:local`、`build:web:local` 仅覆盖验证子进程中的 Algolia 环境变量，不读取或修改环境文件，网站回退本地搜索；不能替代真实 Algolia 配置验证。当前环境文件触发“搜索密钥不能与写入密钥相同”的保护，已保留且未绕过。正式部署前需使用独立的只读搜索密钥与写入密钥。所有脚本通过 Corepack 调用 pnpm，避免终端 PATH 缺少 pnpm 时子脚本失败。

## Vercel 迁移

现有 Vercel 项目配置已通过 CLI 修正并回读验证：Root Directory=`apps/web`、Framework=Next.js、Build Command=`corepack pnpm build`、Install Command=`corepack pnpm install --frozen-lockfile`、Output Directory 保持自动；Include source files outside of the Root Directory in the Build Step 已开启。Production 和 Preview 已添加 ENABLE_EXPERIMENTAL_COREPACK=1，使用仓库根目录的统一锁文件与 packageManager。保留原有 Git 关联、生产分支、Node 24.x、域名及 Algolia 环境变量；本次没有主动重新部署、提交或推送。

网站搜索脚本位于 `apps/web/scripts`；产物在 `apps/web/build/search`。共享包源码通过 transpilePackages 接入，outputFileTracingRoot 指向仓库根目录。不要构建 desktop，不要为 Web 配置 output: export。本次目录迁移需要与 Vercel 根目录更新配合后再推送，避免下一次自动部署仍读取旧根目录。

## 内容结构

```text
content/
├── knowledge/         # 价值投资基本理念与大师资料
│   └── masters/       # 向大师学习，按人物组织
└── blog/              # 个人思考札记
```

资料库和博客都支持 `.md` 与 `.mdx` 文件。

### 新增资料

在 `content/knowledge` 下新建 Markdown 文件：

```md
---
title: 标题
description: 一句话摘要
category: 向大师学习
updated: 2026-10-18
tags: [护城河, 企业分析]
---

正文从这里开始。
```

文件夹中的 `meta.json` 用于设置导航名称和排序。

### 新增文章

在 `content/blog` 下新建 Markdown 文件：

```md
---
title: 文章标题
description: 文章摘要
date: 2026-10-18
tags: [投资思考, 长期主义]
---

正文从这里开始。
```

文章会自动出现在博客列表和站内搜索中，并按日期倒序排列。

## Algolia 搜索

搜索仍覆盖 `content/knowledge` 资料库；博客和工具暂不纳入，保持原有搜索范围。
搜索弹窗使用 Fumadocs Algolia 客户端，包含 Algolia 标识。未配置 Algolia 时保留原 `/api/search` 搜索。

在 `apps/web/.env.local` 或 Vercel 项目环境设置以下变量（值需为真实凭据）：

```dotenv
ALGOLIA_APP_ID="你的应用 ID"
ALGOLIA_SEARCH_API_KEY="只读搜索 API key"
ALGOLIA_WRITE_API_KEY="写入 API key"
ALGOLIA_INDEX_NAME="document"
```

`apps/web/next.config.mjs` 将应用 ID 和只读搜索密钥分别映射为 `NEXT_PUBLIC_ALGOLIA_APP_ID` 和 `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY`，搜索组件直接读取这两个公开变量。也支持直接配置它们，并兼容旧 `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` 别名（优先级：新公开变量、旧公开别名、原始变量）。写入密钥支持 `ALGOLIA_WRITE_API_KEY` 和 `ALGOLIA_WRITE_KEY`，仅用于同步脚本，绝不加入 `apps/web/next.config.mjs` 的 `env`，也不能使用 `NEXT_PUBLIC_` 前缀。配置层会拒绝搜索与写入密钥相同的情况；只读密钥不能拥有写入权限。

- `pnpm build`：先显式导出索引，再构建 Next.js，构建成功后自动同步。
- `pnpm search:export`：用与资料库共享的 Fumadocs 内容集合生成 `apps/web/build/search/algolia-documents.json`，不依赖 `.next` 或 `.vercel`，不需要 Algolia 凭据。
- `pnpm search:sync`：将最近一次显式导出的文档同步到 Algolia。
- `pnpm search:sync --dry-run`：只读取并校验构建索引，不检查密钥、不写入 Algolia。
- `pnpm search:test`：验证配置、安全保护与索引结构，不访问远端服务。

`/static.json` 仍用于公开资料的标题、链接及结构化内容导出，但不再作为自动同步的文件来源。`pnpm build` 在 Next.js 构建前通过独立 Node 脚本生成 `apps/web/build/search/algolia-documents.json`，同步脚本优先读取该文件，避免依赖构建适配器的内部目录。导出与网站复用 `apps/web/lib/content-collections.mjs`，使用 Fumadocs 官方 Node loader 和 `toDocuments()`，只在导出专用配置中关闭图片 import，不改变网站渲染。导出文件先写临时文件再原子替换，导出失败会中止构建，避免同步不完整数据。

同步脚本以 `apps/web` 为基准，独立索引缺失时仍支持旧 `.next/server/app/static.json.body`、`.vercel/output/static/static.json`、`.vercel/output/functions/static.json.prerender-fallback.body`，供旧构建手动同步使用。`ALGOLIA_INDEX_FILE` 可指定相对项目目录的路径或绝对路径；显式路径无效时不会回退。找不到产物会打印检查过的路径；空数据、损坏数据或重复 ID/URL 不会被其他旧文件掩盖。

部署平台的 Build Command 应使用 `pnpm build`，不能只执行 `next build`，否则会绕过显式导出。新的导出脚本、导出专用配置、共享集合和路由模块需一起纳入版本控制；生成的 `build/search` 目录已被忽略，无需提交。Vercel 中没有 `.env.local` 是可选文件提示，不影响已注入的环境变量。默认不必设置 `ALGOLIA_INDEX_FILE`；如先前指向平台内部路径，请移除该覆盖。

读取后用 Fumadocs `sync()` 设置搜索属性并替换目标索引的全部记录。**该索引应专供本站使用，勿指向已有其他业务的索引。** 脚本拒绝不完整凭据，配置完整时远端同步失败会使构建失败，避免默默上线过期搜索。

Vercel Preview 构建默认不写索引，避免覆盖生产搜索数据。需要预览搜索时应同时设置独立的 `ALGOLIA_INDEX_NAME` 和 `ALGOLIA_SYNC_PREVIEW=true`；`ALGOLIA_SKIP_SYNC=true` 可显式跳过自动同步（例如离线构建），手动 `pnpm search:sync` 不受该开关影响。新增或更新内容后重新构建；更换配置也需重建静态页面。

## 常用命令

```bash
pnpm dev          # 本地开发
pnpm build        # 生产构建
pnpm check        # 代码检查与类型检查
pnpm check:fix    # 自动修复格式与可修复问题
```

## 目录说明

- `apps/web/app/(home)`：首页
- `apps/web/app/knowledge`：资料库页面与导航
- `apps/web/app/blog`：文章列表与详情
- `apps/web/app/api/search`：站内搜索
- `apps/web/lib/source.ts`：内容集合、排序与搜索索引
- `apps/web/lib/shared.ts`：站点名称、路由与仓库配置
