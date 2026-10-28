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

## 本地验证与生产构建

```bash
corepack pnpm test             # 运行测试
corepack pnpm check:local      # 本地 lint 与全部类型检查
corepack pnpm build:web:local  # 不写远端的本地 Web 构建
corepack pnpm build:web        # 正常 Web 生产构建
```

所有脚本通过 Corepack 调用 pnpm，避免终端 PATH 缺少 pnpm 时子脚本失败。

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
