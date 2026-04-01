# ARCHITECTURE

## 文档状态

- 文档状态：Confirmed
- 最近更新时间：2026-03-30
- 最近更新触发器：顶栏/首页状态切到运行时快照服务，设置页继续收口，需要把当前工作区模块边界和数据流重新写清。
- 仍待确认项：
  - 这批运行时快照与设置页收口改动是否直接进入下一个正式版本。
  - 是否要为当前工作区补一轮新的浏览器截图与实机烟测。
- 对应信息源：
  - `app/`
  - `components/`
  - `lib/`
  - `lib/server/`
  - `doc/进展记录.md`
  - `docs/API调用与调试说明.md`

## 基本信息

- 项目/功能名称：`Picture-creation`
- 日期：2026-03-30

## 项目边界

- 自用/公开：仓库公开，但运行方式仍以本地部署 / 局域网优先为主
- 是否涉及用户数据：是，包含本地图片资产、任务数据、品牌规则、API/Relay/飞书配置
- 是否涉及支付/权限/鉴权：不涉及支付；当前没有用户级鉴权与授权体系
- 本次范围：同步当前工作区真实架构，重点回填运行时快照、启动恢复时序与设置页布局事实
- 明确不做：不在本轮引入账号体系、云端多租户、远程任务队列、模板中心回归或新的发布动作

## 非功能需求

- 安全：API Key、飞书密钥、Relay 配置保存在本地设置与数据库，不写入前端常量
- 可用性：支持本地单机与局域网访问；关键状态优先走快照与后台刷新，避免把外部连通性探测直接绑在页面首屏
- 性能：总览/顶栏状态使用服务端 seed snapshot + TTL 刷新；创建页即时校验，生成流程异步执行
- 成本：复用 Gemini 文本/图像模型与可选 Relay，避免增加新的常驻服务
- 运维：依赖 `.runtime` 日志、Next instrumentation、Windows 批处理和 PowerShell 打包脚本完成本地交付与排障

## 候选 vs 已确认技术栈

| 层级 | 候选方案 | 已确认方案 | 原因/约束 |
| --- | --- | --- | --- |
| 前端 | 任意 React Web UI | `Next.js App Router + React + TypeScript` | 现有页面、API route、构建与打包都已围绕 Next 建立 |
| 服务端 | 独立 Node 服务 / Electron 主进程 | `Next.js Route Handlers + server-only service modules` | 便于共用同一仓库、同一构建产物与本地启动方式 |
| 运行时状态 | 页面级即时探测 | `server-only runtime snapshot service + client provider polling` | 避免首屏反复打外部探测，同时保持状态可刷新 |
| 数据层 | SQLite / 远程数据库 | `本地 SQLite + 文件系统资产目录` | 适合离线/局域网单机场景，迁移成本低 |
| 模型接入 | 直连 API / 兼容 Relay | `@google/genai + 可配置 baseUrl/apiVersion/headers` | 兼容官方 Gemini 与本地/内网 Relay |
| 部署/工具链 | 纯源码运行 / 自定义安装器 | `Next build + instrumentation + PowerShell 打包脚本 + Windows 安装器` | 当前交付目标就是本地可安装、可分发 |

## 目录分层草案

```text
Picture-creation-main/
  app/                       # 页面与 API routes
  components/                # 表单、历史、详情、设置、运行时状态消费等 UI 组件
  lib/
    server/                  # server-only 服务，按领域拆分
      runtime/               # 头部快照服务与运行时状态读取
    db.ts                    # SQLite schema、迁移与持久化
    gemini.ts                # 模型调用、Prompt 生成、错误归一、视觉质检
    runtime.ts               # 运行时冷启动入口
    queue.ts                 # 队列与恢复逻辑
  docs/                      # API/专题文档
  doc/                       # 长期进展记录
  Readme/                    # 对外交付文档
  scripts/                   # 打包、安装器、发布脚本
  data/                      # 本地运行数据
```

## 核心模块

| 模块 | 成熟度 | 职责 | 输入/输出 | 依赖 |
| --- | --- | --- | --- | --- |
| 页面读模型 `lib/server/workspace/*` | Confirmed | 为总览、历史、设置页集中提供请求期读模型，并复用运行时快照摘要 | 输入：搜索参数、数据库快照、运行时快照；输出：页面数据对象 | `lib/db.ts`、`lib/server/runtime/*` |
| 运行时头部快照 `lib/server/runtime/*` | Confirmed | 维护顶栏/首页状态与历史摘要的 seed snapshot、TTL 刷新与后台探测 | 输入：设置快照、历史汇总、网络接口、外部健康检查；输出：`RuntimeHeaderSnapshot` | `lib/gemini.ts`、`lib/feishu.ts`、`lib/server/workspace/store.ts` |
| 运行时消费层 `components/runtime-snapshot-provider.tsx` | Confirmed | 在客户端承接服务端种子快照，并在可见态轮询刷新 | 输入：服务端 seed snapshot、`/api/runtime/header-snapshot` 响应；输出：React context | `app/layout.tsx`、`components/navigation.tsx`、`components/home-page-status-chips.tsx` |
| 创建表单 `components/create-job-form.tsx` | Confirmed | 收集模式、图片、提示词、商品信息并提交任务 | 输入：用户交互、草稿、设置；输出：`POST /api/generate` 表单数据 | `app/api/generate`、`lib/server/generation/payload.ts` |
| 任务创建/执行 `lib/server/generation/*` | Confirmed | 校验 payload、建任务、展开 item、调用模型、落库、同步飞书 | 输入：生成请求与文件；输出：任务、结果、错误状态 | `lib/job-builder.ts`、`lib/gemini.ts`、`lib/db.ts`、`lib/feishu.ts` |
| Prompt 与模型层 `lib/gemini.ts` / `lib/templates.ts` | Confirmed | 生成 Prompt、调用 Gemini、归一错误、执行视觉质检 | 输入：任务上下文、模板、图片资产；输出：模型文本/图片结果与诊断 | `@google/genai`、`prompt-quality-enhancements.ts` |
| 持久化层 `lib/db.ts` | Confirmed | 管理 schema、迁移、设置、任务、品牌、审核与飞书字段 | 输入：领域对象；输出：SQLite 记录与快照 | `node:sqlite`、文件系统 |
| 历史与详情 UI `app/history/page.tsx` / `components/job-table.tsx` / `components/job-details-client.tsx` | Confirmed | 展示筛选、分页、任务详情、审核、重试和导出 | 输入：查询参数、详情接口；输出：用户操作与排障视图 | `lib/server/workspace/queries.ts`、`/api/jobs/*` |
| 设置与品牌库 `components/settings-form.tsx` / `components/brand-library-manager.tsx` | Confirmed | 分别管理运行配置与品牌规则；品牌库已是独立入口 | 输入：本地设置、品牌数据；输出：保存、测试、增删改 | `/api/settings*`、`/api/brands*` |
| 创建页智能体 `components/create-agent-panel.tsx` / `app/api/agent-chat/route.ts` | Draft | 提供图片分析与提示词建议，并映射回创建表单字段 | 输入：`agentType`、文本、可选图片、临时会话；输出：`assistantText + fieldMapping` | `lib/server/agent-chat/service.ts`、`@google/genai` |
| 退役模板表面 `app/templates/page.tsx` / `app/api/templates/*` | As-Built | 对旧模板页与模板 API 返回统一退役结果 | 输入：旧页面或旧接口访问；输出：404 / 410 retired 响应 | `lib/server/templates/service.ts` |

## 关键集成点

| 集成点 | 对接对象 | 触发方向 | 风险/约束 |
| --- | --- | --- | --- |
| Gemini / Relay | `@google/genai` + 自定义 baseUrl/headers | 本地服务端 -> 模型服务 | 依赖用户在设置页正确配置 API Key、文本模型与中转参数 |
| 飞书同步 | 飞书开放平台 / Bitable | 任务执行后或详情页手动触发 | 配置缺失、字段映射错误或网络问题会导致同步失败 |
| 运行时状态刷新 | `/api/runtime/header-snapshot` | 浏览器可见态 -> 本地服务端 | 当前采用 `30s` 轮询；失败时回落为 `stale`，不覆盖上一次成功值 |
| 图片资产处理 | 本地文件系统 + `sharp` | 任务执行、预览、导出 | 发布包必须带齐 `sharp` 运行时依赖 |
| 局域网访问 | 本机网络接口 | 运行时快照服务 -> 顶栏/首页状态 | 绑定到 loopback 时会显示 `partial` 而不是完全可用 |

## 数据模型草案

| 实体/对象 | 关键字段 | 说明 |
| --- | --- | --- |
| `AppSettings` | `defaultApiKey`、`defaultTextModel`、`defaultImageModel`、`defaultApiBaseUrl`、`feishu*` | 模型、Relay、飞书与本地运行配置 |
| `JobRecord` | `creationMode`、`generationSemantics`、`strategyWorkflowMode`、`productName`、`brandName`、`promptInputs`、`status`、`feishuRecordId` | 一条完整任务，承接创建模式与任务级状态 |
| `JobItemRecord` | `promptText`、`status`、`reviewStatus`、`visualAudit`、`generationAttempt`、`providerDebug` | 任务内单图位的真实执行与审核结果 |
| `BrandRecord` | `name`、`primaryColor`、`tone`、`bannedTerms`、`promptGuidance` | 品牌规则，影响 Prompt 生成 |
| `RuntimeHeaderSnapshot` | `integrations`、`summary`、`refreshedAt`、`stale` | 顶栏/首页状态的统一快照对象，服务端可缓存、客户端可轮询刷新 |
| 资产文件 | `assetId`、实际文件路径、缩略图参数 | 图片原图/结果图不完全依赖数据库，实际文件存在本地资产目录 |

## 服务端逻辑草案

- 关键接口/动作：
  - `POST /api/generate`：创建任务并入队
  - `GET /api/jobs`、`GET /api/jobs/{id}`：历史与详情读取
  - `POST /api/jobs/{id}/retry`、`/feishu-sync`、`GET /approved-download`：任务运维与交付动作
  - `PATCH /api/job-items/{id}/review`：单图审核
  - `GET/PUT/POST /api/settings*`、`/api/brands*`：配置与品牌维护
  - `POST /api/agent-chat`：创建页智能体
  - `GET /api/runtime/header-snapshot`：返回当前头部状态快照
- 运行时启动：
  - `instrumentation.ts` 在 Node.js runtime 中调用 `ensureRuntimeReady()`
  - `ensureRuntimeReady()` 通过异步调度触发 `ensureQueueReady()`
  - 队列恢复通过 `recoverQueueJobIds()` 回填 pending 队列
- 鉴权与授权：当前没有用户级鉴权；所有安全边界默认建立在本地部署、局域网使用和配置不下发到前端源码上
- 错误处理：运行时快照刷新失败时保留上一次成功快照并标记 `stale`；生成任务保留 `providerDebug`、`errorMessage`、`warningMessage`
- 日志/监控：依赖 `.runtime/*.log` 与 `.runtime/*.err.log`、详情页 provider debug 以及本地数据库排障

## 模块边界变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
| --- | --- | --- | --- |
| 2026-03-17 | 项目统一重命名为 `Picture-creation`，构建与打包产物切换到新品牌 | 对外交付与仓库化交接 | README、Readme、脚本、默认数据目录 |
| 2026-03-28 | 前端继续收口到创建主路径：模板中心退役、策略 UI 不再外露、创建页新增本地智能体侧窗 | 减少分散入口，强化创建链路与辅助填写效率 | 导航、创建页、模板路由/API、调试文档 |
| 2026-03-30 | 顶栏/首页状态改为统一运行时快照服务，页面不再直接做即时外部探测 | 降低首屏抖动，统一状态来源 | `app/layout.tsx`、`components/navigation.tsx`、`components/home-page-status-chips.tsx`、`lib/server/runtime/*`、`lib/server/workspace/queries.ts` |
| 2026-03-30 | 设置页移除 Hero，桌面端改为“Gemini 左上 + 素材左下 + 飞书右侧通栏” | 继续压缩首屏高度与信息留白 | `components/settings-form.tsx`、`app/ui-ux-pro-max.css` |

## 按现状落地结构

- 真实目录结构：
  - 页面与接口在 `app/`
  - 组件在 `components/`
  - 运行时状态服务在 `lib/server/runtime/`
  - 数据、生成、设置、品牌等服务拆在 `lib/server/*`
  - SQLite 与迁移集中在 `lib/db.ts`
- 真实模块关系：
  - `RootLayout` 读取 `getRuntimeHeaderSnapshot()` 作为 seed snapshot，并包裹 `RuntimeSnapshotProvider`
  - `Navigation` 与 `HomePageStatusChips` 只消费 provider context，不自己探测外部状态
  - `CreateJobForm` 负责输入组织和提交，后端用 `payload.ts -> job-builder.ts -> process-job.ts` 串起执行
  - `JobDetailsClient` 负责刷新、重试、飞书同步、审核与导出
  - `CreateAgentPanel` 仅在 `/create` 挂载，通过浏览器事件把字段映射回表单
- 真实关键依赖：
  - `@google/genai`
  - `sharp`
  - SQLite
  - 飞书开放平台
- 与上一版发布口径的偏差：
  - `README.md` 与 `Readme/` 仍描述 `v0.8.0` 已发布状态；本文件描述的是本地工作区最新架构事实
  - 顶栏状态链路已不再走页面级即时探测
  - 设置页当前不再存在独立 Hero 区

## 风险与待确认项

- 风险 1：当前主文档已经同步到本地工作区，但对外文档仍保持 `v0.8.0` 发布口径，交接时需要明确两者的适用范围。
- 风险 2：运行时快照链路与设置页压缩布局目前只有代码级/类型级验证，还缺少浏览器级烟测证据。
- 风险 3：当前工作区包含多处未提交改动，文档描述的是“当前本地真实状态”，不等于已经形成新的版本边界。
