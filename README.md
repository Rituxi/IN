<div align="center">
<img width="1200" height="475" alt="智能报告单识别" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 智能报告单识别 - AI医疗报告解析系统

上传医疗检查报告单图片或Excel，获取AI智能解析与健康小结。

## 功能特性

- **智能OCR识别**: 上传检查报告单图片，自动识别并结构化数据
- **智能小结**: 上传Excel历史记录，生成健康小结分析
- **用户等级系统**: Care(普通) / Care+(高级) / King(无限) 三级会员
- **兑换码系统**: 支持兑换码升级会员等级
- **管理后台**: 数据统计、用户管理、兑换码管理

## 快速部署

### 前置准备

1. **Gemini API Key** - [获取地址](https://aistudio.google.com/app/apikey)
2. **Upstash Redis** - [注册地址](https://upstash.com) (免费套餐可用)

### 方式一：Railway 部署 (推荐)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. 点击上方按钮或访问 Railway
2. 连接 GitHub 仓库
3. 设置环境变量：
   - `GEMINI_API_KEY` - 你的 Gemini API Key
   - `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
   - `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis Token
   - `ADMIN_PASSWORD` - 管理员密码 (可选，默认 admin123)

### 方式二：Render 部署

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. 点击上方按钮或访问 Render
2. 创建新的 Web Service
3. 连接 GitHub 仓库
4. 设置环境变量 (同上)

### 方式三：Zeabur 部署 (国内推荐)

[![Deploy on Zeabur](https://zeabur.io/deploy.svg)](https://zeabur.io)

1. 点击上方按钮
2. 导入 GitHub 仓库
3. 配置环境变量

### 方式四：Docker 部署

```bash
docker build -t medical-report-ai .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key \
  -e UPSTASH_REDIS_REST_URL=your_url \
  -e UPSTASH_REDIS_REST_TOKEN=your_token \
  medical-report-ai
```

## 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `GEMINI_API_KEY` | ✅ | Gemini API Key |
| `REDIS_URL` | ✅* | Redis TCP 连接字符串 (推荐) |
| `UPSTASH_REDIS_REST_URL` | ✅* | Upstash REST URL (兜底方案) |
| `UPSTASH_REDIS_REST_TOKEN` | ✅* | Upstash REST Token (兜底方案) |
| `ADMIN_PASSWORD` | ❌ | 管理员密码，默认 admin123 |
| `PORT` | ❌ | 服务端口，默认 3000 |

> *Redis 配置二选一：优先使用 `REDIS_URL`，如果没有则使用 Upstash REST 方式

### Redis 配置示例

**方式一 (推荐)**: 使用 TCP 连接
```
REDIS_URL="rediss://default:gQAAAAAAAR99AAIncDFhMzViMWM2MGFkZGY0ZTNkOGU1OTIxOTQxNzE5ZGU4MnAxNzM1OTc@wondrous-dinosaur-73597.upstash.io:6379"
```

**方式二**: 使用 Upstash REST API
```
UPSTASH_REDIS_REST_URL="https://wondrous-dinosaur-73597.upstash.io"
UPSTASH_REDIS_REST_TOKEN="你的token"
```

## 使用说明

### 用户端

1. 访问首页，上传报告单图片或Excel文件
2. 系统自动识别并展示结构化数据
3. 可在首页输入兑换码升级会员等级

### 管理后台

访问 `/admin` 进入管理后台：

- **数据概览**: 查看总调用次数、今日/本月统计
- **使用记录**: 查看用户调用日志
- **用户管理**: 管理用户等级、增加额度、添加备注
- **兑换码**: 生成和管理兑换码

## 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env.local
# 编辑 .env.local 填入你的配置

# 启动开发服务器
npm run dev
```

## 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS + Vite
- **后端**: Express.js
- **数据库**: Upstash Redis
- **AI**: Google Gemini API

## License

MIT
