# 指标笔记 Inno

上传医疗检查图片或 Excel，自动提取结构化数据，并支持生成智能小结与后台管理。

## 功能概览

- 图片 OCR 识别：上传检查单图片，提取标题、日期、医院、医生、指标明细和备注。
- Excel 结构化解析：支持从常见体检表、化验表中识别日期列和指标列。
- 智能小结：基于检查数据生成中文健康小结。
- 用户等级体系：支持 `Care`、`Care+`、`King` 三种等级。
- 兑换码系统：后台可批量生成和管理兑换码。
- 管理后台：支持查看日志、管理用户、维护等级配置和提示词。

## 技术栈

- 前端：React 19 + TypeScript + Vite
- 样式：Tailwind CSS v4
- 后端：Express + TypeScript
- 数据存储：Redis / Upstash Redis
- AI：Google Gemini

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

说明：

- `REDIS_URL` 和 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 二选一即可。
- 如果已经有标准 Redis，优先配置 `REDIS_URL`。

## 构建与运行

```bash
npm run build
npm run start
```

## 管理后台

- 路径：`/admin`
- 功能：
  - 查看调用日志和统计数据
  - 管理用户等级、补充额度、编辑备注和分组
  - 批量生成兑换码
  - 配置等级额度、模型和智能小结提示词

## 编码与维护约定

- 项目源码和文档统一使用 `UTF-8`
- 修改中文文案时不要使用 ANSI、GBK、UTF-16
- 面向 AI IDE 或 Agent 的维护规则见 [AGENTS.md](/D:/0026Project/IN/AGENTS.md)
