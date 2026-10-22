# 价投小角落

**Value Investing Corner**

一个专注价值投资、记录理性思考与长期成长的内容角落。项目使用 Next.js、Fumadocs 和 Markdown 构建。

## 本地运行

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

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

在 `.env.local` 或部署环境设置以下变量（值需为真实凭据）：

```dotenv
ALGOLIA_APP_ID="你的应用 ID"
ALGOLIA_SEARCH_API_KEY="只读搜索 API key"
ALGOLIA_WRITE_API_KEY="写入 API key"
ALGOLIA_INDEX_NAME="document"
```

`next.config.mjs` 将应用 ID 和只读搜索密钥分别映射为 `NEXT_PUBLIC_ALGOLIA_APP_ID` 和 `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY`，搜索组件直接读取这两个公开变量。也支持直接配置它们，并兼容旧 `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` 别名（优先级：新公开变量、旧公开别名、原始变量）。写入密钥支持 `ALGOLIA_WRITE_API_KEY` 和 `ALGOLIA_WRITE_KEY`，仅用于同步脚本，绝不加入 `next.config.mjs` 的 `env`，也不能使用 `NEXT_PUBLIC_` 前缀。配置层会拒绝搜索与写入密钥相同的情况；只读密钥不能拥有写入权限。

- `pnpm build`：构建 `/static.json`，随后自动同步索引。
- `pnpm search:sync`：将最近一次构建导出的文档同步到 Algolia。
- `pnpm search:test`：验证配置、安全保护与索引结构，不访问远端服务。

`/static.json` 只导出可公开资料的标题、链接及结构化内容；同步脚本读取 `.next/server/app/static.json.body`，用 Fumadocs `sync()` 设置搜索属性并替换目标索引的全部记录。**该索引应专供本站使用，勿指向已有其他业务的索引。** 脚本拒绝空数据、重复 ID/URL、异常结构和不完整凭据，配置完整时远端同步失败会使构建失败，避免默默上线过期搜索。

Vercel Preview 构建默认不写索引，避免覆盖生产搜索数据。需要预览搜索时应同时设置独立的 `ALGOLIA_INDEX_NAME` 和 `ALGOLIA_SYNC_PREVIEW=true`；`ALGOLIA_SKIP_SYNC=true` 可显式跳过自动同步（例如离线构建），手动 `pnpm search:sync` 不受该开关影响。新增或更新内容后重新构建；更换配置也需重建静态页面。

## 常用命令

```bash
pnpm dev          # 本地开发
pnpm build        # 生产构建
pnpm check        # 代码检查与类型检查
pnpm check:fix    # 自动修复格式与可修复问题
```

## 目录说明

- `app/(home)`：首页
- `app/knowledge`：资料库页面与导航
- `app/blog`：文章列表与详情
- `app/api/search`：站内搜索
- `lib/source.ts`：内容集合、排序与搜索索引
- `lib/shared.ts`：站点名称、路由与仓库配置
