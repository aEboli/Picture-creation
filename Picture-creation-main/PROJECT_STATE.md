# PROJECT_STATE

## 文档状态

- 文档状态：Confirmed
- 最近更新时间：2026-03-29
- 最近更新触发器：继续执行“设置页重排、品牌库独立入口与头部中区收口”计划后，项目真实页面框架发生变化，需要回填状态文档。
- 仍待确认项：
  - 对外交付文档是否在下一轮统一同步到“品牌库独立页 + 模板中心退役 + 创建页智能体 + 当前截图”。
  - 当前未提交的大量功能改动是否会形成新的版本号和发布说明。
- 对应信息源：
  - `components/navigation.tsx`
  - `app/settings/page.tsx`
  - `app/brands/page.tsx`
  - `doc/进展记录.md`
  - 当前代码与路由

## 当前目标

- 这轮要完成什么：
  - 完成品牌库独立入口、设置页收口和头部中区整理
  - 把页面框架变化同步到状态文档和进展记录

## 当前切片

- 当前正在实现/验证的最小切片：
  - 一级导航新增 `品牌库`
  - 设置页只保留系统设置
  - 品牌库迁移到独立 `/brands`
  - 头部把“智能体 + 主导航”收口到中区一组

## 范围边界

- 本轮允许修改：
  - `components/navigation.tsx`
  - `app/settings/page.tsx`
  - `app/brands/page.tsx`
  - `app/ui-ux-pro-max.css`
  - 相关源码回归测试
  - `PAGE_FRAME.md`
  - `PROJECT_STATE.md`
  - `doc/进展记录.md`
- 本轮不允许修改：
  - 新增后端 API
  - 生成流程逻辑
  - 打包脚本、版本号与发布产物

## 文档待补债务

- [ ] `README.md` 仍未同步到“品牌库独立页 + 模板中心退役”后的最新导航结构
- [ ] `Readme/使用说明-Picture-creation.md` 仍未覆盖 `/brands` 独立页与设置页收口后的页面说明
- [ ] `Readme/PRD-Picture-creation.md` 仍以 `v0.7.0` 交付边界为主，尚未覆盖这轮页面框架变化
- [ ] 当前截图资产未反映 `/brands` 页和头部中区新布局

## 本轮新增确认

- 已确认事项 1：主导航当前为 `总览 / 创作台 / 历史记录 / 设置 / 品牌库`
- 已确认事项 2：`/settings` 当前只承载 `SettingsForm`，品牌库不再混入设置页
- 已确认事项 3：`/brands` 已成为独立一级页面，直接复用 `BrandLibraryManager`
- 已确认事项 4：品牌库页面继续复用现有 settings/brands 查询层，不新增后端 API
- 已确认事项 5：头部当前改为左侧统计、中区“智能体 + 主导航”、右侧系统状态与语言切换
- 已确认事项 6：`CreateAgentPanel` 仍然只在 `/create` 出现，非创建页不保留空占位
- 已确认事项 7：`/templates` 页面与模板 API 继续维持退役口径
- 已确认事项 8：创建主路径默认仍收口到 `strategyWorkflowMode = "quick"`

## 下一次回填节点

- 触发节点：
  - 下一次版本号或发布说明更新
  - README/Readme 截图与页面说明统一更新
  - 浏览器级烟测补齐后，需要把验证结论回填
  - 当前大工作区改动被切分成明确的提交或版本范围
- 预计要更新的文档：
  - `README.md`
  - `Readme/使用说明-Picture-creation.md`
  - `Readme/PRD-Picture-creation.md`
  - `Readme/版本说明-*.md`
  - `PAGE_FRAME.md`
  - `PROJECT_STATE.md`

## 已冻结决策

- 决策 1：当前产品继续坚持本地/LAN 优先，不引入账号鉴权体系
- 决策 2：模板中心保持退役状态，除非出现明确的新设计和新交付边界
- 决策 3：创建页智能体只负责“建议与字段映射”，不直接提交任务
- 决策 4：智能体设置与全局设置分离，单独走 `/api/agent-settings`
- 决策 5：品牌库从设置页拆出，作为独立一级入口维护

## 已完成

- [x] 主导航新增 `品牌库` 一级入口
- [x] 新增独立 `/brands` 页面并复用 `BrandLibraryManager`
- [x] 设置页移除品牌库，只保留 `SettingsForm`
- [x] 头部把“智能体 + 主导航”收口到中区一组
- [x] 为页面框架变化补齐源码回归测试
- [x] 跑通 `node --test lib/ui-simplification-source-regressions.test.mjs`
- [x] 跑通 `node --test lib/create-agent-source-regressions.test.mjs`
- [x] 跑通 `npm run typecheck`
- [x] 同步 `PAGE_FRAME.md`、`PROJECT_STATE.md` 与 `doc/进展记录.md`

## 待办

- [ ] 统一更新 `README.md` 与 `Readme/` 中仍然落后的导航、页面和截图说明
- [ ] 补一轮浏览器级烟测，确认 `/create`、`/settings`、`/brands` 视觉落地符合预期
- [ ] 对当前工作区的大量未提交功能改动做一次版本范围切分

## 风险和阻塞

- 风险：当前主文档已同步，但对外交付文档与截图仍旧漂移
- 风险：工作区本身较脏，规格复核容易把历史未提交改动混进本轮范围
- 阻塞：这轮完成的是源码回归和类型验证，还没有补浏览器级实机验收

## 验证结果

- 已跑验证：
  - `node --test lib/ui-simplification-source-regressions.test.mjs`
  - `node --test lib/create-agent-source-regressions.test.mjs`
  - `npm run typecheck`
- 当前结果：
  - 品牌库独立页、设置页收口和头部中区结构均已被源码回归覆盖
  - TypeScript 类型检查通过
  - 尚未执行浏览器级烟测

## 下一步

- 下一步动作：
  - 优先补浏览器级烟测，确认视觉落地
  - 然后决定是继续做“对外交付文档同步”，还是切一轮“版本与提交范围整理”
- 如果失败，回退点：
  - 以当前根目录主文档和源码回归测试作为项目事实来源，继续参考 `README.md` 与 `Readme/` 的旧交付口径处理外部说明
