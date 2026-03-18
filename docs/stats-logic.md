# Admin Stats Logic

This project separates four different concerns:

1. `user:*` stores stable user profile fields only.
2. `level_configs` stores the current base limits and model routing for each level.
3. `user_stats:*` stores usage counters.
4. `usage_logs` stores recent success snapshots for admin viewing.

They must not be mixed.

## Source of truth

### User profile keys

`user:*` keeps stable fields such as:

- `userId`
- `level`
- `extraOcrQuota`
- `extraSummaryQuota`
- `note`
- `group`
- `status`
- `firstUsedAt`

`user:*` is not the source of truth for base limits or counters.

In production, the canonical `userId` should be the user's OpenID.

### Level config key

`level_configs` is the source of truth for:

- current base monthly OCR limit of each level
- current base monthly summary limit of each level
- model routing of each level

Changing `level_configs` changes the base limit of existing users immediately,
because the backend derives `ocrLimit` and `summaryLimit` from the current level
config at read time.

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

- OCR rows show OCR-only counters
- Summary rows show summary-only counters
- deleting a log only deletes the log row
- deleting a log does not change counters

### User management page

The user page combines three sources:

1. `user:*` for stable profile fields
2. `level_configs` for the current base limit of the user's level
3. `user_stats:*` for counters

For each feature:

```text
monthly total = current month total usage for that feature
base used = min(monthly total, base limit)
extra used = max(monthly total - base limit, 0)
historical total = feature lifetime total
```

So the page shows:

- `Base quota`: `base used / base limit`
- `Extra quota`: `extra used / extra limit`
- `OCR total | Summary total`: lifetime total for each feature

These values do not depend on how many logs are kept.
They also do not depend on stale fields inside `user:*`, because limits and
counters are always re-derived before returning the response.

## Quota rule

For non-unlimited users:

```text
allowed when monthly total < base limit + extra limit
```

Where:

- `base limit` comes from the current `level_configs` entry of that level
- `extra limit` comes from `user:*`

Usage always consumes quota in this order:

1. base quota first
2. extra quota second

For unlimited users:

- quota check always passes
- counters still increase

## Concurrency rule

Quota control for feature calls must be atomic.

The backend uses a Redis reservation flow for each feature call:

1. reserve one slot before calling the AI model
2. if reservation fails, return `QUOTA_EXCEEDED`
3. if the AI call succeeds, commit the reservation and write counters plus log in one Redis script
4. if the AI call fails, release the reservation

This prevents the same user from sending two concurrent requests that both pass
quota validation and push the month total above the limit.

Admin-side quota updates are also atomic now:

1. the admin page sends extra quota as delta values
2. the backend applies group, level, note, and extra quota patch in one Redis Lua script
3. the backend rehydrates fresh counters after saving before returning the updated user

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
- `patchStoredUserRecord`
- `reserveFeatureUsage`
- `recordFeatureUsage`
- `releaseFeatureUsageReservation`

Main admin routes:

- `GET /api/admin/logs`
- `GET /api/admin/users`
- `GET /api/admin/stats`
- `POST /api/admin/users/:userId`

## Maintenance rule

If you change statistics later:

1. change `user_stats:*` logic first
2. keep `user:*` as profile-only storage
3. keep `level_configs` as the only source of base limits
4. keep logs as snapshots only
5. do not rebuild counters from log rows
6. do not let admin pages write counter snapshots back into `user:*`
