# Picture-creation API 调用与调试说明

本文档按当前代码与路由实际行为整理，适用于本项目本地启动、接口调用与排障。

## 1. 基础信息

### 1.1 本地启动方式

- 正式版启动：`启动正式版.bat`
- 开发版启动：`npm run dev`

常见本地地址：

- 正式版默认：`http://127.0.0.1:3888`
- 开发版默认：`http://127.0.0.1:3000`

如果你不确定当前端口，可以看：

- `C:\Users\AEboli\Documents\CODEX\Picture-creation-main\.runtime\`

### 1.2 接口风格

本项目接口分两类：

- `multipart/form-data`
  主要用于 `POST /api/generate`、`POST /api/agent-chat`
- `application/json`
  主要用于设置、品牌库、审核状态、任务查询

### 1.3 一个重要的 Windows 注意点

当前这台机器的 PowerShell `Invoke-RestMethod` 不支持 `-Form`。  
调用 `POST /api/generate` 时，优先使用：

- `curl.exe`
- 或 Node.js 原生 `fetch + FormData`

不要默认用：

- `Invoke-RestMethod -Form`

---

## 2. 核心接口总览

### 2.1 生成任务

#### `POST /api/generate`

用途：

- 创建并入队一个生成任务

请求类型：

- `multipart/form-data`

字段：

- `payload`
  一个 JSON 字符串
- `files`
  原图文件，可多张，具体数量受模式限制
- `referenceFiles`
  参考图文件，仅 `reference-remix` 用

成功返回：

```json
{
  "jobId": "job_xxx"
}
```

失败返回：

```json
{
  "error": "错误信息"
}
```

常见错误：

- `Missing payload.`
- `Invalid payload.`
- `Please complete the required fields.`
- `0.5K 分辨率已下线，请改用 1K、2K 或 4K。`
- `Suite mode only supports 1 source image.`
- `Amazon A+ mode only supports 1 source image.`
- `Reference remix mode requires exactly 1 source image.`
- `Reference remix mode requires exactly 1 reference image.`
- `Prompt mode requires at least one text prompt input.`
- `This batch is too large. Keep it under 96 generated variants per job.`

---

### 2.2 任务列表与详情

#### `GET /api/jobs`

用途：

- 查询任务列表

支持查询参数：

- `search`
- `status`
- `platform`
- `country`
- `marketLanguage`
- `resolution`
- `dateFrom`
- `dateTo`
- `page`

示例：

```powershell
curl.exe "http://127.0.0.1:3888/api/jobs?platform=amazon&country=US&page=1"
```

#### `GET /api/jobs/{id}`

用途：

- 查询单个任务详情

说明：

- 当前返回的是前端安全裁剪版详情
- `standard / suite / amazon-a-plus` 已隐藏未实际发送的中间内容
- 详情里最重要的排障字段通常是：
  - `job.status`
  - `job.errorMessage`
  - `items[].status`
  - `items[].errorMessage`
  - `items[].promptText`
  - `items[].providerDebug`
  - `items[].warningMessage`

示例：

```powershell
curl.exe "http://127.0.0.1:3888/api/jobs/job_xxx"
```

---

### 2.3 任务重试与飞书同步

#### `POST /api/jobs/{id}/retry`

用途：

- 基于现有任务重建并重新入队

成功返回：

```json
{
  "jobId": "new_job_id"
}
```

#### `POST /api/jobs/{id}/feishu-sync`

用途：

- 手动重建飞书同步

成功返回通常包含同步统计信息。

#### `GET /api/jobs/{id}/approved-download`

用途：

- 下载已通过图片的打包文件

#### `GET /api/jobs/{id}/all-images-download`

用途：

- 下载当前任务里所有成功生成图片的 ZIP 包

说明：

- 只要 `generatedAsset` 存在，就会进入 ZIP
- 不要求这些图片已经被审核为 `approved`
- ZIP 包名优先使用原图名称：
  - 单原图任务：原图名称
  - 多原图任务：第一张原图名称
- ZIP 包内单图文件名格式：
  - `原图名称 + 类型名称 + 分辨率 + 比例`

---

### 2.4 资产访问

#### `GET /api/assets/{assetId}`

用途：

- 获取原图、生成图、缩略图

支持查询参数：

- `w`
  目标宽度，范围 `64-2048`
- `q`
  图片质量，范围 `50-90`
- `download=1`
  强制下载原文件
- `filename`
  可选，自定义下载文件名，仅在 `download=1` 时生效

示例：

```powershell
curl.exe "http://127.0.0.1:3888/api/assets/asset_xxx?w=320&q=72"
curl.exe "http://127.0.0.1:3888/api/assets/asset_xxx?download=1" -o output.jpg
curl.exe "http://127.0.0.1:3888/api/assets/asset_xxx?download=1&filename=my-image-name.png" -o output.jpg
```

---

### 2.5 设置接口

#### `GET /api/settings`

用途：

- 读取当前设置

#### `PUT /api/settings`

用途：

- 更新当前设置

请求类型：

- `application/json`

常用字段：

- `defaultApiKey`
- `defaultTextModel`
- `defaultImageModel`
- `defaultApiBaseUrl`
- `defaultApiVersion`
- `defaultApiHeaders`
- `storageDir`
- `maxConcurrency`
- `defaultUiLanguage`
- `feishuSyncEnabled`
- `feishuAppId`
- `feishuAppSecret`
- `feishuBitableAppToken`
- `feishuBitableTableId`
- `feishuUploadParentType`
- `feishuFieldMappingJson`

#### `POST /api/settings/test`

用途：

- 测试 Gemini / relay 文本链路

#### `POST /api/settings/test-feishu`

用途：

- 测试飞书连接

#### `POST /api/settings/test-multimodal`

用途：

- 测试多模态诊断链路

---

### 2.6 品牌库与审核

#### `GET /api/brands`

返回：

```json
{
  "brands": [...]
}
```

#### `POST /api/brands`

用途：

- 新建品牌规则

#### `PUT /api/brands/{id}`

用途：

- 更新品牌规则

#### `DELETE /api/brands/{id}`

用途：

- 删除品牌规则

#### `PATCH /api/job-items/{id}/review`

用途：

- 修改单张图审核状态

请求体：

```json
{
  "reviewStatus": "unreviewed"
}
```

可用值：

- `unreviewed`
- `shortlisted`
- `approved`
- `rejected`

---

### 2.7 创建页智能体

#### `POST /api/agent-chat`

用途：

- 为创建页右上角智能体侧窗提供图片分析与提示词建议
- 返回可映射回创建表单的字段

请求类型：

- `multipart/form-data`

字段：

- `agentType`
  必填，当前只支持：
  - `image-analyst`
  - `prompt-engineer`
- `userText`
  必填，用户输入文本
- `image`
  可选，单张图片
- `conversationHistory`
  可选，JSON 数组，格式示例：

```json
[
  { "role": "user", "text": "先分析一下这个主体" },
  { "role": "assistant", "text": "主体像是一款..." }
]
```

成功返回：

```json
{
  "assistantText": "这是一款主打轻量便携的户外水壶……",
  "promptSuggestions": [
    "premium outdoor bottle hero shot on a clean hiking backdrop",
    "close-up product detail prompt with stainless steel texture emphasis"
  ],
  "fieldMapping": {
    "productName": "便携户外水壶",
    "sellingPoints": "轻量、便携、适合徒步露营",
    "materialInfo": "金属杯身",
    "sizeInfo": "约 500ml",
    "brandName": ""
  }
}
```

常见错误：

- `agentType must be one of: image-analyst, prompt-engineer.`
- `userText is required.`
- `conversation history must be valid JSON.`
- `conversation history must be a JSON array.`
- `Gemini API key and text model must be configured in Settings.`
- `Provider returned invalid JSON.`

补充说明：

- 当前创建页侧窗的对话只存在本地当前页面，不落数据库
- `prompt-engineer` 会优先返回结构化的 `promptSuggestions`
- 当前只支持映射以下字段回创建表单：
  - `productName`
  - `sellingPoints`
  - `materialInfo`
  - `sizeInfo`
  - `brandName`
- 如果提示词工程师返回了有效 `promptSuggestions`，点击“映射到表单”后会：
  - 自动切到提示词模式
  - 按当前创建页已计算出的“实际生成数量”铺出对应条数的 `promptInputs`
  - 返回条数不够时补空位，超过时截断

#### `GET /api/agent-settings`

用途：

- 读取创建页智能体小窗的安全设置切片

返回内容：

- 当前只包含两个内置智能体：
  - `image-analyst`
  - `prompt-engineer`
- 每个智能体包含：
  - `name`
  - `description`
  - `systemPrompt`
  - `openingPrompt`

说明：

- 该接口不会返回 API Key、Relay、飞书等其它系统设置
- 用途是给创建页智能体小窗安全地读取智能体配置

#### `PUT /api/agent-settings`

用途：

- 更新一个或多个内置智能体的设置

请求类型：

- `application/json`

请求体示例：

```json
{
  "prompt-engineer": {
    "name": "海报提示词顾问",
    "description": "只输出海报风格提示词",
    "systemPrompt": "You are a poster-only assistant.",
    "openingPrompt": "例如：帮我写一条海报图提示词。"
  }
}
```

常见错误：

- `Agent settings payload must be an object.`
- `Unknown agent id: xxx`
- `Agent settings for xxx must contain string fields only.`

---

### 2.8 已退役接口

以下接口当前已停用，会返回 `410`：

- `POST /api/strategy-preview`
- `POST /api/jobs/{id}/strategy-rerun`
- `GET/POST /api/templates`
- `GET/PUT/DELETE /api/templates/{id}`
- `POST /api/templates/match`

这类接口的典型返回：

```json
{
  "error": "Strategy workbench has been retired."
}
```

或：

```json
{
  "error": "Template center has been retired."
}
```

---

## 3. `POST /api/generate` 的调用方法

### 3.1 推荐方式一：Node.js `fetch + FormData`

这是当前最稳的方式。

```javascript
const fs = require("fs");

(async () => {
  const payload = {
    creationMode: "amazon-a-plus",
    generationSemantics: "joint",
    strategyWorkflowMode: "quick",
    productName: "Fishing lure",
    sku: "",
    brandName: "",
    category: "outdoor",
    sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
    restrictions: "No fake text overlay",
    sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
    materialInfo: "ABS hard bait body with metal hooks and hardware",
    sizeInfo: "10 cm lure body",
    customPrompt: "",
    promptInputs: [],
    customNegativePrompt: "",
    translatePromptToOutputLanguage: false,
    autoOptimizePrompt: false,
    country: "US",
    language: "en-US",
    platform: "amazon",
    selectedTypes: ["poster", "feature-overview", "multi-scene", "detail"],
    selectedRatios: ["4:5"],
    selectedResolutions: ["1K"],
    variantsPerType: 1,
    includeCopyLayout: false,
    uiLanguage: "zh",
    selectedTemplateOverrides: {},
    temporaryProvider: {}
  };

  const filePath = "C:/path/to/source.jpg";
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  form.append(
    "files",
    new Blob([fs.readFileSync(filePath)], { type: "image/jpeg" }),
    "source.jpg"
  );

  const res = await fetch("http://127.0.0.1:3888/api/generate", {
    method: "POST",
    body: form
  });

  console.log(res.status);
  console.log(await res.text());
})();
```

---

### 3.2 推荐方式二：`curl.exe`

Windows 下请显式用 `curl.exe`，不要混到 PowerShell 的 `curl` 别名。

```powershell
$json = '{"creationMode":"prompt","generationSemantics":"joint","strategyWorkflowMode":"quick","productName":"","sku":"","brandName":"","category":"general","sellingPoints":"","restrictions":"","sourceDescription":"","materialInfo":"","sizeInfo":"","customPrompt":"","promptInputs":["premium product hero shot"],"customNegativePrompt":"","translatePromptToOutputLanguage":false,"autoOptimizePrompt":false,"country":"US","language":"en-US","platform":"amazon","selectedTypes":["scene"],"selectedRatios":["1:1"],"selectedResolutions":["1K"],"variantsPerType":1,"includeCopyLayout":false,"uiLanguage":"zh","selectedTemplateOverrides":{},"temporaryProvider":{}}'

curl.exe -X POST "http://127.0.0.1:3888/api/generate" `
  --form-string "payload=$json"
```

如果要传文件：

```powershell
curl.exe -X POST "http://127.0.0.1:3888/api/generate" `
  --form-string "payload=$json" `
  -F "files=@C:\path\to\source.jpg;type=image/jpeg"
```

---

## 4. 各模式最小 payload 提示

### 4.1 `standard`

必须关注：

- `productName`
- `selectedRatios`
- `selectedResolutions`
- 至少 1 张 `files`

### 4.2 `suite`

必须关注：

- 只允许 `1` 张原图
- 必填：
  - `category`
  - `sellingPoints`
  - `materialInfo`
  - `sizeInfo`

### 4.3 `amazon-a-plus`

必须关注：

- 只允许 `1` 张原图
- 平台会被归一到 `amazon`

### 4.4 `prompt`

必须关注：

- `promptInputs` 至少 1 条
- `variantsPerType` 会强制归一为 `1`
- 模式内部默认 `selectedTypes = ["scene"]`

### 4.5 `reference-remix`

必须关注：

- 必须 `1` 张原图
- 必须 `1` 张参考图
- `country / language / platform` 会被归一为空

---

## 5. 调试方法

### 5.1 先看任务详情，而不是只看前端提示

最重要的排障动作：

```powershell
curl.exe "http://127.0.0.1:3888/api/jobs/job_xxx"
```

重点字段：

- `job.status`
- `job.errorMessage`
- `items[].status`
- `items[].errorMessage`
- `items[].promptText`
- `items[].providerDebug.failureStage`
- `items[].providerDebug.failureReason`
- `items[].warningMessage`

常见阶段：

- `provider-request`
  请求 relay / provider 时失败
- `provider-image-download`
  relay 给了 URL，但下载图片失败
- `response`
  模型返回了文本或拒绝，没有图片
- `visual-audit`
  图片生成出来了，但被后置视觉审核拦截

---

### 5.2 启动问题怎么查

正式版启动日志：

- `C:\Users\AEboli\Documents\CODEX\Picture-creation-main\.runtime\prod-3888.log`
- `C:\Users\AEboli\Documents\CODEX\Picture-creation-main\.runtime\prod-3888.err.log`

常用检查：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3888 }
```

如果端口没起来，再看：

```powershell
Get-Content .runtime\prod-3888.log -Tail 120
Get-Content .runtime\prod-3888.err.log -Tail 120
```

当前已知点：

- 正式版启动前会先 `npm run build`
- 如果构建失败，启动器会直接退出
- 之前 `next/font/google` 会因为联网失败卡住 build；当前代码已经改成离线字体栈，不再依赖 Google Fonts
- `prod-3888.err.log` 里仍可能出现 SQLite `ExperimentalWarning`，它通常不是致命错误

---

### 5.3 图片没出来怎么查

最常见的 3 类：

1. provider 请求失败
- 看 `providerDebug.failureStage = provider-request`
- 常见原因：
  - relay 地址不通
  - relay 返回异常
  - API Key / headers 问题

2. 模型只回文本不回图
- 看 `providerDebug.failureStage = response`
- 常见原因：
  - prompt 被模型理解成文本任务而不是生图任务

3. 后置视觉审核拦截
- 看 `providerDebug.failureStage = visual-audit`
- 说明：
  - 图片实际上生成过
  - 但被结构约束、禁字、第二主体、图位冲突等审核规则拦掉了

---

### 5.4 资产调试

你可以直接通过资产接口看缩略图或原图：

```powershell
curl.exe "http://127.0.0.1:3888/api/assets/asset_xxx?w=320&q=72" -o thumb.webp
curl.exe "http://127.0.0.1:3888/api/assets/asset_xxx?download=1" -o original.jpg
```

如果任务详情里有 `generatedAsset.id`，优先从这里确认图到底有没有生成。

---

### 5.5 设置联通性调试

Gemini / relay：

```powershell
curl.exe -X POST "http://127.0.0.1:3888/api/settings/test" ^
  -H "Content-Type: application/json" ^
  -d "{\"defaultApiKey\":\"xxx\",\"defaultApiBaseUrl\":\"http://127.0.0.1:8045\",\"defaultApiVersion\":\"v1beta\"}"
```

飞书：

```powershell
curl.exe -X POST "http://127.0.0.1:3888/api/settings/test-feishu" ^
  -H "Content-Type: application/json" ^
  -d "{\"feishuAppId\":\"xxx\",\"feishuAppSecret\":\"xxx\",\"feishuBitableAppToken\":\"xxx\",\"feishuBitableTableId\":\"xxx\"}"
```

多模态：

```powershell
curl.exe -X POST "http://127.0.0.1:3888/api/settings/test-multimodal" ^
  -H "Content-Type: application/json" ^
  -d "{\"apiKey\":\"xxx\",\"apiBaseUrl\":\"http://127.0.0.1:8045\",\"apiVersion\":\"v1beta\",\"textModel\":\"gemini-3-flash\"}"
```

---

## 6. 当前接口行为约定

### 6.1 三模式策略流程

当前：

- `standard / suite / amazon-a-plus` 的策略流程完全后端自动化
- 前端不再暴露 `quick / workbench` 切换
- `strategy-preview` 和 `strategy-rerun` 已退役

### 6.2 提示词展示

当前详情页里：

- 只展示真正发送给模型的 `promptText`
- `standard / suite / amazon-a-plus` 已不再把中间 copy/negativePrompt 暴露给前端

### 6.3 分辨率

当前有效值：

- `1K`
- `2K`
- `4K`

`0.5K / 512px` 已禁用。

### 6.4 创建页智能体

当前：

- 入口只挂在 `/create` 页头部，不进入全局导航
- 对话只在当前创作台页面临时存在，不落库
- 返回值以 `assistantText + fieldMapping + 可选 promptSuggestions` 为准
- 智能体不会直接帮你创建任务，只做建议和表单字段回填
- 当提示词工程师返回有效 `promptSuggestions` 时，映射动作会把创建页切到提示词模式，并按当前“实际生成数量”重建 `promptInputs`

---

## 7. 推荐调试顺序

如果你遇到“生成失败”，建议固定按这个顺序查：

1. 看服务有没有起来
   - 查端口
   - 查 `.runtime` 日志

2. 直接请求任务详情
   - 看 `job.errorMessage`
   - 看 `items[].providerDebug`

3. 判断是哪一层失败
   - `provider-request`
   - `response`
   - `provider-image-download`
   - `visual-audit`

4. 需要的话直接拉资产
   - 看生成图是否已存在
   - 看缩略图是否正常返回

5. 联通性测试
   - `/api/settings/test`
   - `/api/settings/test-feishu`
   - `/api/settings/test-multimodal`

---

## 8. 文档对应代码入口

如果你要继续深挖实现，最关键的代码入口是：

- 生成请求校验：
  [payload.ts](C:/Users/AEboli/Documents/CODEX/Picture-creation-main/lib/server/generation/payload.ts)
- 任务创建：
  [create-job.ts](C:/Users/AEboli/Documents/CODEX/Picture-creation-main/lib/server/generation/create-job.ts)
- 主生成流程：
  [process-job.ts](C:/Users/AEboli/Documents/CODEX/Picture-creation-main/lib/server/generation/process-job.ts)
- 实际模型调用：
  [gemini.ts](C:/Users/AEboli/Documents/CODEX/Picture-creation-main/lib/gemini.ts)
- 任务详情接口：
  [route.ts](C:/Users/AEboli/Documents/CODEX/Picture-creation-main/app/api/jobs/[id]/route.ts)
