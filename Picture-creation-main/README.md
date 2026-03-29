# Picture-creation

对应对象：`Picture-creation`

> 一个面向电商团队的本地化 AI 生图工作台，支持多模式创作、历史审核、品牌规则管理、飞书同步与 Windows 安装交付。

| 版本 | 默认文本模型 | 默认图片模型 | GitHub |
| --- | --- | --- | --- |
| `v0.8.0` | `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-image-preview` | [aEboli/Picture-creation](https://github.com/aEboli/Picture-creation) |

## 界面预览

| 总览页 | 创作台 | 历史记录 |
| --- | --- | --- |
| ![总览页](./Readme/assets/picture-creation-v0.8.0/01-overview.png) | ![创作台](./Readme/assets/picture-creation-v0.8.0/02-creation-workbench.png) | ![历史记录](./Readme/assets/picture-creation-v0.8.0/03-history.png) |

| 设置中心 | 标准模式 | 参考图复刻 |
| --- | --- | --- |
| ![设置页](./Readme/assets/picture-creation-v0.8.0/05-settings.png) | ![标准模式](./Readme/assets/picture-creation-v0.8.0/06-standard-mode.png) | ![参考图复刻](./Readme/assets/picture-creation-v0.8.0/10-reference-remix-a.png) |

## 核心能力

| 输入组织 | 生成能力 | 协作与交付 |
| --- | --- | --- |
| 多图联合、批量套模板、纯提示词、参考图复刻 | 标准模式、套图模式、亚马逊 A+ 图模式、提示词模式、参考图复刻 | 历史记录、审核导出、品牌库、飞书同步、Windows 安装器 |

| 工作台结构 | 设置与运维 | 数据兼容 |
| --- | --- | --- |
| 总览 / 创作台 / 历史记录 / 设置 / 品牌库 | 紧凑设置中心、全局连接测试、版本化安装器与安全发布包 | 兼容旧 `Commerce-Image-Studio` 数据目录与数据库文件 |

## v0.8.0 重点

- 品牌库现在是独立一级入口，主导航固定为 `总览 / 创作台 / 历史记录 / 设置 / 品牌库`。
- 设置页收口为紧凑控制中心，统一提供 `全局连接测试` 与 `保存全部设置`。
- 创建页头部把 `智能体入口 + 主导航` 收进中区，减少主流程分散感。
- 创建页离开不再打断式确认；任务详情 copy 摘要改成顺序编号；`reference-remix` 缺省标题回落为 `Reference remake`。
- README、使用说明、PRD、版本说明同步到当前真实产品口径，适合直接公开到 GitHub 仓库。

## 当前产品口径

- `/templates` 旧模板中心已退役，不再作为可见导航入口。
- 创建页智能体为轻量辅助入口，用于图片分析、提示词建议和表单字段回填。
- 设置页与品牌库已分离，避免把运行配置和品牌管理混在同一页里。

## 发布产物

| 类型 | 文件/目录 |
| --- | --- |
| Inno 安装器 | `PICTURE-CREATION-WINDOWS-0.8.0.exe` |
| 绿色发布目录 | `release/picture-creation` |
| 绿色发布压缩包 | `release/picture-creation.zip` |
| 安全发布压缩包 | `release/picture-creation-safe.zip` |
| 安装包目录 | `release/picture-creation-safe-installer` |

## 文档导航

- [使用说明-Picture-creation](./Readme/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E-Picture-creation.md)
- [PRD-Picture-creation](./Readme/PRD-Picture-creation.md)
- [版本说明-v0.8.0](./Readme/%E7%89%88%E6%9C%AC%E8%AF%B4%E6%98%8E-v0.8.0.md)
- [使用说明-多图联合生成语义](./Readme/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E-%E5%A4%9A%E5%9B%BE%E8%81%94%E5%90%88%E7%94%9F%E6%88%90%E8%AF%AD%E4%B9%89.md)
- [PRD-多图联合生成语义](./Readme/PRD-%E5%A4%9A%E5%9B%BE%E8%81%94%E5%90%88%E7%94%9F%E6%88%90%E8%AF%AD%E4%B9%89.md)
- [历史版本说明-v0.7.0](./Readme/%E7%89%88%E6%9C%AC%E8%AF%B4%E6%98%8E-v0.7.0.md)

## 本地开发

```bash
npm install
npm run typecheck
npm run build
npm run package:release:safe:zip
npm run package:installer:exe:safe
```

## 安全发布建议

- 公开分发优先使用 `npm run package:release:safe:zip` 与 `npm run package:installer:exe:safe`。
- `.env`、`release/`、`data/`、本地数据库和 `.learnings/` 都不应进入源码仓库。
- 旧环境变量 `COMMERCE_STUDIO_*` 仍兼容；新发布脚本优先写入 `PICTURE_CREATION_*`。

## 兼容说明

- 新默认数据目录：`%LOCALAPPDATA%\Picture-creation\data`
- 旧目录 `Commerce-Image-Studio` 与旧数据库名 `commerce-image-studio.sqlite` 仍可自动识别
- 旧环境变量 `COMMERCE_STUDIO_*` 仍兼容；新发布脚本优先写入 `PICTURE_CREATION_*`
