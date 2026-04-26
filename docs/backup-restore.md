# 后台数据备份与恢复

## 功能目标

后台路径：`/admin/backup`

这个功能用于把后台受管数据导出为本地 JSON 文件，并在紧急迁移或故障恢复时导入回 Redis。备份文件会带上导出时间戳，文件内部也会记录 `exportedAt`、`schemaVersion`、`timezone` 和每个 Redis key 的类型、值、TTL。

## 当前备份范围

当前版本会备份这些 Redis key：

- `user:*`：用户稳定资料
- `user_stats:*`：用户调用次数、月度次数、待确认调用预留
- `usage_logs`、`log_index:*`：使用记录与日志索引
- `stats:*`：总调用、每日调用、每月调用、每日使用人数
- `analytics:*`：数据分析页索引与备注
- `redeem:*`：兑换码
- `level_configs`：等级配置
- `summary:*`：智能小结提示词
- `admin:user-groups`：后台用户分组

代码中通过 `ADMIN_BACKUP_RESERVED_PAYMENT_KEY_PATTERNS` 预留了支付和权益相关的 key 范围，例如 `order:*`、`payment:*`、`wxpay:*`、`entitlement:*`、`care_plus:*`。这些 key 是 2027 年支付功能的预留模式，当前版本还没有实际写入。后续加入支付功能时，应先确认真实订单表、权益表、支付回调表对应的 Redis key 是否都在这个范围内，再做支付功能上线检查。

## 导出规则

- 接口：`GET /api/admin/backup/export`
- 权限：需要后台管理员密码 `Authorization: Bearer <ADMIN_PASSWORD>`
- 输出：JSON 文件，文件名形如 `inno-admin-backup-2026-04-26T08-00-00-000Z.json`
- 支持 Redis 类型：`string`、`list`、`zset`、`set`、`hash`
- 会记录 TTL，导入时尽量恢复 TTL
- 前端只接受 `.json` / `application/json` 文件，单个文件建议控制在 40MB 以内
- 服务端导出默认 60 秒超时，可通过 `ADMIN_BACKUP_EXPORT_TIMEOUT_MS` 调整
- 单个 key 导出失败时会返回包含 key 名称的错误，避免生成不完整备份

## 导入规则

- 接口：`POST /api/admin/backup/import`
- 当前只支持完整恢复模式：`mode=replace`
- 必须传入确认文本：`confirm=RESTORE`
- 服务端会先删除当前受管范围内的 Redis key，再写入备份文件里的 key
- 不会删除备份范围之外的业务数据
- 当前只支持 `schemaVersion=1` 的备份文件；版本不一致时会拒绝导入，并返回需要补充迁移逻辑的错误提示
- 导入前会先抓取当前受管数据快照；如果恢复备份过程中失败，服务端会清理半成品并尝试回滚到导入前状态

导入前建议先在 `/admin/backup` 下载一份当前备份，这样如果导入文件选错，还能用刚下载的文件恢复。

## 维护约束

- 新增后台数据真值时，必须同步更新 `ADMIN_BACKUP_KEY_PATTERNS`。
- 不要用使用记录 `usage_logs` 重建统计真值；备份恢复只是恢复快照，不改变现有统计职责边界。
- 新增支付、订单、权益相关数据时，优先使用清晰稳定的 Redis key 前缀，方便纳入备份范围。
- 修改备份文件结构时必须提升 `ADMIN_BACKUP_SCHEMA_VERSION`，并写清楚兼容策略。
