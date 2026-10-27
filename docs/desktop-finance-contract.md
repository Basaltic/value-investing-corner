# P06 手工财务与指标观测合同

## 本阶段授权

用户明确“进入 P06”。只实现手工FinancialFact、内置原始映射/固定派生、自定义数值/文本Observation、日期范围及待核视图。不实现P07看板配置、联网采集、行情、估值采集或AI。P05关闭/恢复原生验收缺口保留，不因进入P06改写为通过。每阶段交付后停下待确认，自动生成commit描述，不提交/推送。

## 存储和版本

schema v5：`financial_versions`、`metric_definitions`、`observation_versions`、`derived_snapshots`。数据都归属于已有独立公司ID，只在原生SQLite；不与Web/Algolia互通。标签属于事实或观测版本payload。

财务事实包含：原始科目、可空数值、币种、单位、期间类型/起止、会计准则、报表范围、口径说明、是否核对、来源与标签。流量科目记录年度/季度/累计/自定义期间；资产、负债和权益是期末时点。

新建事实生成独立series_id；同科目/口径/期间的多个独立事实不会自动归并。计算遇到重复候选不任选、不求和，显示缺口。修订/核对只向同链追加新版本；最新版本待核不会回退到旧审核版本。修订保持科目/币种/单位/期间/口径，变更这些维度须新建事实，避免悄悄改变历史序列。

指标定义固定名称/数值或文本类型/单位/币种/口径，不可改删，变更定义创建新记录。观测带日期、可空数值或文本、审核、来源与标签；修订追加，保持定义与日期。旧事实、定义、观测和派生快照通过SQLite触发器禁止UPDATE/DELETE。未知公司、跨公司基版、过期修订和类型冲突明确失败，事务不部分写入。

## 原始映射与固定公式

原始内置项直接按科目引用当前已审核且完整口径的事实，UI不复制金额：营业收入、营业成本、净利润、归母净利润、经营现金流净额、资本开支、总资产、总负债、股东权益、归母权益。净利润与归母净利润、权益与归母权益分开。

公式版本 `p06-v1`：

- 自由现金流：CFO − 资本开支；资本开支为购建固定资产/无形资产等正支出，不用负数现金流行直接扣减。
- ROE：归母净利润 / 归母期末权益；不改平均权益、不年化。
- 毛利率：（营业收入 − 营业成本）/ 营业收入。
- 净利率：净利润 / 营业收入。
- 资产负债率：总负债 / 总资产。

兼容输入必须币种、金额单位、会计准则、报表范围、口径说明、期间结束一致；流量之间开始日/期间类型也一致。ROE特例使用同一期末的归母权益，流量仍保留原期间，不年化。没有自动换汇、换单位、准则映射、跨期插值或自定义公式DSL。

任一输入待核、缺值/缺口径、重复候选、零分母或非有限计算即不显示数值，给出缺口原因。财务输入与观测使用有限f64数值，绝对值不超过10^18；前端拒绝格式错误、溢出/下溢，不将空值或下溢静默当0。f64不是审计级任意精度记账，显示最多4位小数/比率2位百分比，原始金额和单位保持。

每次财务追加在同一事务生成有效派生快照，包含输入事实ID（每ID定位具体版本）、公式版本、期间口径与结果。新输入版本重算生成新快照，不修改旧快照；当前缺口不伪造结果。读取state在事务内一致读取，不写库。

## 趋势与展示

公司详情 → 手工财务与指标观测。财务录入、自定义定义、观测表单和读取区分开；错误保留输入。所有示例只在独立验收应用，正式用户库不注入数据。

数值按同科目/定义及口径选择，财务流量趋势另按开始/结束月日与跨年跨度隔离，避免季度/累计长度串线；非金额自定义币种可空，但单位或口径空则数值不进图。日期范围可留空。默认只已核对线，待核可显式切换灰色点且不连线；最新未核修订不回退旧审核值。显式缺值和同日重复候选使用null，ECharts connectNulls=false；财务图轴使用同口径已记录事实的期间并集，派生非ROE可从另一输入记录保留缺分子的期间断点。ROE仅期末权益无法推断对应利润期间，不生成假流量期间；没有任何同口径事实记录的日期不推测。文本只显示文本卡片，从数值指标选择中排除。趋势旁给出数值列表，原始事实显示期间/币种/单位/准则/范围/来源，历史视图显示全部版本与只读派生快照，输入引用可对应到原始事实科目/版本/单位/口径。快照没有独立创建时间，当前只读历史不是按产生时刻排序的时间线。

修订入口滚动到对应输入；保存成功但刷新失败明确区分，避免把已写入当写失败诱导重复提交。

本阶段筛选仅运行时视图，不是P07看板/卡片持久化配置。表单保存为手动提交，不声称像P05一样自动保存；未提交录入离开页面不保证保留。

## 窄命令

- `finance_state(companyId)`：原始版本、定义、观测、当前派生、历史快照。
- `finance_save_fact(companyId,input,baseId|null)`：新建或追加事实修订。
- `finance_define(companyId,input)`：固定自定义定义。
- `finance_observe(companyId,input,baseId|null)`：新建或追加观测修订。

前端不能传数据库路径或SQL。capabilities、CSP及正式identifier保持不变；无新Rust运行依赖。ECharts锁定5.6.0，仅桌面、按需加载，本地打包无CDN/联网。

## 迁移与备份

旧v1–v4升级先保存对应一致快照，已有快照不覆盖；事务失败回滚。v4冲突夹具验证旧判断与user_version4保留。基本备份格式仍1、schema兼容1–5，财务版本/定义/观测/派生历史全体往返测试；旧公司/资料/判断回归继续保留。无新增用户备份UI，不提前处理P09第三方恢复。

## 当前验收

首批原生6测试中5个首次因P06未实现失败，非法输入测试最初为错误兜底通过，后经真实成功输入与跨公司/类型断言补强；实现后通过。前端3空值/版本/趋势测试首次全失败，实现后通过；下溢补测先失败，修复后通过。完整测试/IPC/迁移/Clippy/类型/构建日志以进度记录为权威。

原生独立应用 `价投小角落 P06验收.app` 已构建、工作台native与公司页读取成功。最终重启包财务页AX回读100/缺值/140、毛利率40%、文本卡与数值卡正确，但未取得可见截图，图形实看与手动录入/修订/复选框验收仍未完成。名称输入被窗口未显示的当前控制入口拒绝。以显式ignored夹具通过相同Rust业务函数写入P06空隔离库，测试强制目录尾名、空公司列表，防误覆盖；不是前端录入验收，不向正式库写入。读图验收结果和仍有缺口以 `p06-verification-logs/ui-observation.md` 为准。

## 打开方式与停止点

正式开发：仓库根目录 `corepack pnpm dev:desktop`；仅浏览器预览 `corepack pnpm dev:desktop:web`，不读写SQLite。隔离应用：双击 `apps/desktop/src-tauri/target/debug/bundle/macos/价投小角落 P06验收.app`，进入虚构公司→手工财务与指标观测，数据独立。旧release/DMG不含P06；未安装、公证、发布或验证其它平台。P07未授权。

## Commit描述（只生成，不提交）

```text
feat(desktop): add manual financial facts and metric observations

- add schema v5 append-only financial and observation versions
- retain currency, units, periods, accounting scope and review status
- derive fixed metrics from compatible reviewed input versions
- preserve formula provenance and historical derived snapshots
- add manual entry, revision, review filters and gap-aware trends
- keep text observations separate from numeric chart series
- verify native IPC, migration rollback and backup round trips
- document P06 acceptance coverage and native UI limitations
```
