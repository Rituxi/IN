# Admin Stats Logic

This project now separates three different concerns:

1. `user:*` stores user profile and quota configuration.
2. `user_stats:*` stores all usage counters.
3. `usage_logs` stores recent success snapshots for admin viewing.

They must not be mixed.

## Source of truth

### User profile keys

`user:*` keeps stable user fields such as:

- level
- base monthly limits
- extra monthly quota
- note
- group

These records are not the source of truth for counters anymore.

### Counter keys

All usage counters live in dedicated Redis keys:

- `user_stats:{userId}:total:ocr`
- `user_stats:{userId}:total:summary`
- `user_stats:{userId}:monthly:{YYYY-MM}:ocr`
- `user_stats:{userId}:monthly:{YYYY-MM}:summary`

These keys are the only source of truth for:

- current natural-month OCR usage
- current natural-month summary usage
- lifetime OCR usage
- lifetime summary usage

### Log keys

Recent logs live in:

- `usage_logs`
- `log_index:{logId}`

Logs are snapshots only. They are never used to rebuild counters.

## Page rules

### Usage record page

Each log row stores the final values at the time that request succeeded:

- `monthlyUsedCount`: this user, this feature, this natural month
- `totalUsedCount`: this user, this feature, lifetime total

So:

- `智能 OCR` rows show OCR-only counters
- `智能小结` rows show summary-only counters
- deleting a log only deletes the log row
- deleting a log does not change counters

### User management page

The user page reads the same `user_stats:*` counters and converts them into admin display fields.

For each feature:

```text
monthly total = current month total usage for that feature
base used = min(monthly total, base limit)
extra used = max(monthly total - base limit, 0)
historical total = feature lifetime total
```

So the page shows:

- `基础额度`: `base used / base limit`
- `额外额度`: `extra used / extra limit`
- `OCR累计 | 小结累计`: lifetime total for each feature

These values do not depend on how many logs are kept.

## Quota rule

For non-unlimited users:

```text
allowed when monthly total < base limit + extra limit
```

Usage always consumes quota in this order:

1. base quota first
2. extra quota second

For unlimited users:

- quota check always passes
- counters still increase

## Concurrency rule

Quota control must be atomic.

The backend now uses a Redis reservation flow for each feature call:

1. Reserve one slot before calling the AI model
2. If reservation fails, return `QUOTA_EXCEEDED`
3. If the AI call succeeds, commit the reservation and write counters + log in one Redis script
4. If the AI call fails, release the reservation

This prevents the same user from sending two concurrent requests that both pass quota validation and push the month total above the limit.

## Monthly reset rule

Monthly counters are stored in month-specific Redis keys.

That means:

- a new natural month automatically starts from `0`
- lifetime totals never reset
- extra quota values stay as configured until manually changed

## Backend entry points

Main helpers:

- `hydrateUsersUsage`
- `buildFeatureUsageStats`
- `reserveFeatureUsage`
- `recordFeatureUsage`
- `releaseFeatureUsageReservation`

Main admin routes:

- `GET /api/admin/logs`
- `GET /api/admin/users`
- `GET /api/admin/stats`

## Maintenance rule

If you change statistics later:

1. change `user_stats:*` logic first
2. keep logs as snapshots only
3. do not rebuild counters from log rows
4. do not let admin pages read stale `user:*` counter fields directly
