# P09 第三方负载与安全恢复合同

## 授权与边界

用户明确继续P09；P08 GUI历史缺口保留，不以继续授权改写验收。只实现Rust存储安全底座与备份三分支，不接P10–P12实际源、不做P13调度、AI或日常审批中心，不提交/推送。开工工作树干净，用户外部提交61d7f2d，不是Main代提交。

## 存储边界

第三方候选独立存储，不复用个人Material/判断/财务表。来源登记再次核对开关、等级、依据与用途；无许可不存元数据。仅元数据权限不保存正文，只有full且实际提供正文才标full；URL/hash不冒充全文。来源、URL、发布时间、首次入库时间、登记revision与内容hash保留，重复company/source/URL/hash幂等。正文不执行，不开放任意HTTP/路径/SQL给前端。

## 最小撤销与独立清单

撤销按来源+负载hash，只影响第三方；事件含来源/hash/原因/时间/许可状态，只追加。第三方记录保留restricted指针和缺证状态，正文移除；个人正文/批注/资料和历史值不回写。独立SQLite清单位于应用数据目录的同级固定位置，不随恢复目录切换，不从旧包覆盖；当前限制与快照事件取并集。只信本机保存的许可指纹，不信旧备份自己宣称的许可仍有效。

## 三分支

1. 包hash及结构通过：在staging核对当前独立清单与快照撤销事件并集，清理命中项，再整体切换其余内容；新备份也清理受限第三方，不包含其正文。
2. 清单丢失/损坏或新机：正常恢复个人草稿/判断版本/批注/笔记/自有附件；第三方没有本机确认的许可则隔离。不整包拒绝，不擅自覆盖损坏清单。
3. hash失败、未知格式/未来schema/数据库不兼容：切换前拒绝，当前数据不变。

## 实现与验收结果

- schema v8：third_party_payloads保存第三方metadata/可选BLOB；storage_mode保存原full/metadata_only，mode可降为restricted，保留hash/来源/company/id/first_seen_at/登记revision/许可指纹/事件指针。来源URL与发布时间在metadata中（撤销后metadata也移除），不回写个人资料/判断/财务。
- 准入同事务读当前来源登记且取得写锁；无依据拒绝，metadata丢弃输入正文后只hash实际metadata，full只有提供bytes才成立。三元URL/hash及模式去重；同一来源撤销hash跨公司阻止重新落盘。内部Rust库接口不是任意路径前端IPC，无新页面；实际适配器仍没有注册。
- 独立限制库为数据目录同级 `<数据目录名>.restrictions.sqlite3`，版本1，含本机确认许可指纹及只追加限制；先持久化撤销再清主库。读取发现缺失/损坏/未确认来源指纹时不回传正文；当前来源改变也掩码。清主库失败的模拟测试仍不可读、新备份不含正文。正常读取受限记录仍可取得最小hash/来源/id，原正文不能解除隔离恢复。
- 恢复合并旧包、当前主库事件、独立清单，不覆盖独立清单。缺失清单且有事件可重建限制库；损坏库不改写，仅隔离无法确认的第三方。确认必须同时匹配独立库、当前主库和staging登记指纹；恢复本身不自动重新授权。普通来源登记仍按备份恢复，不表示当前外部许可真实有效。
- 新备份snapshot用VACUUM/checkpoint移除已撤销BLOB页后才hash；唯一第三方marker不出现在新SQLite字节的测试通过。同hash个人附件保持，判断正式正文/草稿批注/修订原因/自写笔记全保留。旧源包字节未改测试通过；不承诺磁盘安全擦除、旧包/rollback/迁移快照清除或全部恶意SQLite分析。
- 首批4项因未实现失败后通过；后续清单缺失/损坏、旧许可回滚、事件合并与清单重建测试先失败后修复通过。当前专项14项全部通过；后补迁移/同机正常恢复/个人笔记守恒首次即通过，不说全测试红灯。
- 全量Rust69通过/0失败、3项默认ignored；严格Clippy通过，样式警告失败已修并保留日志。桌面29/Web24/workspace3/估值8/元数据2项通过；check:local类型/lint通过；独立P09 debug构建36.05MiB。macOS ARM64首验，未签名公证、release/DMG、安装或发布。
- 原生P09包工作台native正常已实际读取（最后保护修订前的构建）；最终包已重新构建，未再次GUI重启验证。P09无新增页面，三分支由真实临时库/备份自动试验，不冒称用户备份界面已完成。P05/P06/P08旧GUI缺口保留。

## 仍存在的边界

受限隔离是清理第三方BLOB/metadata并留缺证指针，不移动到可访问“隔离资料库”；未来重新获得许可也不静默复活。P04手工Material视为用户提供的资料，不反推其版权，不扫描其内容做来源分类。当前并发备份/恢复与持续写入、断电跨两个SQLite事务、存储文件被外部修改等没有全项故障验收；操作应在停止写入时进行。限制库不是登录/密码库，本机文件保护之外不提供防恶意篡改签名。没有自动到期清理或解除隔离页面；后续实际源应调用此库，不绕开准入。

## Commit描述（自动生成，不提交）

```text
feat(desktop): add third-party payload controls and safe restore filtering

- add schema v8 payload records and append-only takedown events
- gate metadata and full payload storage on current source registrations
- keep cumulative restrictions outside replaceable backup data directories
- preserve restricted pointers without rewriting personal research history
- filter revoked payloads from new snapshots and old backup restores
- restore personal content when the local restriction ledger is unavailable
- verify migration rollback, tombstone persistence and restore safety branches
- document acceptance scope without adding source adapters, scheduling or AI
```
