# P07 指标看板合同

## 授权与边界

用户明确“继续 P07”。实施批准方案§4.2/§6.6/§9 P07：模板卡片显隐/排序、公司分组、所选指标入卡、时间范围、待读/待补/最近正式判断；配置SQLite及备份、重启保持。无网络、AI、采集、低代码拖拽或P08。P05/P06已知原生补验缺口保留，不回写成通过。

## 配置设计

全局一份看板，按公司分组；一个公司最多归属一个自定义组，未分组公司进入系统“未分组”，新公司不强制填组。组顺序、组内公司顺序、每公司卡片顺序均由配置数组保存，按钮上移/下移，不引入拖拽框架。空公司库引导建档；无卡公司引导添加模板，未保存配置不自动写库。

模板：指标、待读资料、待补数据、最近正式判断。指标可选原始/固定派生/自定义数值或文本；选择保存kind、metric及不可变原始事实或定义anchor_id，不复制值。卡片from/to可空、show_pending默认false。财务趋势沿用P06精确口径/期间跨度/null断点；原始数据有审核/缺口径保护，文本仅文本卡片。

待读：用户显式选择未归档资料标记待读/已读，状态单独存SQLite，不改资料正文/归档字段；不把全部资料默认当待读。待补：本人输入的待补事项、可勾完成；另显示所选指标的缺值/口径/待核线索，标清是数据缺口而非自动判断。最近正式判断取最大正式version，不用草稿冒充；无正式版显示空态链接。

schema v6配置单例和研究事项表。配置保存revision比较交换，未知公司、跨公司指标锚点、非法模板、重复ID/分组公司、倒置/非法日期或超量payload拒绝，旧配置不变。修改只本地配置/事项，不修改财务/判断历史。前端窄命令仅typed config/IDs/expectedRevision，不接路径/SQL。旧v1–v5升级先留对应快照，冲突回滚；所有新实体进入基本备份，format仍1、schema兼容1–6。

## 验收

先跑配置空读/保存重启/显隐排序范围、revision冲突与无效数据拒绝、备份往返、v5成功/冲突回滚测试，预期未实现红灯；实现后回归。界面主路径：创建组→选公司→加模板→选指标→调整范围/显隐顺序→保存→重新载入/重启核对；事项及原生读取分别验证。缺数据不填0，不制造推荐、不能用测试/AX容器替代实际图形验收。

## 窄命令与保存时机

- `dashboard_load()`：只读返回revision和config，未有配置时revision0、空组和卡片，不自动种默认公司。
- `dashboard_save(config,expectedRevision)`：保存全看板配置，先验证归属/日期/量限，原子revision比较交换，过期拒绝、不覆盖。
- `dashboard_items(companyId)`：只读公司研究事项。
- `dashboard_put_item(companyId,input)`：显式新建/更新待读和待补；归属检查、revision比较交换；同资料只一条读状态，新标记归档资料须先恢复。

最多100组、500卡片；配置payload1MB，单组最多500公司，组/卡ID100字节、组名200字节、事项内容5000字节、真实合法日期。未提交配置导航有阻断提示，关闭前要保存，不声称强制退出保留；事项独立即时保存，移除卡片不删事项。重新载入会明确放弃配置修改并刷新公司/指标/事项状态，写入成功但刷新失败明确区分，不诱导重复添加。

## 当前验收结果

原生主路径已实看：读v1→卡片排序/隐藏保存v2→载入保持→新增组及移入公司→待核/显隐保存v3→标资料已读及添加待补→退出重启v3及事项保留。实际截图确认营收100/null/140与2024缺值断点，无跨点连线；最近正式v1/资料/待补显示正确。详见 `p07-verification-logs/ui-observation.md`。

自动回归：Rust45通过/0失败、2个GUI夹具默认ignored；显式P07夹具1/1，桌面27/27、Web24/24、严格Clippy和类型/lint通过，独立debug包构建成功。不把默认ignored算通过数。配置/研究事项备份与真实Tauri IPC均已验证。

限制：菜单指针项归属失败不算指标选择通过，分组使用当前菜单键盘选择成功；日期控件逐项录入、自定义指标原生切换、组内多公司排序、非空待核灰点与窄屏未逐项验收。核心验收完成而非无边界全覆盖。P05/P06历史缺口保留。

## Commit描述（自动生成，不提交）

```text
feat(desktop): add configurable local research dashboard

- persist dashboard groups, company order and card configuration in schema v6
- add metric, reading, supplement and latest official judgment cards
- retain metric references, time ranges and review-aware gap trends
- support explicit reading status and personal research follow-up items
- protect configuration and item updates with revision checks
- verify native IPC, v5 migration rollback and backup round trips
- validate card visibility, ordering, grouping and restart persistence
- document acceptance coverage without adding collection or AI
```

## 打开方式与停止点

双击项目内 `apps/desktop/src-tauri/target/debug/bundle/macos/价投小角落 P07验收.app`，进入指标看板可验虚构数据；正式开发用 `corepack pnpm dev:desktop`。仅浏览器预览不能读取SQLite，旧release/DMG不含P07。

本期首验macOS ARM64，仅独立debug验收应用。正式配置/权限不扩，不安装/提交/推送/发布，完成后生成commit描述并等待用户确认，不开始P08。
