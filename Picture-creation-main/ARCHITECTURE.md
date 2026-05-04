# ARCHITECTURE

## 文档状态

- 文档状态：As-Built
- 最近更新时间：2026-03-30
- 最近更新触发器：准备发布 `v0.8.0`，需要将当前真实模块边界、退役入口和发布口径收敛为可交接的架构结论。
- 仍待确认项：
  - 创建页智能体后续是否拆出独立模型与限流配置。
  - 是否要补一轮新的页面截图来替换当前复用的旧拍摄批次资源。
- 对应信息源：
  - `app/`、`components/`、`lib/`、`lib/server/` 当前代码
  - `doc/进展记录.md`
  - `docs/API调用与调试说明.md`

## 基本信息

- 项目/功能名称：`Picture-creation`
- 日期：2026-03-28

## 项目边界

- 自用/公开：仓库公开，但运行方式是本地部署 / 局域网优先
- 是否涉及用户数据：是，包含本地图片资产、任务数据、品牌规则、API/Relay/飞书配置
- 是否涉及支付/权限/鉴权：不涉及支付；当前没有用户级鉴权与授权体系
- 本次范围：重建当前真实架构、模块边界、数据流与退役能力状态
- 明确不做：不在本轮引入账号体系、云端多租户、远程任务队列或模板中心回归

## 非功能需求

- 安全：API Key、飞书密钥、Relay 配置保存在本地设置与数据库，不写入前端常量
- 可用性：支持本地单机与局域网访问；关键页面保留清晰排障入口
- 性能：创建页即时校验，历史页通过服务端读模型与分页读取数据；生成流程异步执行
- 成本：复用 Gemini 文本/图像模型与可选 Relay，避免增加新的常驻服务
- 运维：依赖 `.runtime` 日志、Windows 批处理和 PowerShell 打包脚本完成本地交付与排障

## 候选 vs 已确认技术栈

| 层级 | 候选方案 | 已确认方案 | 原因/约束 |
| --- | --- | --- | --- |
| 前端 | 任意 React Web UI | `Next.js App Router + React + TypeScript` | 现有页面、API route、构建与打包都已围绕 Next 建立 |
| 服务端 | 独立 Node 服务 / Electron 主进程 | `Next.js Route Handlers + server-only service modules` | 便于共用同一仓库、同一构建产物与本地启动方式 |
| 数据层 | SQLite / 远程数据库 | `本地 SQLite + 文件系统资产目录` | 适合离线/局域网单机场景，迁移成本低 |
| 模型接入 | 直连 API / 兼容 Relay | `@google/genai + 完整 API URL/headers` | 兼容官方 Gemini 与本地/内网 Relay |
| 部署/工具链 | 纯源码运行 / 自定义安装器 | `Next build + PowerShell 打包脚本 + Windows 安装器` | 当前交付目标就是本地可安装、可分发 |

## 目录分层草案

```text
Picture-creation-main/
  app/                       # 页面与 API routes
  components/                # 表单、历史、详情、设置等 UI 组件
  lib/
    server/                  # server-only 服务，按领域拆分
    db.ts                    # SQLite schema、迁移与持久化
    gemini.ts                # 模型调用、Prompt 生成、错误归一、视觉质检
    templates.ts             # Prompt 模板与拼装逻辑
    prompt-quality-enhancements.ts
                             # 画质强化关键词选择与追加
  docs/                      # API/专题文档
  doc/                       # 长期进展记录
  Readme/                    # 对外交付文档
  scripts/                   # 打包、安装器、发布脚本
  data/                      # 本地运行数据
```

## 核心模块

| 模块 | 成熟度 | 职责 | 输入/输出 | 依赖 |
| --- | --- | --- | --- | --- |
| 页面读模型 `lib/server/workspace/*` | Confirmed | 为总览、历史、设置页集中提供请求期读模型与状态探测 | 输入：搜索参数、设置快照；输出：页面数据对象 | `lib/db.ts`、`lib/gemini.ts`、`lib/feishu.ts` |
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
| 图片资产处理 | 本地文件系统 + `sharp` | 任务执行、预览、导出 | 发布包必须带齐 `sharp` 运行时依赖 |
| 局域网访问 | 本机网络接口 | 总览页状态探测、局域网访问 | 绑定到 loopback 时会显示 `partial` 而不是完全可用 |

## 数据模型草案

| 实体/对象 | 关键字段 | 说明 |
| --- | --- | --- |
| `AppSettings` | `defaultApiKey`、`defaultTextModel`、`defaultImageModel`、`defaultApiBaseUrl`、`feishu*` | 模型、Relay、飞书与本地运行配置 |
| `JobRecord` | `creationMode`、`generationSemantics`、`strategyWorkflowMode`、`productName`、`brandName`、`promptInputs`、`status`、`feishuRecordId` | 一条完整任务，承接创建模式与任务级状态 |
| `JobItemRecord` | `promptText`、`status`、`reviewStatus`、`visualAudit`、`generationAttempt`、`providerDebug` | 任务内单图位的真实执行与审核结果 |
| `BrandRecord` | `name`、`primaryColor`、`tone`、`bannedTerms`、`promptGuidance` | 品牌规则，影响 Prompt 生成 |
| 资产文件 | `assetId`、实际文件路径、缩略图参数 | 图片原图/结果图不完全依赖数据库，实际文件存在本地资产目录 |

## 服务端逻辑草案

- 关键接口/动作：
  - `POST /api/generate`：创建任务并入队
  - `GET /api/jobs`、`GET /api/jobs/{id}`：历史与详情读取
  - `POST /api/jobs/{id}/retry`、`/feishu-sync`、`GET /approved-download`：任务运维与交付动作
  - `PATCH /api/job-items/{id}/review`：单图审核
  - `GET/PUT/POST /api/settings*`、`/api/brands*`：配置与品牌维护
  - `POST /api/agent-chat`：创建页智能体
- 鉴权与授权：当前没有用户级鉴权；所有安全边界默认建立在本地部署、局域网使用和配置不下发到前端源码上
- 错误处理：生成任务保留 `providerDebug`、`errorMessage`、`warningMessage`；接口层统一把领域错误翻译为可读 HTTP 错误
- 日志/监控：依赖 `.runtime/*.log` 与 `.runtime/*.err.log`、详情页 provider debug 以及本地数据库排障

## 模块边界变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
| --- | --- | --- | --- |
| 2026-03-17 | 项目统一重命名为 `Picture-creation`，构建与打包产物切换到新品牌 | 对外交付与仓库化交接 | README、Readme、脚本、默认数据目录 |
| 2026-03-22 | Prompt 模式和分辨率约束继续收口：`0.5K` 退役并统一归一到有效分辨率集合 | 降低历史脏数据和 provider 侧失败 | 创建表单、payload 校验、错误文案 |
| 2026-03-23 | Prompt 模式改为 `promptInputs[]` 驱动，不再以负面提示词为主路径 | 适配多重提示词与更清晰的生成语义 | 创建页、建模、任务展开、生成流程 |
| 2026-03-24 | 生成链路接入 `visualAudit` 与单图位自动重生骨架 | 为后续质量闭环打底 | `process-job`、`gemini.ts`、任务持久化 |
| 2026-03-28 | 前端继续收口到创建主路径：模板中心退役、策略 UI 不再外露、创建页新增本地智能体侧窗 | 减少分散入口，强化创建链路与辅助填写效率 | 导航、创建页、模板路由/API、调试文档 |

## 按现状落地结构

- 真实目录结构：
  - 页面与接口在 `app/`
  - 组件在 `components/`
  - 数据、生成、设置、品牌等服务拆在 `lib/server/*`
  - SQLite 与迁移集中在 `lib/db.ts`
- 真实模块关系：
  - `RootLayout` 先读取工作台级 summary/integration，再渲染全局头部
  - `CreateJobForm` 负责输入组织和提交，后端用 `payload.ts -> job-builder.ts -> process-job.ts` 串起执行
  - `JobDetailsClient` 负责刷新、重试、飞书同步、审核与导出
  - `CreateAgentPanel` 仅在 `/create` 挂载，通过浏览器事件把字段映射回表单
- 真实关键依赖：
  - `@google/genai`
  - `sharp`
  - SQLite
  - 飞书开放平台
- 与初版草案的偏差：
  - 外部文档仍保留模板中心与旧截图，但当前真实导航和接口已经把模板中心视为退役能力
  - 历史上存在过的前端策略工作台不再是当前主路径，创建页默认收敛到 `quick` 工作流

## 风险与待确认项

- 风险 1：外部 README/使用说明与当前代码已经出现口径漂移，容易让接手者误判哪些页面仍可用
- 风险 2：当前工作区包含大量未提交改动，文档描述的是“当前本地真实状态”，不等于已经形成新版本发布边界
