# P05 自由判断、自动保存与版本历史合同

## 授权与入口

仅实现已批准的 P05。P04 已由用户“继续 P05”确认。P06 指标、看板、采集和运行时 AI 未实现；每阶段停止等用户确认，自动生成 commit 描述但不执行提交、推送或发布。

公司研究 → 公司档案 → 个人判断与历史。正式开发从仓库根目录运行 `corepack pnpm dev:desktop`。独立验收应用为 `apps/desktop/src-tauri/target/debug/bundle/macos/价投小角落 P05验收.app`，双击打开；独立数据目录不与正式应用互通，不安装到 Applications。旧 release/DMG 不含 P05。

## 内容模型与安全

- schema v4 新增 `judgment_drafts` / `judgment_versions`。每公司至多一个草稿；正式版以公司内递增版本号排列，保留基版、开始时间、冻结时间、正文、修订原因。
- 草稿自由正文，可选护城河、管理层、资本配置、风险与反证提纲。不强制评分、分段或证据。正文内批注/引用使用 blockquote，不新增独立评论流。
- Tiptap + StarterKit 编辑，允许段落、1–3级标题、列表、引用、代码块、分隔线和换行，以及加粗/斜体/删除线/行内代码。Rust 校验节点字段、属性、标记、父子结构、深度和大小；纯文本由 Rust 从 JSON 派生，不信前端派生值。图片、外部链接、原始 HTML 等不在判断内容白名单内。
- 正文 JSON 上限 1,000,000 UTF-8 字节，嵌套深度上限30；修订原因上限4000 UTF-8字节（界面 maxLength 是字符数，超字节限制由原生明确拒绝并保留输入）。空草稿可保存；无实际正文不能冻结。
- 证据引用作为未来接口预留，当前为空并显示“未附证据”，无提前公告/新闻/证据表，不声称已支持证据附加。

## 草稿与正式版本

1. 新建草稿，不覆盖同公司已有草稿；从正式版修订时只复制同公司的基版正文，记录 base_id，原因留空。
2. 停笔约900ms自动写 SQLite；立即保存/重试也走同一串行状态机。保存与删除携带 expectedRevision，过期请求明确失败，不自动覆盖。
3. 保存 UPDATE 与回读在同一事务内，返回该次写入 revision；写入中继续编辑，最新输入串行再保存，不被旧回包回写。
4. 转正式需确认，先保存，再于单一事务冻结；重复冻结失败。正式表 SQLite 触发器拒绝 UPDATE/DELETE，旧版只读展示。修订复制新草稿，再冻结形成 v2，而不是更新 v1。
5. 删除草稿需二次确认；等待在途保存返回后按最新revision删除，停止后续保存循环，删除不影响正式版。失败保留正文和可重试状态。

## 自动保存失败与离开保护

- 状态明确区分已保存、有修改、保存中、失败。失败保持最新内存输入，提供手动重试；不会以异常清空正文。
- native WebView localStorage 按公司ID/草稿ID暂存未完成输入及revision。它不是 SQLite 权威数据，不进入 P02 database/attachments 备份。写入恢复暂存失败时显示“仅当前窗口内存中”，不承诺断电/强制退出绝对不丢字。
- 重开发现恢复副本时需人工选择，不自动覆盖。revision不一致不能载入覆盖，可复制JSON核对；损坏副本需明确放弃。恢复副本界面处理尚未逐项原生实看。
- hash 路由用 data router 的 blocker，未保存/恢复待处理/动作中阻止导航。离开提供留在草稿或保存成功后离开；保存失败不跳转。
- 当前窗口 CloseRequested 主动 preventDefault。脏状态显示保护提示，干净或保存成功后调用无参数、仅当前窗口的 Rust 关闭包装。未授通用前端 destroy/fs/网络权限。
- 普通关窗、应用退出、强制终止是不同事件。Cmd+Q/系统强制终止的未保存保护未验收，不把普通关窗提示外推为全进程退出保证。

## 时间线与差异

正式版本从新到旧，显示冻结时间、可选原因和未附证据状态；有草稿时仍能查看历史，但不能启动第二份草稿。草稿区显示开始和最近数据库保存时间。

版本差异按 Rust 派生纯文本逐行展示新增、删除、保留文字，修订原因单独比较。格式修改不作为文字差异；可选不同只读原版核对格式，不承诺富文本结构级 diff。

## 迁移与备份

- 旧 schema v1/v2/v3 升级前保存对应一致副本，不覆盖已有快照；迁移失败回滚，旧迁移文件不改。新库与重启均为v4。
- 备份格式仍1、schema兼容1–4；旧备份只在staging升级。已存草稿、正式链、ID、revision、原因与基版进入SQLite备份，自动化真实数据库往返验证；外部文件引用与第三方恢复规则沿用既有阶段边界。

## 验收事实与未完成项

原生隔离公司（虚构）主路径已实际观察：草稿正文停笔保存→无提纲/证据冻结v1→旧版键入不变→复制修订→正文和原因保存→冻结v2→新增/删除/保留与原因差异正确。

仅在隔离库建立临时失败触发器模拟保存错误，真实 UI 显示失败，最新正文与原因仍在；导航与普通关窗出现保护提示，失败后“保存成功后离开”仍被阻止。移除临时触发器后重试成功，独立只读 SQLite 回读确认最新输入与两个正式版保留。临时触发器已清除，正式应用数据库未访问。

初版成功保存后窗口仍不关闭，经实际锁定 SDK 的默认destroy权限路径，已改为主动拦截＋窄Rust当前窗口destroy并重新构建。上一轮用户操作窗口后停止控制，保留当时未验收事实。

2026-10-27续接：重启后判断页已实际读到草稿revision1、失败后保存的正文/原因、v1/v2及差异。干净草稿关窗操作回执为进程失效且结果不确定，后续窗口发现与只读进程检查确认应用退出；重新启动后判断页仍保留上述数据。不能把不确定回执算作成功关窗完整验收。恢复补验输入步骤再次返回USER_CONTROL_ACTIVE，立即停止GUI；仅隔离库临时失败触发器已撤除并确认不存在，正常保存恢复，输入步骤是否完成未确认。**保存成功后关闭完整流程、恢复副本选择、全部编辑工具按钮、资料与DCF新路由目视仍未完成**，重启判断页已补齐。

后续再次补验遭遇窗口输入通道阻塞：公开Raise后可取得窗口截图，但键盘仍返回no_on_screen_window且未发送输入；用户显示窗口并交回控制后，滚动仍被同类拒绝。已撤除隔离库临时失败模拟，不重复前置、不绕过窗口校验、不把交回控制当作验收。此阻塞未解除前，保存成功后关闭与恢复副本选择继续保持未验收。

因此 P05 为“核心已实现，最终原生补验未完成，待用户验收”，不是全部验收通过。最新自动检查结果与日志以 `desktop-implementation-progress.html` 的P05节为权威；本轮未改业务代码，未重复跑已完成的全量回归，原自动验证证据保留为上轮结果；P06未授权。

## Commit描述（仅生成，不提交）

```text
feat(desktop): add personal judgment drafts and immutable history

- add schema v4 judgment drafts and append-only official versions
- implement revision-checked save, freeze, revise and discard commands
- add Tiptap free-form writing, draft autosave and recovery prompts
- protect unsaved navigation and handle current-window close requests
- show read-only version timeline and line-based text/reason differences
- verify judgment IPC, migration and backup round trips
- document native acceptance evidence and remaining verification gaps
```
