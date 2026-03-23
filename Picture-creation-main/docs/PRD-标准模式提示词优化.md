# PRD：标准模式提示词优化

## 1. 背景

当前工作目录 `C:\Users\AEboli\Documents\CODEX\Picture-creation` 是已经发布后的独立运行包，不是实际源码仓库。  
本次只能直接修改：

- 运行包内的 SQLite 默认模板数据
- `.next\server\chunks` 中的运行时种子逻辑与标准模式提示词拼装逻辑
- 运行包补充文档

因此，本 PRD 同时承担两个目的：

1. 指导本次对已发布包的可执行修复
2. 为后续拿到真实源码仓库后的回填提供明确目标

## 2. 目标

优化标准模式下 13 种商品图片类型的默认模板与共享提示词骨架，使其更贴近“先分析商品，再按图片类型输出结构化电商图像提示”的工作流。

本次目标包括：

- 更新 13 个默认图片类型模板的 `prompt_template` 与 `copy_template`
- 更新新库/缺库场景下的默认模板 seed 逻辑
- 强化标准模式共享分析层与全局约束
- 用英文内部链路吸收中文模板意图，不改变标准模式以外的产品定位
- 补充运行包侧实施记录，便于后续源码侧回填

## 3. 范围

### 3.1 本次纳入

- `main-image`
- `lifestyle`
- `scene`
- `white-background`
- `model`
- `poster`
- `detail`
- `pain-point`
- `feature-overview`
- `material-craft`
- `size-spec`
- `multi-scene`
- `culture-value`

### 3.2 本次不纳入

- 新增图片类型
- 改动默认模板的 scope：`country/language/platform/category`
- 改动默认模板 `layout_style=adaptive`
- 重构真实源码仓库
- 主动改动 `prompt` 模式与 `reference-remix` 模式的独立设计逻辑

## 4. 需求说明

### 4.1 默认模板层

13 个默认模板需要统一升级为更强的英文策略文本，要求：

- 保留默认模板身份与匹配范围不变
- `prompt_template` 必须体现：
  - 图片类型目标
  - Subject / Background / Lighting / Lens / Composition / Texture / Atmosphere / Output intent
  - 对原商品结构与电商真实感的约束
- `copy_template` 必须体现：
  - `Category analysis`
  - `Output structure`
  - `Copy direction`
  - `Layout note`

### 4.2 共享标准模式提示词层

共享分析层需要明确要求模型先提炼：

- Category analysis
- Generalized product name
- Core material
- Structural and exterior features
- Primary use scenario
- Target audience
- Core selling points
- Visual style keywords
- Lens language
- Platform expression

共享全局约束需要明确要求：

- 保持商品身份、比例、轮廓、材质、结构细节
- 强化材质质感、光线控制、构图清晰度、纹理可信度
- 默认输出目标为 photorealistic e-commerce product photography
- 最终图像必须覆盖 Subject / Background / Lighting / Lens / Composition / Texture / Atmosphere / Output intent

### 4.3 类型策略层

13 个图片类型都要用英文重写策略文本，吸收用户给出的中文模板意图，包括：

- 使用目标
- 典型视觉要求
- 电商表达重心
- 预期输出结构

## 5. 实施位置

### 5.1 已发布包内实际改动位置

- `data\commerce-image-studio.sqlite`
- `.next\server\chunks\_76459e17._.js`
- `.next\server\chunks\_7f26dafc._.js`
- `.next\server\chunks\_d51b514d._.js`
- `.next\server\chunks\ssr\lib_aba1aa81._.js`

### 5.2 未来源码侧回填目标

由于真实源码仓库当前不在此工作区，后续应在源码侧回填至少以下逻辑来源：

- 默认模板 seed 数据定义
- 标准模式 copy prompt builder
- 标准模式 image prompt builder
- 任何 SSR / client / bundle 产物的上游构建来源
- 如果存在模板中心初始化脚本，也需要同步更新

## 6. 验收标准

- 数据库内 13 个默认模板仍存在，scope 与 `layout_style` 保持不变
- 13 个默认模板的 `prompt_template` / `copy_template` 已更新为新语义
- 运行时所有相关 chunk 中旧的一行式默认模板文案不再作为 seed 文本存在
- 标准模式共享提示词已包含新的分析层与全局约束
- `prompt` 模式与 `reference-remix` 模式未被主动重写，只允许共享帮助信息产生的间接影响
- 有最小自动化验证证据，并记录不能做的验证项与原因

## 7. 风险与注意事项

- 当前修改对象是已发布 bundle，不能像源码仓库那样依赖类型系统或完整测试体系
- `.next` 产物是编译后代码，任何替换都必须覆盖重复 chunk，避免 seed 与运行逻辑不一致
- SQLite 默认模板如果只改数据库、不改 seed，新库仍会回退到旧模板
- 未来若拿到真实源码仓库，必须做源码级回填并重新构建发布包，不能长期依赖手改产物
