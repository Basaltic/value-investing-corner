# P08 来源、凭据与手动任务合同

## 已批准范围

用户明确继续进入P08。来源登记/许可依据、系统凭据库、统一CollectionRun状态机、单次手动队列/共享配额/有限重试/幂等。默认不启用任何来源。P09落盘准入和撤销恢复、P10–P12实际适配器、P13调度未授权；不请求外部API，不取元数据，不把手工或跳过任务算成功采集。AI仍后置。每阶段完成生成commit描述，不提交/推送，停止等确认。

## 来源登记

本期可登记后续三个固定通道：SEC财务、SEC公告、GNews条件新闻；不添加任意HTTP/custom连接器。每条记录：条款/公开披露说明URL、具体许可依据摘录、用途说明/用途确认、自动访问等级blocked/metadata/full、用户开关、共享每日配额/最小间隔、修订号。保存登记是用户陈述，非应用或AI法律认证；robots不是许可证明。不填依据也可保存，但任务必须跳过。开关缺省关闭；凭据存在不等于许可有效。

## 任务与幂等

每个手动请求带company/source/request_key，三元组唯一；重复排队返回同一任务，不重复写业务结果。状态queued/running/succeeded/failed/skipped。手动执行时再次核对来源当前版本/开关/依据/用途/等级/凭据和注册适配器；无依据连元数据也不取，跳过记录具体原因。生产没有注册具体适配器，所以即使登记完整也跳过“适配器未接入”，绝不造成功。

同任务最多3次手动执行；终态失败/跳过允许重试回排队，已成功禁止重做；并发通过条件UPDATE领取一次，全库同时最多一个running任务。单次执行串行，按来源家族共享UTC日期配额与跨日最小间隔；SEC财务/公告取已登记通道的最低每日额度/最大间隔，GNews跨公司共享。当前配额单位为适配器调用次数，不是适配器内部逐HTTP请求计数；后续真实适配器须在此统一通道补齐逐请求限制。当前生产无适配器，因此只跳过、不消耗配额。限额不足跳过，不自动等待重试，不无限循环。无后台常驻、定时、自动重新排队或退出恢复（P13）。状态事件保留稳定sequence、UTC时间与尝试号，只追加。网络异常只记录脱敏错误分类，不保存API原错误体/URL密钥。新请求key可表示新的明确手动请求，不用于绕过失败重试或配额。

## 密钥

macOS用keyring apple-native系统Keychain。服务命名空间按运行应用identifier隔离，账户名仅固定来源ID。前端提供密码输入仅保存/清除，Rust不把key返回给页面；只返回configured布尔值。SQLite无密钥/末尾字符/密钥hash，日志不含密钥；不建立密钥备份。Keychain失败明确报错，不回退文件或环境变量；恢复备份后查询当前机器Keychain，不恢复旧key状态。非macOS明确不支持凭据写入，不用内存mock假存储。

## 存储和验收

schema v7新增source_registrations、collection_runs、collection_events、collection_quota；旧v1–v6升级前快照、冲突回滚，基本备份格式1/schema1–7包含登记、任务、事件及配额，不含Keychain。首批4项来源/队列/往返测试因未实现失败后通过；跨日间隔与错误分类/无效回执是后补测试，首次即通过，不伪称红灯。内部Probe不进入生产注册表，成功测试只验证统一状态/回执接口；64位hex只是格式验证，不是原文存在/许可真实或已归档的证明。

## 已运行结果与限制

- Rust全量55通过/0失败，3项默认ignored；独立macOS Keychain测试另显式1项通过且删除随机测试条目。Clippy严格检查通过。
- 桌面29、Web24、workspace3、共享估值8、元数据2项测试通过；check:local类型/lint通过。独立P08 debug构建成功，未签名公证或安装发布。
- 原生实看建虚构公司、默认三个来源关闭、保存无依据来源登记v1、凭据入口和任务区布局。选择公司/键盘/窗口Raise多次USER_CONTROL_ACTIVE，已停止GUI；任务创建/执行/历史/凭据公开IPC保存删除/重启保持未实看。详细记录 `p08-verification-logs/ui-observation.md`，不以MockRuntime或Keychain函数测试替代GUI/IPC链路。
- 依据URL仅HTTP(S)，拒绝账号/查询参数/片段；文本仅长度、空字符及部分疑似凭据模式筛查，不保证能识别所有误贴的密钥。来源表单手动保存，未保存离页不保证恢复；冲突后输入保留，需离页重新读取最新登记并核对，不自动覆盖。
- Keychain检查失败在领取任务前返回错误，任务仍排队；不伪造跳过/成功事件。适配器超时、结果持久化失败后running解除、退出/崩溃恢复均未实现或验收，P13后置；遗留running会阻塞其它领取，当前没有自动/人工恢复命令。
- P09第三方落盘/撤销恢复、P10–P12实际联网和P13调度未授权。生产execute始终无适配器；只有许可不足/用途不足/缺凭据/无适配器跳过路径，未取外部元数据。P05/P06历史缺口不变。

## Commit描述（自动生成，不提交）

```text
feat(desktop): add source registry and manual collection task channel

- add schema v7 source registrations, runs, immutable events and shared quotas
- persist revision-checked source evidence, purpose and disabled-by-default gates
- store GNews credentials in macOS Keychain without exposing or backing up secrets
- add manual enqueue, admission checks, idempotent execution and bounded retries
- share SEC channel quotas and preserve minimum intervals across UTC day changes
- add native-only source and task management with explicit skip reasons
- verify migration rollback, backup round trips and classified adapter outcomes
- document native UI verification gaps without enabling external adapters or AI
```
