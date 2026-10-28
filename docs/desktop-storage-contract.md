# P01 本地存储与迁移合同

## 范围

本阶段只提供桌面端本地 SQLite 技术底座，不包含公司、资料、判断、指标等业务表或业务页面。

## 数据库位置

- 由 Tauri 的 `app_data_dir()` 定位应用数据目录。
- 数据库文件名固定为 `research.sqlite3`。
- 前端不得传入任意数据库路径，也不得执行 SQL。

## 初始化与迁移

- 应用启动时由 Rust 原生侧打开数据库并运行内嵌迁移。
- SQLite 使用 WAL 日志模式并开启外键约束。
- P08当前schema为7：新增source_registrations、collection_runs、collection_events、collection_quota。来源登记revision比较交换，任务三元键幂等，事件有稳定sequence与UTC时间且禁止改删；SEC双通道共享配额。v6升级保留看板/旧库快照，冲突回滚；旧1–6迁移不改。详见 `docs/desktop-collection-contract.md`。Keychain不在SQLite内。
- P07当前schema为6：新增dashboard_config配置单例与research_items研究事项；v1–v5升级前按当前版本留一致快照，冲突回滚，旧迁移不修改。P07新增v5成功与v6冲突保留财务记录测试；详细接口见 `docs/desktop-dashboard-contract.md`。
- P01原始schema为1，P03为2，P04为3，P05为4，P06为5（财务事实版本、自定义指标定义、观测版本和派生快照）。v1–v4升级前按当前版本保存对应 `research.vN-backup.sqlite3`，事务失败回滚，已有同名快照不覆盖；旧迁移不改写。P06新增v4成功迁移及冲突回滚保留旧判断测试。
- 财务与指标命令边界见 `docs/desktop-finance-contract.md`；P05原生验收缺口不因升级被改写。
- v2 完整命令与迁移边界见 `docs/desktop-company-contract.md`；P01 原始验收范围仍按下文保留。
- 重复启动和重复运行迁移必须幂等，数据库版本保持一致。
- 若数据库 `user_version` 高于应用支持版本，拒绝启动且不修改原库。
- 迁移完成后同时校验 `PRAGMA user_version` 与 `storage_metadata.schema_version`；不一致时拒绝启动。

## 窄命令合同

### `storage_status`

只读，无参数。返回：

```ts
type StorageStatus = {
  schema_version: number;
  database_path: string;
};
```

该命令只用于诊断当前本地存储状态，不提供文件浏览、SQL 执行、网络访问或业务数据写入能力。

## 权限边界

- Tauri capabilities 继续仅包含 `core:default`。
- 本阶段不加入文件、网络或 shell 插件权限。
- 数据库访问只在 Rust 侧进行。

## P01 验收

- 新库初始化至 schema version `1`。
- 同一路径重复初始化结果一致。
- WAL 模式生效。
- 高于支持版本的数据库被拒绝，且原 `user_version` 保持不变。
- Rust 格式、测试、检查和桌面前端构建通过。
