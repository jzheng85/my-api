# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/

---

# 项目功能概述

本项目是一个基于 Cloudflare Workers 的体育赛事赔率爬虫和积分投注系统。

## 核心功能

### 1. 赛事数据爬取
- 从 https://live.chuqi.com/football/ 爬取实时比赛数据
- 支持筛选特定赛事（如世界杯）
- 每15分钟自动更新（Cron定时任务）

### 2. 用户系统
- 用户注册/登录
- 积分管理（初始1000积分）
- 密码使用 PBKDF2 加密存储

### 3. 积分投注
- 支持三种投注类型：
  - 1x2（胜平负）：主胜(win)、平局(draw)、客胜(lose)
  - AH（让球）：主队让球赢(home)、客队让球赢(away)
  - OU（大小球）：大球(over)、小球(under)
- 实时赔率查询
- 投注记录查询

### 4. 自动结算
- 根据比赛比分自动判定投注输赢
- 中奖积分自动返还（投注积分 × 赔率）
- 支持手动结算和批量结算
- **关键特性**：结算时使用投注时的盘口值（handicap_at_bet/total_goals_at_bet），而非当前盘口，确保公平性
- **赔率计算**：网站显示的赔率为净赔率（不含本金），结算时返还 = 投注积分 × (赔率 + 1)（含本金）
- **比赛结束判定**：依赖 match_status 字段，不依赖比分（允许0:0终场）
- **走地结算（Asian Handicap Split Ball）**：支持盘口值为分数形式（如 +2/2.5、2.5/3），投注会被拆分成两个独立的半注，每个半注独立结算后合并结果

#### 走地结算逻辑
当盘口值包含 `/`（如 `+2/2.5`、`2.5/3`）时，投注被拆分成两个半注：

| 状态 | 说明 | 返还计算 |
|------|------|----------|
| `won` | 全赢 | 投注积分 × (赔率 + 1) |
| `half_win` | 赢半 | (一半本金 × (赔率+1)) + 一半本金 |
| `push` | 走水 | 全额返还本金 |
| `half_lose` | 输半 | 返还一半本金 |
| `lost` | 全输 | 0 |

**示例**：盘口 `+2/2.5`，比分 `0:2`，投注 `home`（主队让球赢）
- 半注1（+2）：调整后比分 = 0 + 2 = 2，2 = 2 → **走水**（返还一半本金）
- 半注2（+2.5）：调整后比分 = 0 + 2.5 = 2.5，2.5 > 2 → **赢**（按赔率返还一半本金 + 利润）
- 合并结果：**赢半**

### 5. JWT 认证
- 用户登录时生成 JWT Token，有效期24小时
- Token 包含用户ID和用户名信息
- 所有受保护接口需要在请求头中携带 `Authorization: Bearer <token>`
- 公开接口：`/api/register`、`/api/login`
- 受保护接口：所有其他API接口

## D1 数据库表结构

### users表（用户表）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | INTEGER | - | 主键，自增 |
| username | TEXT | - | 用户名，唯一 |
| password_hash | TEXT | - | 密码哈希 |
| points | INTEGER | 1000 | 用户积分 |
| created_at | TEXT | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TEXT | CURRENT_TIMESTAMP | 更新时间 |

### bets表（投注表）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | INTEGER | - | 主键，自增 |
| user_id | INTEGER | - | 用户ID（外键） |
| match_id | TEXT | - | 比赛ID（外键） |
| bet_type | TEXT | - | 投注类型（1x2/ah/ou） |
| bet_value | TEXT | - | 投注选项 |
| points | INTEGER | - | 投注积分 |
| odds_at_bet | REAL | - | 投注时的赔率 |
| handicap_at_bet | TEXT | - | 投注时的让球盘口（AH投注时记录） |
| total_goals_at_bet | TEXT | - | 投注时的大小球盘口（OU投注时记录） |
| status | TEXT | 'pending' | 状态（pending/won/lost/half_win/half_lose/push） |
| created_at | TEXT | CURRENT_TIMESTAMP | 创建时间 |
| payout | INTEGER | 0 | 返还积分 |
| settled_at | TEXT | null | 结算时间 |
| match_result | TEXT | null | 比赛结果（win/draw/lose） |

### matches表（比赛表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 比赛ID |
| league | TEXT | 联赛名称 |
| homeTeam | TEXT | 主队名称 |
| awayTeam | TEXT | 客队名称 |
| score | TEXT | 当前比分 |
| handicap | TEXT | 让球值 |
| winOdds | TEXT | 主胜赔率 |
| drawOdds | TEXT | 平局赔率 |
| loseOdds | TEXT | 客胜赔率 |
| handicapHomeOdds | TEXT | 让球主队赔率 |
| handicapAwayOdds | TEXT | 让球客队赔率 |
| totalGoals | TEXT | 大小球盘口 |
| overOdds | TEXT | 大球赔率 |
| underOdds | TEXT | 小球赔率 |
| createdAt | TEXT | 创建时间 |
| d_st2 | TEXT | 比赛状态标识（wait=未开始，ok=已开场） |
| d_st_ing | TEXT | 比赛进行中标识（0=未进行，1=进行中） |
| match_time | TEXT | 比赛时间/开球时间 |
| match_status | TEXT | 状态（pending/live/ended） |
| settled | INTEGER | 是否已结算（0=未结算，1=已结算） |

### point_transactions表（积分流水表）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | INTEGER | - | 主键，自增 |
| user_id | INTEGER | - | 用户ID（外键） |
| type | TEXT | - | 流水类型（register/bet/settle_win/settle_lose/settle_half_win/settle_half_lose/recharge） |
| amount | INTEGER | - | 变动积分（正数为增加，负数为减少） |
| balance_after | INTEGER | - | 变动后的余额 |
| reference_id | INTEGER | null | 关联ID（如bet.id） |
| description | TEXT | - | 描述信息 |
| created_at | TEXT | CURRENT_TIMESTAMP | 创建时间 |

## API 接口

> **认证说明**：除 `/api/register` 和 `/api/login` 外，所有接口需要在请求头中携带 `Authorization: Bearer <token>`

### 用户接口

| 接口 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/register` | POST | 用户注册 | 否 |
| `/api/login` | POST | 用户登录（返回JWT Token） | 否 |
| `/api/user/points` | GET | 查询当前用户积分 | 是 |
| `/api/user/transactions` | GET | 查询积分明细 | 是 |
| `/api/user/recharge` | POST | 积分充值（需要密钥，保留用于外部调用） | 否 |

### 管理接口（仅 admin 用户可用）

| 接口 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/admin/users` | GET | 查询用户列表 | 是 |
| `/api/admin/recharge` | POST | 给指定用户充值（admin权限） | 是 |
| `/api/admin/settle-match` | POST | 更新比赛比分并标记结束（admin权限） | 是 |

### 投注接口

| 接口 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/bets` | POST | 发起投注 | 是 |
| `/api/bets` | GET | 查询当前用户投注记录（支持 `?matchId=xxx` 过滤） | 是 |
| `/api/bets/settle/:matchId` | POST | 手动结算指定比赛 | 是 |
| `/api/bets/settle-all` | POST | 批量结算所有已结束比赛 | 是 |

### 赛事接口

| 接口 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/matches` | GET | 获取所有比赛列表 | 是 |
| `/api/matches/:id` | GET | 获取单场比赛详情 | 是 |

### 爬虫接口

| 接口 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/crawl` | GET | 手动触发爬虫 | 是 |
| `/api/browser` | GET | 获取浏览器截图 | 是 |

## 数据解析规则

- `handicap` 值：d-pk 属性 > 0 时加 '+'，< 0 时加 '-'，= 0 时不加符号
- ul 元素只选择 d-st 属性值为 0 的
- `score` 值：读取前3个 span 元素的 value 属性并拼接
- `d-st2` 属性：比赛状态标识（wait=未开始，ok=已开场）
- `d-st-ing` 属性：比赛进行中标识（0=未进行，1=进行中）

### 比赛状态判定逻辑

| d-st2 | d-st-ing | match_status | 说明 |
|-------|----------|--------------|------|
| wait | - | pending | 未开始 |
| ok | 1 | live | 比赛进行中 |
| ok | 0 | ended | 比赛已结束 |

## 数据库迁移文件

| 文件 | 内容 |
|------|------|
| `migrations/001_initial.sql` | 创建 users 和 bets 表，给 matches 表添加 match_status 字段 |
| `migrations/002_add_settlement_fields.sql` | 给 bets 表添加 payout、settled_at、match_result 字段 |
| `migrations/003_add_bet_handicap_fields.sql` | 给 bets 表添加 handicap_at_bet、total_goals_at_bet 字段 |
| `migrations/004_add_match_status_fields.sql` | 给 matches 表添加 d_st2、d_st_ing 字段 |
| `migrations/005_add_match_time.sql` | 给 matches 表添加 match_time 字段 |
| `migrations/006_create_point_transactions.sql` | 创建 point_transactions 积分流水表 |
| `migrations/007_add_half_settlement_types.sql` | 添加 settle_half_win、settle_half_lose 交易类型支持走地结算 |
| `migrations/008_add_settled_field.sql` | 给 matches 表添加 settled 字段，记录比赛是否已结算 |

### 执行迁移命令

```powershell
# 本地数据库
npx wrangler d1 execute my-db --file migrations/001_initial.sql
npx wrangler d1 execute my-db --file migrations/002_add_settlement_fields.sql
npx wrangler d1 execute my-db --file migrations/003_add_bet_handicap_fields.sql
npx wrangler d1 execute my-db --file migrations/004_add_match_status_fields.sql
npx wrangler d1 execute my-db --file migrations/005_add_match_time.sql
npx wrangler d1 execute my-db --file migrations/006_create_point_transactions.sql
npx wrangler d1 execute my-db --file migrations/007_add_half_settlement_types.sql
npx wrangler d1 execute my-db --file migrations/008_add_settled_field.sql

# 远程数据库
npx wrangler d1 execute my-db --remote --file migrations/001_initial.sql
npx wrangler d1 execute my-db --remote --file migrations/002_add_settlement_fields.sql
npx wrangler d1 execute my-db --remote --file migrations/003_add_bet_handicap_fields.sql
npx wrangler d1 execute my-db --remote --file migrations/004_add_match_status_fields.sql
npx wrangler d1 execute my-db --remote --file migrations/005_add_match_time.sql
npx wrangler d1 execute my-db --remote --file migrations/006_create_point_transactions.sql
npx wrangler d1 execute my-db --remote --file migrations/007_add_half_settlement_types.sql
npx wrangler d1 execute my-db --remote --file migrations/008_add_settled_field.sql
```
