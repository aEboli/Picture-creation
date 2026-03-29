# 使用说明-Picture-creation

对应对象：`Picture-creation`

## 1. 版本与交付

| 项目 | 内容 |
| --- | --- |
| 当前版本 | `v0.8.0` |
| GitHub 仓库 | [aEboli/Picture-creation](https://github.com/aEboli/Picture-creation) |
| Inno 安装器 | `PICTURE-CREATION-WINDOWS-0.8.0.exe` |
| 绿色发布目录 | `release/picture-creation` |
| 默认文本模型 | `gemini-3.1-flash-lite-preview` |
| 默认图片模型 | `gemini-3.1-flash-image-preview` |

## 2. 适用场景

`Picture-creation` 适合电商运营、设计支持、商品团队和项目维护者，用来完成以下链路：

1. 上传商品原图或参考图。
2. 选择五种生图模式之一。
3. 配置比例、分辨率、图型、套图数量和平台参数。
4. 生成、审核、导出并按需同步到飞书。
5. 通过 Windows 安装器或绿色包在单机或局域网机器上交付。

## 3. 安装与启动

### 安装器方式

1. 运行 `PICTURE-CREATION-WINDOWS-0.8.0.exe`。
2. 安装完成后，桌面会生成 `Picture-creation.lnk`。
3. 首次打开后，浏览器默认访问 `http://127.0.0.1:3000`。

### 绿色包方式

1. 解压 `picture-creation.zip` 或进入 `release/picture-creation`。
2. 双击 `启动网站.bat`。
3. 如需安装到本机用户目录，运行 `安装到本机.bat`。

## 4. 首次配置

进入“设置”页后，按顺序完成：

1. 填写 Gemini 官方接口或兼容 relay 的 API 配置。
2. 点击 `全局连接测试`，先确认 `Gemini / 中转` 与 `飞书` 的聚合反馈结果。
3. 点击 `保存全部设置` 持久化整页配置。
4. 如需飞书同步，再继续调整 Bitable 与字段映射 JSON。

推荐默认模型：

- 文本：`gemini-3.1-flash-lite-preview`
- 图片：`gemini-3.1-flash-image-preview`

## 5. 五种创建模式

| 模式 | 适用目标 | 说明 |
| --- | --- | --- |
| 标准模式 | 常规商品素材生成 | 适合主图、白底图、场景图、模特图等常见需求 |
| 套图模式 | 一次生成成套素材 | 适合多图 listing、详情页套图和系列化输出 |
| 亚马逊 A+ 图模式 | 详情页图文版面 | 适合 Amazon A+ 模块化视觉 |
| 提示词模式 | 纯创意或文生图 | 支持不上传图片直接生成 |
| 参考图复刻 | 参考图约束较强的重构 | 支持原图 + 参考图联合控制结果 |

## 6. 多图联合与批量套模板

所有模式都支持两种生成语义：

| 生成方式 | 行为 | 适合场景 |
| --- | --- | --- |
| 多图联合 | 多张原图作为同一次请求的输入集合 | 多图融合、多人物组合、同一套视觉元素联合出图 |
| 批量套模板 | 多张原图拆成多次独立请求，复用同一套参数 | 批量处理同一批 SKU、同模板多商品出图 |

补充说明：

- `gemini-3.1-flash-image-preview` 的官方限制是单次请求总输入图最多 `14` 张。
- `提示词模式` 允许 `0` 张图片直接提交。
- `参考图复刻` 在多图联合下遵循“原图区 + 参考图区共享 14 张总上限”。
- 预览区中的 `X/X` 表示“当前查看第几张 / 总共几张”。

## 7. 当前工作台结构

- 主导航：`总览 / 创作台 / 历史记录 / 设置 / 品牌库`
- 创建页：头部中区聚合 `智能体入口 + 主导航`
- 设置页：紧凑控制中心，底部统一提供 `全局连接测试` 与 `保存全部设置`
- 品牌库：独立页面维护品牌规则，不再混在设置页
- 模板中心：旧 `/templates` 路由已退役，不再作为当前主入口

## 8. 数据与兼容

| 项目 | 默认位置 |
| --- | --- |
| 数据目录 | `%LOCALAPPDATA%\Picture-creation\data` |
| 资源目录 | `%LOCALAPPDATA%\Picture-creation\data\assets` |
| 默认数据库 | `%LOCALAPPDATA%\Picture-creation\data\picture-creation.sqlite` |

兼容策略：

- 如果本地已有 `Commerce-Image-Studio` 旧目录，程序会自动识别并继续使用。
- 如果当前项目根目录 `data/` 下已有历史数据库，也会优先复用。
- 旧环境变量 `COMMERCE_STUDIO_DATA_DIR / DB_PATH / STORAGE_DIR` 仍可用。

## 9. 打包与交付

常用命令：

```bash
npm run typecheck
npm run build
npm run package:release:safe:zip
npm run package:installer:safe
npm run package:installer:exe:safe
```

产物说明：

- `package:release:safe:zip`：生成脱敏绿色发布包与 ZIP。
- `package:installer:safe`：生成 `release/picture-creation-safe-installer` 目录与 ZIP。
- `package:installer:exe:safe`：生成 Inno 安装器 EXE，并复制为版本化文件名。

## 10. 交付验收清单

1. `npm run typecheck` 通过。
2. 与本次发布相关的源码回归测试通过。
3. 安装器成功生成，且文件名为 `PICTURE-CREATION-WINDOWS-0.8.0.exe`。
4. 新安装目录能够正常打开首页，不出现 `500`。
5. 五种模式至少各跑通一次创建流程。
6. 历史记录、设置中心、品牌库、飞书测试链路可正常打开。

## 11. 附图索引

| 页面 | 截图 |
| --- | --- |
| 总览页 | `Readme/assets/picture-creation-v0.8.0/01-overview.png` |
| 创作台 | `Readme/assets/picture-creation-v0.8.0/02-creation-workbench.png` |
| 历史记录 | `Readme/assets/picture-creation-v0.8.0/03-history.png` |
| 设置中心 | `Readme/assets/picture-creation-v0.8.0/05-settings.png` |
| 标准模式 | `Readme/assets/picture-creation-v0.8.0/06-standard-mode.png` |
| 参考图复刻 | `Readme/assets/picture-creation-v0.8.0/10-reference-remix-a.png` |
