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
├── knowledge/         # 价值投资资料，按主题组织
│   ├── frameworks/    # 投资框架
│   └── mental-models/ # 心智模型
└── blog/              # 个人思考札记
```

资料库和博客都支持 `.md` 与 `.mdx` 文件。

### 新增资料

在 `content/knowledge` 下新建 Markdown 文件：

```md
---
title: 标题
description: 一句话摘要
category: 投资框架
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

- `app/(home)`：首页
- `app/knowledge`：资料库页面与导航
- `app/blog`：文章列表与详情
- `app/api/search`：站内搜索
- `lib/source.ts`：内容集合、排序与搜索索引
- `lib/shared.ts`：站点名称、路由与仓库配置
