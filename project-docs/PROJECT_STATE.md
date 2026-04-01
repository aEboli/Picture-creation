# PROJECT_STATE

## 文档状态

- 文档状态：Confirmed
- 最近更新时间：2026-03-30
- 最近更新触发器：顶栏/首页状态切到运行时快照服务，设置页继续压缩布局，需要把当前工作区事实同步回主状态文档。
- 对应信息源：
  - `app/layout.tsx`
  - `app/page.tsx`
  - `app/api/runtime/header-snapshot/route.ts`
  - `components/navigation.tsx`
  - `components/home-page-status-chips.tsx`
  - `components/runtime-snapshot-provider.tsx`
  - `components/settings-form.tsx`
  - `components/job-details-client.tsx`
  - `lib/runtime.ts`
  - `lib/queue.ts`
  - `lib/server/runtime/header-snapshot-service.ts`
  - `lib/server/workspace/queries.ts`
  - `doc/进展记录.md`

## 当前目标

- 本轮目标：同步 2026-03-30 当前工作区状态，不切版本、不发布，只把文档回填到真实实现。
- 当前同步聚焦：
  - 顶栏与首页状态从“页面请求期直接探测”切到“服务端快照种子 + 客户端轮询刷新”。
  - Next runtime 启动与队列恢复改成异步调度，降低冷启动阻塞风险。
  - 设置页继续压缩为无 Hero 的紧凑三卡布局，底部统一承载状态与全局动作。
  - 任务详情在审核后追加一次集中刷新，减少局部状态和详情主体不一致。

## 当前切片

- 当前工作区已经落地的切片：
  - `RuntimeSnapshotProvider` 接管顶栏和首页状态消费。
  - `lib/server/runtime/*` 提供统一的头部快照服务与 TTL 刷新。
  - `/api/runtime/header-snapshot` 暴露前端轮询用的只读快照接口。
  - 设置页进一步收紧字段密度与桌面布局。
  - `instrumentation.ts` + `lib/runtime.ts` + `lib/queue.ts` 收口启动恢复时序。
  - `components/job-details-client.tsx` 修正 `visibilitychange` 监听目标，并在审核后复用集中刷新链路。

## 范围边界

- 当前工作区已发生的实现改动：
  - `app/layout.tsx`
  - `app/page.tsx`
  - `app/api/runtime/header-snapshot/route.ts`
  - `app/ui-ux-pro-max.css`
  - `components/home-page-status-chips.tsx`
  - `components/job-details-client.tsx`
  - `components/navigation.tsx`
  - `components/runtime-snapshot-provider.tsx`
  - `components/settings-form.tsx`
  - `instrumentation.ts`
  - `lib/queue.ts`
  - `lib/runtime.ts`
  - `lib/server/runtime/header-snapshot-service.ts`
  - `lib/server/runtime/header-snapshot-store.ts`
  - `lib/server/runtime/header-snapshot-types.ts`
  - `lib/server/workspace/queries.ts`
  - `lib/job-details-client-safety.test.mjs`
  - `lib/queue-startup-recovery.test.mjs`
  - `lib/runtime-header-snapshot-queries.test.mjs`
  - `lib/runtime-header-snapshot-route.test.mjs`
  - `lib/runtime-header-snapshot-service.test.mjs`
  - `lib/runtime-instrumentation-startup.test.mjs`
  - `lib/runtime-snapshot-consumer-source-regressions.test.mjs`
  - `lib/runtime-startup-scheduling.test.mjs`
  - `lib/ui-simplification-source-regressions.test.mjs`
- 本轮同步输出：
  - `project-docs/PROJECT_STATE.md`
  - `project-docs/PAGE_FRAME.md`
  - `project-docs/ARCHITECTURE.md`
  - `doc/进展记录.md`
- 本轮明确未纳入：
  - `README.md`、`Readme/` 下对外版本资料仍维持 `v0.8.0` 发布口径
  - 浏览器级烟测截图与新一轮对外素材补拍
  - 新版本号、发布脚本或 GitHub Release 操作

## 本轮新增确认

- 已确认事项 1：顶栏和首页状态不再由页面读模型直接触发 Gemini / 飞书健康检查；请求期只消费 `getRuntimeHeaderSnapshot()` 返回的 seed snapshot。
- 已确认事项 2：`RuntimeSnapshotProvider` 会在首屏接住服务端种子快照，并在页面可见时每 `30s` 请求 `/api/runtime/header-snapshot` 刷新；请求失败时只把状态标记为 `stale`，不会清空上一次成功结果。
- 已确认事项 3：`lib/server/workspace/queries.ts` 现在只负责页面读模型与统计读取；首页 integration 状态和历史头部 summary 已统一复用运行时快照服务。
- 已确认事项 4：`instrumentation.ts` 在 `NEXT_RUNTIME === "nodejs"` 时启动运行时初始化；`ensureRuntimeReady()` 与队列恢复都改成异步调度，避免把冷启动阻塞绑死在布局渲染路径上。
- 已确认事项 5：设置页已不再渲染 Hero。
- 已确认事项 6：设置页桌面端当前结构为：
  - 左上 `Gemini / 中转设置`
  - 左下 `素材与任务`
  - 右侧通高 `飞书多维表格同步`
- 已确认事项 7：设置页底部统一为两段式全局动作区：
  - 左侧紧凑反馈状态
  - 右侧 `全局连接测试` + `保存全部设置`
- 已确认事项 8：Gemini 卡片当前字段密度为 3 列网格，请求头 JSON 跨 3 列；飞书映射 textarea 和按钮区也已收紧高度。
- 已确认事项 9：任务详情页的 `visibilitychange` 监听目标已改为 `document`，审核操作后会主动复用 `refreshJobDetails()`，减少审核状态与详情主体脱节。
- 已确认事项 10：当前这批实现已有针对运行时快照、启动调度、设置页源码结构与详情刷新链路的自动化断言。

## 已完成

- [x] 梳理当前未提交工作区的真实实现范围
- [x] 识别并修正文档与代码的主要漂移点
- [x] 把运行时快照服务写回主状态文档
- [x] 把设置页当前真实布局写回主状态文档
- [x] 在进展记录中登记这轮同步与剩余风险

## 待办

- [ ] 跑一轮浏览器级烟测，确认顶栏快照刷新、首页状态条和设置页压缩布局的真实观感
- [ ] 决定这批运行时快照改动是否进入下一个正式版本，并据此再同步 `README.md` 与 `Readme/` 对外文档
- [ ] 如准备继续版本化交付，补拍新的设置页与首页状态区截图

## 风险和阻塞

- 风险：当前主文档已同步到本地工作区事实，但对外文档仍锚定 `v0.8.0`，两者现在是“已发布版本”和“当前在制工作区”两套口径。
- 风险：运行时快照链路目前已有码级与类型级验证，但还没有浏览器级实机烟测。
- 风险：当前工作区本身较脏，后续若要整理成发布切片，仍需要先切清这批运行时改动与其它在制改动的边界。

## 验证结果

- 本轮文档同步前已确认存在的相关自动化：
  - `lib/runtime-header-snapshot-service.test.mjs`
  - `lib/runtime-header-snapshot-route.test.mjs`
  - `lib/runtime-header-snapshot-queries.test.mjs`
  - `lib/runtime-instrumentation-startup.test.mjs`
  - `lib/runtime-startup-scheduling.test.mjs`
  - `lib/queue-startup-recovery.test.mjs`
  - `lib/runtime-snapshot-consumer-source-regressions.test.mjs`
  - `lib/ui-simplification-source-regressions.test.mjs`
  - `lib/job-details-client-safety.test.mjs`
- 本轮实际验证结果：
  - `node --test lib/runtime-header-snapshot-service.test.mjs lib/runtime-header-snapshot-route.test.mjs lib/runtime-header-snapshot-queries.test.mjs lib/runtime-instrumentation-startup.test.mjs lib/runtime-startup-scheduling.test.mjs lib/queue-startup-recovery.test.mjs lib/runtime-snapshot-consumer-source-regressions.test.mjs lib/ui-simplification-source-regressions.test.mjs lib/job-details-client-safety.test.mjs`
    - `29` 项断言通过，`0` 失败
  - `npm run typecheck`
    - 通过

## 下一步

- 推荐下一步：
  - 先跑运行时快照相关测试与 `npm run typecheck`
  - 若验证通过，再决定是否把这批改动收成一个独立提交点
  - 若计划继续对外交付，再统一同步 `README.md`、`Readme/` 与截图资产

