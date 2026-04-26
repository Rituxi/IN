# 指标笔记 Inno

上传医疗检查图片或 Excel，自动提取结构化数据，支持生成智能小结，并提供可维护、可扩展的后台管理系统。

## 项目定位

本项目分为两部分：

- 用户侧：上传检查图片或 Excel，完成 OCR / 结构化解析 / 智能小结。
- 管理侧：在后台统一查看调用情况、管理用户、维护兑换码、配置等级与模型、查看数据分析归档。

目标不是只把功能“做出来”，而是保证：

- 架构稳定：统计、用户资料、日志、分析备注各自职责明确。
- 逻辑清晰：每类页面都只读取自己的真值来源，不互相反推。
- 便于维护：新同学或后续 Agent 接手时，能快速判断哪里可以改，哪里不能混改。
- 中文安全：源码、配置、文档统一使用 UTF-8，避免误把终端乱码当成文件损坏。

## 功能概览

### 用户侧功能

- 图片 OCR 识别：上传检查单图片，提取标题、日期、医院、医生、指标明细和备注。
- Excel 结构化解析：识别日期列、指标列，生成结构化结果。
- 智能小结：基于检查数据生成中文健康小结。
- 用户等级体系：支持 `Care`、`Care+`、`King` 三种等级与不同额度。
- 兑换码：支持用户兑换等级权益。

### 后台功能

- 数据分析：查看调用趋势、区间汇总、按月归档明细、月备注和日备注。
- 使用记录：查看成功调用日志、分页浏览、删除日志快照。
- 用户管理：查看额度、累计使用、等级、分组、备注，支持补充额度。
- 兑换码管理：批量生成、查看、删除兑换码。
- 等级配置：配置不同等级的 OCR / 小结额度、模型路由和提示词。
- 数据备份：导出和导入后台受管 Redis 数据，支持迁移和紧急恢复。

## 后台页面说明

### 1. 数据分析页

- 路径：`/admin/analytics`
- 页面用途：给管理员查看全局调用趋势与归档明细，不做用户级筛选，不承担日志明细替代功能。
- 支持时间维度：
  - `单月`：查看某一个自然月的每日数据。
  - `全年`：查看某一年的按月汇总数据。
  - `自定义`：查看指定日期区间内的数据。
- 页面结构：
  - 顶部：时间切换器 + 汇总卡片。
  - 中部：双折线趋势图（OCR / 小结）。
  - 底部：按月折叠的归档列表，支持月备注和日备注。
- 备注规则：
  - 月备注、日备注分别独立存储。
  - 备注为后台内部说明，不回写用户资料，也不写入日志。
  - 空备注表示删除该备注键，不保留脏数据。

### 2. 使用记录页

- 路径：`/admin/logs`
- 只展示成功调用后的日志快照。
- 删除日志只删除日志本身，不回滚用户计数，不回滚总统计。

### 3. 用户管理页

- 路径：`/admin/users`
- 用户页展示的是“用户资料 + 等级配置 + 当前计数”的组合结果。
- 这里看到的额度不是写死在 `user:*` 里的，而是实时组合出来的。

### 4. 兑换码页

- 路径：`/admin/redeem`
- 用于后台生成、查看、删除兑换码。

### 5. 等级配置页

- 路径：`/admin/level-config`
- 用于维护不同等级的：
  - OCR 月额度
  - 小结月额度
  - OCR 模型路由
  - 小结模型路由
  - 智能小结提示词

### 6. 数据备份页

- 路径：`/admin/backup`
- 用于把后台受管 Redis 数据导出为带时间戳的 JSON 文件。
- 支持从备份文件完整恢复当前受管数据。
- 导入前需要输入 `RESTORE` 确认，避免误操作。
- 详细规则见 [docs/backup-restore.md](./docs/backup-restore.md)。

## 技术栈

- 前端：React 19 + TypeScript + Vite
- 路由：React Router
- 样式：Tailwind CSS v4
- 后端：Express + TypeScript
- 数据存储：Redis / Upstash Redis
- AI：Google Gemini

## 项目结构

```text
src/
  pages/
    admin/
      Analytics.tsx      # 后台数据分析页
      Logs.tsx           # 使用记录页
      Users.tsx          # 用户管理页
      Redeem.tsx         # 兑换码页
      LevelConfig.tsx    # 等级配置页
server/
  api.ts                 # 核心后端接口、Redis 读写、统计逻辑
docs/
  stats-logic.md         # 后台统计与数据职责说明
  WINDOWS_WSL_UTF8_GUIDE.md
```

## 数据与架构原则

这是项目里最重要的部分。后续如果要扩展功能，优先遵守这里的职责边界。

### 1. 单一真值原则

不同数据分别由不同 Redis 键负责：

- `user:*`
  - 只存用户稳定资料
  - 例如：`userId`、`level`、`group`、`note`、`extraOcrQuota`、`extraSummaryQuota`
- `level_configs`
  - 只存等级基础额度和模型路由
- `user_stats:*`
  - 只存用户计数
  - 包含用户总计数、自然月计数
- `usage_logs`
  - 只存日志快照，用于后台展示
- `analytics:*`
  - 只存数据分析页的索引和备注
  - 不存真正的调用计数真值
- `admin:user-groups`
  - 只存后台用户分组
- `summary:*`
  - 只存智能小结提示词等后台配置

### 2. 不混写原则

后续开发必须避免下面这些错误：

- 不要把统计快照写回 `user:*`
- 不要根据 `usage_logs` 重建统计
- 不要把“分析页备注”混进日志或用户资料
- 不要把等级额度冗余写进用户资料当真值

### 3. 数据分析页的稳定架构

数据分析页依赖以下几类数据：

- 调用真值：
  - `stats:dailyCalls:{YYYY-MM-DD}:{feature}`
  - `stats:monthlyCalls:{YYYY-MM}:{feature}`
- 可枚举索引：
  - `analytics:index:days`
  - `analytics:index:months`
- 备注：
  - `analytics:remark:day:{YYYY-MM-DD}`
  - `analytics:remark:month:{YYYY-MM}`

这套结构的意义是：

- 调用计数继续由原有统计键负责，不引入第二套可变真值。
- 数据分析页通过索引知道“有哪些日期/月份可查”。
- 备注单独存，避免污染统计结构。
- 统计、索引、备注各司其职，后续维护风险低。

### 4. 后台统计的详细规则

详细规则见 [docs/stats-logic.md](./docs/stats-logic.md)。

建议在修改下面任一能力前，先读这份文档：

- 用户额度
- 调用计数
- 后台统计
- 数据分析页
- 日志删除

## 数据分析页接口约定

### `GET /api/admin/analytics`

用途：获取后台数据分析页数据。

请求参数：

- `range=month|year|custom`
- `range=month` 时：
  - `month=YYYY-MM`
- `range=year` 时：
  - 可选 `year=YYYY`
- `range=custom` 时：
  - `start=YYYY-MM-DD`
  - `end=YYYY-MM-DD`

返回结构：

```json
{
  "availableMonths": ["2026-04", "2026-03"],
  "selectedMonth": "2026-04",
  "summary": {
    "totalCalls": 100,
    "totalOcr": 40,
    "totalSummary": 60,
    "peakValue": 12,
    "peakUnit": "day"
  },
  "chart": [
    {
      "date": "2026-04-01",
      "displayLabel": "01日",
      "ocr": 3,
      "summary": 4,
      "total": 7
    }
  ],
  "archives": [
    {
      "month": "2026-04",
      "totalOcr": 40,
      "totalSummary": 60,
      "total": 100,
      "remark": "",
      "days": [
        {
          "date": "2026-04-01",
          "ocr": 3,
          "summary": 4,
          "total": 7,
          "remark": ""
        }
      ]
    }
  ]
}
```

接口约束：

- `month` 必须是合法 `YYYY-MM`
- `year` 必须是合法 `YYYY`
- `custom` 范围必须合法，且当前限制最大为 366 天
- 请求不存在的月份或年份时，返回明确错误

### `PUT /api/admin/analytics/remark`

用途：保存数据分析页备注。

请求体：

```json
{
  "scope": "month",
  "key": "2026-04",
  "remark": "活动投放期间"
}
```

规则：

- `scope` 只允许 `month` 或 `day`
- `key` 必须与 scope 对应：
  - `month` => `YYYY-MM`
  - `day` => `YYYY-MM-DD`
- `remark` 会先校验长度，再统一归一化
- 空字符串表示删除该备注

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

启动前请先在 `.env.local` 中补齐环境变量。

## 环境变量

| 变量名 | 是否必填 | 说明 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 是 | Gemini API Key |
| `REDIS_URL` | 否 | Redis TCP 连接串，优先使用 |
| `UPSTASH_REDIS_REST_URL` | 否 | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | 否 | Upstash REST Token |
| `ADMIN_PASSWORD` | 否 | 管理员密码，默认 `admin123` |
| `PORT` | 否 | 服务端口，默认 `3000` |
| `QUOTA_TIMEZONE` | 否 | 统计和额度使用的时区，默认 `Asia/Shanghai` |
| `ADMIN_BACKUP_EXPORT_TIMEOUT_MS` | 否 | 后台备份导出超时时间，默认 `60000` 毫秒 |

说明：

- `REDIS_URL` 和 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 二选一即可。
- 如果已有标准 Redis，优先配置 `REDIS_URL`。

## 构建与运行

```bash
npm run lint
npm run build
npm run start
```

## 开发环境建议

- Windows：浏览器预览、图形化调试
- WSL：Git、Codex / AI IDE、批量脚本、批量文本处理

涉及中文文件、Markdown、大批量文本修改时，优先在 WSL 中执行。

详细规则见：

- [docs/WINDOWS_WSL_UTF8_GUIDE.md](./docs/WINDOWS_WSL_UTF8_GUIDE.md)
- [AGENTS.md](./AGENTS.md)

## 维护规范

### 编码规范

- 所有源码、配置、文档统一使用 `UTF-8`
- 不要把 UTF-8 文件另存为 ANSI、GBK、UTF-16
- 不要把 PowerShell 终端乱码直接当成文件损坏

### 改动规范

- 优先小范围修改，不做无关重写
- 修改统计逻辑时，先确认真值来源，不要“顺手”改多个层级
- 修改中文 Markdown / 文案时，先确认是 UTF-8 真实内容，再写入
- 后台分析页、日志页、用户页的统计口径必须保持一致

### 代码规范

- 输入校验与存储归一化分开写
- Redis key 统一抽常量，不要散落硬编码
- 适配层负责屏蔽 Redis 提供方差异
- 路由层只做参数校验、流程编排、返回结果
- 统计 Lua 脚本修改时，必须考虑并发和原子性

### 文档规范

以下情况改完代码后，应该同步更新文档：

- 新增后台页面
- 新增 Redis 键
- 修改统计口径
- 修改接口入参 / 出参
- 修改额度规则
- 修改备份导入导出范围

## 回归检查建议

每次涉及后台统计或数据分析页改动，至少做以下检查：

1. `npm run lint`
2. `npm run build`
3. 手动打开后台页面，检查：
   - 路由是否正常
   - 中文是否正常显示
   - 数据分析页时间切换是否正常
   - 月折叠与备注保存是否正常
   - 使用记录、用户管理、兑换码、等级配置是否未被破坏

## 当前后台入口

- 后台路径：`/admin`
- 默认页：`/admin/logs`

## 额外说明

- 数据分析页当前只保证“上线后数据”的稳定索引与展示，不做历史回填。
- 导出报表按钮目前是视觉占位，不包含真实导出逻辑。
- 如果后续要新增筛选条件、导出、钻取分析，请先补设计文档，再改代码和 README。
