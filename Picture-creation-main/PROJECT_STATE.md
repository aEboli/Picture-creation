# PROJECT_STATE

## 文档状态

- 文档状态：As-Built
- 最近更新时间：2026-03-30
- 最近更新触发器：`v0.8.0` 已完成 GitHub 发布，需要把远端发布状态、Release 地址和当前剩余待办同步回项目状态。
- 对应信息源：
  - `components/settings-form.tsx`
  - `components/create-job-form.tsx`
  - `components/job-details-client.tsx`
  - `app/ui-ux-pro-max.css`
  - `lib/gemini.ts`
  - `lib/create-agent-source-regressions.test.mjs`
  - `lib/job-details-client-safety.test.mjs`
  - `lib/gemini-copy-bundle-fallback.test.mjs`
  - `lib/ui-simplification-source-regressions.test.mjs`
  - `doc/进展记录.md`

## 当前目标

- 这轮已完成：
  - 将项目版本从 `v0.7.0` 提升到 `v0.8.0`
  - 同步 README、使用说明、PRD、版本说明与截图目录到当前真实产品口径
  - 明确本次发布边界包含品牌库独立入口、设置中心收口、创建页和详情页细节修正
  - 完成 GitHub 仓库 `main` 更新、`v0.8.0` 标签推送与 Release 创建

## 当前切片

- 当前最新完成的切片：
  - `v0.8.0` 版本号与发布资料同步
  - 设置页 Hero + L 型三卡设置台
  - 底部全局动作区与聚合状态反馈
  - 创建页离开不再弹出草稿中断确认
  - 任务详情 copy 摘要面板编号化
  - `reference-remix` 缺省标题文案清洗
  - 1023 / 720 两档响应式收口

## 范围边界

- 本轮已修改：
  - `.gitignore`
  - `app/ui-ux-pro-max.css`
  - `components/create-job-form.tsx`
  - `components/job-details-client.tsx`
  - `components/settings-form.tsx`
  - `README.md`
  - `Readme/PRD-Picture-creation.md`
  - `Readme/使用说明-Picture-creation.md`
  - `Readme/版本说明-v0.8.0.md`
  - `Readme/assets/picture-creation-v0.8.0/*`
  - `lib/create-agent-source-regressions.test.mjs`
  - `lib/gemini-copy-bundle-fallback.test.mjs`
  - `lib/gemini.ts`
  - `lib/job-details-client-safety.test.mjs`
  - `lib/ui-simplification-source-regressions.test.mjs`
  - `PRD.md`
  - `ARCHITECTURE.md`
  - `TECH_DECISIONS.md`
  - `PAGE_FRAME.md`
  - `PROJECT_STATE.md`
  - `doc/进展记录.md`
  - `package.json`
  - `package-lock.json`
  - `scripts/package-release.ps1`
- 本轮未修改：
  - 后端 API
  - 设置数据结构
  - 品牌库独立页与主导航结构
  - 任务详情数据查询链路
  - 创建页智能体会话分桶与草稿存储链路
  - 其它业务逻辑

## 本轮新增确认

- 已确认事项 1：设置页已从“松散卡片 + 大量留白”收口为紧凑控制台布局
- 已确认事项 2：桌面端结构固定为：
  - 第一排 `Gemini / Relay` 主卡 + `飞书同步` 侧卡
  - 第二排 `素材与任务` 侧卡位
- 已确认事项 3：顶部为居中的 Hero 区，仅保留标题与副标题
- 已确认事项 4：设置页不再提供卡内保存或单卡测试，统一改为底部动作区：
  - `全局连接测试`
  - `保存全部设置`
- 已确认事项 5：全局连接测试会顺序测试 `Gemini / 中转` 与 `飞书`，并聚合为一条状态反馈
- 已确认事项 6：`素材与任务` 卡仍然只有字段编辑，不引入额外测试 API
- 已确认事项 7：创建页离开当前页面时不再弹出“未完成草稿”确认提示
- 已确认事项 8：任务详情 copy 摘要面板主标题改为顺序编号，避免回落到产品名
- 已确认事项 9：`reference-remix` 在缺少分析结果时，缺省标题与海报标题统一回落为 `Reference remake`
- 已确认事项 10：响应式规则已补齐：
  - `<=1023px` 单列堆叠顺序为 `gemini -> feishu -> storage`
  - `<=720px` 飞书连接区与底部动作区都允许单列回落
- 已确认事项 11：对外交付文档已切到 `v0.8.0`，并同步品牌库独立入口、设置中心与模板中心退役口径
- 已确认事项 12：`.learnings/` 已排除出源码仓库发布范围，避免把本地诊断内容带上 GitHub
- 已确认事项 13：安全发布脚本已补齐：
  - 发布目录不再夹带 `.learnings/` 与内部主文档
  - `package-release.ps1` 已转为 UTF-8 BOM，避免 Windows PowerShell 下中文文件名乱码
- 已确认事项 14：GitHub 发布已完成：
  - 远端旧 `main` 已备份到 `backup/pre-v0.8.0-main-20260330-050757`
  - 发布页地址：`https://github.com/aEboli/Picture-creation/releases/tag/v0.8.0`

## 已完成

- [x] 设置页结构重排为紧凑控制台
- [x] 设置页桌面端 L 型网格与全局动作区定型
- [x] 全局连接测试与保存全部设置接入统一反馈区
- [x] 创建页离开拦截逻辑移除
- [x] 详情页 copy 摘要面板编号展示落地
- [x] `reference-remix` 缺省标题文案清洗
- [x] 相关源码回归补齐并通过
- [x] `v0.8.0` 版本资料与截图目录同步
- [x] `v0.8.0` 安全发布包与安装器本地生成成功
- [x] `v0.8.0` GitHub 仓库与 Release 发布完成
- [x] `npm run typecheck` 通过

## 待办

- [ ] 补浏览器级烟测或截图验收，确认真实视觉留白明显收敛
- [ ] 如需更精确的对外展示，可补拍一轮新的设置页 / 品牌库截图
- [ ] 评估创建页移除离开拦截后，是否还需要更轻量的草稿保护提示
- [ ] 如需让主分支日志也显式记录发版完成，可再补一条仅文档提交

## 风险和阻塞

- 风险：当前验证以源码回归和类型检查为主，尚未补浏览器级实机验收
- 风险：创建页去掉离开拦截后，用户误离开时仍可能依赖本地草稿恢复能力
- 风险：当前截图目录虽已切到 `v0.8.0`，但素材本身仍沿用上一轮拍摄批次
- 风险：当前 `v0.8.0` tag 对应的是发布提交；若后续再补“发版记录”文档提交，`main` 会自然领先于 tag 一次

## 验证结果

- 已跑验证：
  - `node lib/create-agent-source-regressions.test.mjs`
  - `node lib/job-details-client-safety.test.mjs`
  - `node lib/gemini-copy-bundle-fallback.test.mjs`
  - `node lib/ui-simplification-source-regressions.test.mjs`
  - `npm run typecheck`
  - `npm run build`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\package-release.ps1 -SkipBuild -SanitizeSecrets -CreateZip`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build-inno-installer.ps1 -SkipBuild -SanitizeSecrets`
- 当前结果：
  - 设置页结构、底部全局动作区和响应式规则都有源码级约束
  - 创建页离开不拦截、详情页编号展示、`reference-remix` 缺省文案都已有源码回归保护
  - TypeScript 类型检查通过
  - 已生成 `release/picture-creation-safe.zip`
  - 已生成 `release/PICTURE-CREATION-WINDOWS-0.8.0.exe`

## 下一步

- 推荐下一步：
  - 启动本地页面做一次浏览器级烟测
  - 视情况再补拍一轮新的展示截图
  - 如果要继续迭代，建议从 `v0.8.0` tag 再切新开发分支
