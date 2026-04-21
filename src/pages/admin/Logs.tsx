import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity, BarChart3, Calendar, ChevronLeft, ChevronRight, FileText, RefreshCw, Trash2, Users } from 'lucide-react';
import {
  EMPTY_ADMIN_LOGS_PAGINATION,
  getAdminLogsEffectiveCachedPageCount,
  getAdminLogsTotalPages,
  type AdminLogsPaginationMeta,
} from '../../../shared/adminLogs';
import { toBoundedPositiveInteger } from '../../../shared/number';

interface FeatureStats {
  ocr: number;
  summary: number;
}

interface UsageStats {
  totalCalls: number;
  todayCalls: number;
  monthCalls: number;
  todayUsers: number;
  totalUsers: number;
  totalCallsByFeature: FeatureStats;
  todayCallsByFeature: FeatureStats;
  monthCallsByFeature: FeatureStats;
}

interface UsageLog {
  id: string;
  userId: string;
  ip: string;
  ipLocation: string;
  feature: 'ocr' | 'summary';
  monthlyUsedCount: number;
  totalUsedCount: number;
  usedAt: string;
}

interface PaginatedLogsResponse {
  logs: UsageLog[];
  page: number;
  pagination: AdminLogsPaginationMeta;
}

type CachedLogsPages = Record<number, UsageLog[]>;

const defaultStats: UsageStats = {
  totalCalls: 0,
  todayCalls: 0,
  monthCalls: 0,
  todayUsers: 0,
  totalUsers: 0,
  totalCallsByFeature: { ocr: 0, summary: 0 },
  todayCallsByFeature: { ocr: 0, summary: 0 },
  monthCallsByFeature: { ocr: 0, summary: 0 },
};

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFeatureStats(value: unknown): FeatureStats {
  if (!value || typeof value !== 'object') {
    return { ...defaultStats.totalCallsByFeature };
  }
  const featureStats = value as Record<string, unknown>;
  return {
    ocr: toNonNegativeNumber(featureStats.ocr),
    summary: toNonNegativeNumber(featureStats.summary),
  };
}

function normalizeUsageStats(value: unknown): UsageStats {
  if (!value || typeof value !== 'object') {
    return defaultStats;
  }
  const stats = value as Record<string, unknown>;
  return {
    totalCalls: toNonNegativeNumber(stats.totalCalls),
    todayCalls: toNonNegativeNumber(stats.todayCalls),
    monthCalls: toNonNegativeNumber(stats.monthCalls),
    todayUsers: toNonNegativeNumber(stats.todayUsers),
    totalUsers: toNonNegativeNumber(stats.totalUsers),
    totalCallsByFeature: normalizeFeatureStats(stats.totalCallsByFeature),
    todayCallsByFeature: normalizeFeatureStats(stats.todayCallsByFeature),
    monthCallsByFeature: normalizeFeatureStats(stats.monthCallsByFeature),
  };
}

function normalizeUsageLog(value: unknown): UsageLog | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const log = value as Record<string, unknown>;
  const id = toText(log.id).trim();
  if (!id) return null;

  const feature = toText(log.feature) === 'summary' ? 'summary' : 'ocr';
  return {
    id,
    userId: toText(log.userId),
    ip: toText(log.ip),
    ipLocation: toText(log.ipLocation),
    feature,
    monthlyUsedCount: toNonNegativeNumber(log.monthlyUsedCount),
    totalUsedCount: toNonNegativeNumber(log.totalUsedCount),
    usedAt: toText(log.usedAt),
  };
}

function normalizeLogsPagination(value: unknown, fallback: AdminLogsPaginationMeta): AdminLogsPaginationMeta {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const payload = value as Record<string, unknown>;
  const maxStore = toBoundedPositiveInteger(payload.maxStore, fallback.maxStore, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = toBoundedPositiveInteger(payload.pageSize, fallback.pageSize, 1, maxStore);
  const memoryWindow = toBoundedPositiveInteger(payload.memoryWindow, fallback.memoryWindow, pageSize, maxStore);

  return {
    pageSize,
    memoryWindow,
    maxStore,
    totalCount: Math.min(Math.floor(toNonNegativeNumber(payload.totalCount)), maxStore),
  };
}

function normalizeLogsResponse(value: unknown, requestedPage: number, fallbackPagination: AdminLogsPaginationMeta): PaginatedLogsResponse {
  if (Array.isArray(value)) {
    const logs = value.map(normalizeUsageLog).filter((entry): entry is UsageLog => Boolean(entry));
    return {
      logs,
      page: requestedPage,
      pagination: {
        ...fallbackPagination,
        totalCount: logs.length,
      },
    };
  }

  if (!value || typeof value !== 'object') {
    return {
      logs: [],
      page: requestedPage,
      pagination: fallbackPagination,
    };
  }

  const payload = value as Record<string, unknown>;
  const logs = (Array.isArray(payload.logs) ? payload.logs : [])
    .map(normalizeUsageLog)
    .filter((entry): entry is UsageLog => Boolean(entry));
  const pagination = normalizeLogsPagination(payload.pagination, fallbackPagination);

  return {
    logs,
    page: toBoundedPositiveInteger(payload.page, requestedPage, 1, getAdminLogsTotalPages(pagination)),
    pagination,
  };
}

function buildRefreshedCachedLogsPages(
  page: number,
  logs: UsageLog[],
  pagination: AdminLogsPaginationMeta,
): CachedLogsPages {
  if (page > getAdminLogsEffectiveCachedPageCount(pagination)) {
    return {};
  }
  return { [page]: logs };
}

function mergeCachedLogsPage(
  currentPages: CachedLogsPages,
  page: number,
  logs: UsageLog[],
  pagination: AdminLogsPaginationMeta,
): CachedLogsPages {
  const nextPages: CachedLogsPages = {};
  const effectiveCachedPageCount = getAdminLogsEffectiveCachedPageCount(pagination);

  for (const [key, value] of Object.entries(currentPages)) {
    const pageNumber = Number(key);
    if (Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= effectiveCachedPageCount) {
      nextPages[pageNumber] = value;
    }
  }

  if (page <= effectiveCachedPageCount) {
    nextPages[page] = logs;
  }

  return nextPages;
}

const statCards = [
  { key: 'totalCalls', splitKey: 'totalCallsByFeature', label: '总调用次数', note: '累计功能调用', icon: BarChart3 },
  { key: 'todayCalls', splitKey: 'todayCallsByFeature', label: '今日调用', note: '当天请求波动', icon: Activity },
  { key: 'monthCalls', splitKey: 'monthCallsByFeature', label: '本月调用', note: '月度累计趋势', icon: Calendar },
  { key: 'todayUsers', label: '今日使用人数', note: '当天去重用户', icon: Users },
  { key: 'totalUsers', label: '总用户数', note: '活跃用户覆盖', icon: Users },
] as const;

function StatCardValue({
  splitStats,
  fallbackValue,
}: {
  splitStats: FeatureStats | null;
  fallbackValue: number;
}) {
  if (!splitStats) {
    return <div className="text-[32px] font-semibold leading-none tracking-tight">{fallbackValue}</div>;
  }

  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[32px] font-bold leading-none tracking-tight text-zinc-900">{splitStats.ocr}</span>
      <span className="text-[12px] font-bold text-zinc-400">OCR</span>
      <span className="mx-1 text-[18px] font-light text-zinc-200">|</span>
      <span className="text-[32px] font-bold leading-none tracking-tight text-zinc-900">{splitStats.summary}</span>
      <span className="text-[12px] font-medium text-zinc-400">小结</span>
    </div>
  );
}

function getFeatureMeta(feature: UsageLog['feature']) {
  if (feature === 'ocr') {
    return {
      label: '智能 OCR',
      className: 'bg-emerald-50/80 text-emerald-600 ring-1 ring-emerald-100/50',
    };
  }

  return {
    label: '智能小结',
    className: 'bg-amber-50/80 text-amber-700 ring-1 ring-amber-100/50',
  };
}

function getSafeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateParts(value: string) {
  const date = getSafeDate(value);
  if (!date) {
    return { day: '--', time: '--' };
  }

  return {
    day: format(date, 'yyyy-MM-dd'),
    time: format(date, 'HH:mm:ss'),
  };
}

export default function Logs() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [cachedLogsPages, setCachedLogsPages] = useState<CachedLogsPages>({});
  const [pagination, setPagination] = useState<AdminLogsPaginationMeta>(EMPTY_ADMIN_LOGS_PAGINATION);
  const [stats, setStats] = useState<UsageStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = pagination.pageSize;
  const totalPages = getAdminLogsTotalPages(pagination);
  const effectiveCachedPageCount = getAdminLogsEffectiveCachedPageCount(pagination);
  const startIndex = pagination.totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = pagination.totalCount === 0 ? 0 : Math.min(currentPage * pageSize, pagination.totalCount);
  const cacheRangeText = effectiveCachedPageCount === 1
    ? `第 1 页（最近 ${pagination.memoryWindow} 条）按需缓存`
    : `第 1-${effectiveCachedPageCount} 页（最近 ${pagination.memoryWindow} 条）按需缓存`;
  const cacheStrategyText = totalPages > effectiveCachedPageCount
    ? `${cacheRangeText}，第 ${effectiveCachedPageCount + 1} 页起按需加载历史记录。`
    : `${cacheRangeText}，当前总页数都在缓存范围内。`;
  const retentionText = `列表仅保留最近 ${pagination.maxStore} 条日志，超出后会自动滚动覆盖更早记录。`;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken') || '';
    return { Authorization: `Bearer ${token}` };
  };

  const fetchStats = async () => {
    const statsRes = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!statsRes.ok) {
      return;
    }
    const statsData = await statsRes.json();
    setStats(normalizeUsageStats(statsData));
  };

  const fetchLogsPageFromApi = async (
    page: number,
    fallbackPagination: AdminLogsPaginationMeta,
  ): Promise<PaginatedLogsResponse> => {
    const params = new URLSearchParams({ page: String(page) });
    const logsRes = await fetch(`/api/admin/logs?${params.toString()}`, { headers: getAuthHeaders() });
    if (!logsRes.ok) {
      throw new Error('Load logs failed');
    }
    const payload = await logsRes.json();
    return normalizeLogsResponse(payload, page, fallbackPagination);
  };

  const refreshLogs = async (targetPage: number) => {
    const targetChunk = await fetchLogsPageFromApi(targetPage, pagination);
    setLogs(targetChunk.logs);
    setPagination(targetChunk.pagination);
    setCurrentPage(targetChunk.page);
    setCachedLogsPages(buildRefreshedCachedLogsPages(targetChunk.page, targetChunk.logs, targetChunk.pagination));
  };

  const fetchLogsAndStats = async () => {
    setLoading(true);
    try {
      await Promise.all([refreshLogs(1), fetchStats()]);
    } catch (error) {
      console.error(error);
      alert('加载使用记录失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = async (targetPage: number) => {
    const safePage = Math.min(Math.max(1, targetPage), totalPages);
    if (safePage === currentPage) return;

    const cachedLogs = cachedLogsPages[safePage];
    if (safePage <= effectiveCachedPageCount && cachedLogs) {
      setLogs(cachedLogs);
      setCurrentPage(safePage);
      return;
    }

    setPageLoading(true);
    try {
      const payload = await fetchLogsPageFromApi(safePage, pagination);
      setLogs(payload.logs);
      setPagination(payload.pagination);
      setCurrentPage(payload.page);
      setCachedLogsPages((currentPages) => mergeCachedLogsPage(currentPages, payload.page, payload.logs, payload.pagination));
    } catch (error) {
      console.error(error);
      alert('加载使用记录失败，请稍后重试。');
    } finally {
      setPageLoading(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!window.confirm('确定要删除这条使用记录吗？')) {
      return;
    }

    setDeleting(logId);
    setPageLoading(true);
    try {
      const res = await fetch(`/api/admin/logs/${logId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }

      await refreshLogs(currentPage);
    } catch (error) {
      console.error(error);
      alert('删除失败，请稍后重试。');
    } finally {
      setDeleting(null);
      setPageLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsAndStats();
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-sm text-zinc-500">正在加载数据...</div>;
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="px-2 py-1 sm:px-0 sm:py-0">
        <div className="flex flex-wrap items-end justify-between gap-4 px-2">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-400">
              <FileText size={13} />
              Logs Overview
            </div>
            <h2 className="mb-2 text-[28px] font-semibold tracking-tight text-zinc-900 sm:text-[30px]">使用记录</h2>
            <p className="text-[13px] font-medium text-zinc-500">
              统一查看调用统计、IP 来源、功能使用情况和删除操作。
            </p>
          </div>

          <button
            onClick={fetchLogsAndStats}
            className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white shadow-md transition-all active:scale-95 hover:bg-black"
          >
            <RefreshCw size={15} />
            刷新数据
          </button>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-5">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            const splitStats = 'splitKey' in stat ? stats[stat.splitKey] : null;
            const fallbackValue = stats[stat.key];
            const cardClass = 'bg-white/45 text-zinc-900';
            const iconClass = 'bg-zinc-100/80 text-zinc-500';
            const labelClass = 'text-zinc-500';
            const noteClass = 'text-zinc-400';

            return (
              <div
                key={stat.key}
                className={`rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl ${cardClass}`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <span className={`text-[13px] font-medium ${labelClass}`}>{stat.label}</span>
                  <div className={`flex h-14 w-14 items-center justify-center rounded-[18px] ${iconClass}`}>
                    <Icon size={20} />
                  </div>
                </div>
                <StatCardValue splitStats={splitStats} fallbackValue={fallbackValue} />
                <div className={`mt-3 text-[12px] font-medium ${noteClass}`}>{stat.note}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-2 sm:px-0">
        <div className="mb-4 px-2">
          <h3 className="text-[18px] font-semibold text-zinc-800">最近日志</h3>
          <p className="text-[13px] text-zinc-400">
            {`分页规则：每页 ${pageSize} 条。${cacheStrategyText}`}
          </p>
          <p className="mt-1 text-[13px] text-zinc-400">{retentionText}</p>
        </div>

        <div className="hidden grid-cols-[90px_minmax(0,1fr)_120px_100px_80px_80px_80px] items-center gap-x-6 px-8 py-3 text-[13px] font-medium text-zinc-400 xl:grid">
          <div>时间</div>
          <div>用户信息</div>
          <div>IP 归属地</div>
          <div>功能</div>
          <div>本月次数</div>
          <div>功能累计</div>
          <div className="text-right">操作</div>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-200 bg-white/30 py-16 text-center text-[15px] text-zinc-500">
            暂无使用记录
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const date = getDateParts(log.usedAt);
              const feature = getFeatureMeta(log.feature);

              return (
                <div
                  key={log.id}
                  className="grid gap-y-3 rounded-[24px] bg-white/50 px-6 py-5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] ring-1 ring-white/80 backdrop-blur-2xl transition-all duration-300 hover:bg-white/70 xl:grid-cols-[90px_minmax(0,1fr)_120px_100px_80px_80px_80px] xl:items-center xl:gap-x-6"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-semibold tracking-tight text-zinc-800">{date.day}</span>
                    <span className="font-mono text-[11px] text-zinc-400">{date.time}</span>
                  </div>

                  <div className="min-w-0 pr-4">
                    <div className="truncate font-mono text-[13px] text-zinc-800" title={log.userId}>
                      {log.userId}
                    </div>
                    <div className="mt-1 inline-flex rounded-full bg-zinc-100/80 px-3 py-1 text-[12px] font-medium text-zinc-400">
                      {log.ip || 'unknown'}
                    </div>
                  </div>

                  <div className="text-[13px] font-medium text-zinc-600">{log.ipLocation || '未知'}</div>

                  <div>
                    <span className={`inline-flex whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[12px] font-bold tracking-wide ${feature.className}`}>
                      {feature.label}
                    </span>
                  </div>

                  <div className="text-[15px] font-semibold text-zinc-800">{log.monthlyUsedCount}</div>
                  <div className="text-[15px] font-semibold text-zinc-800">{log.totalUsedCount}</div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDelete(log.id)}
                      disabled={deleting === log.id}
                      className="inline-flex items-center justify-center rounded-full bg-red-50/70 px-4 py-2 text-[13px] font-medium text-red-500 ring-1 ring-red-100 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={15} className="mr-1.5" />
                      {deleting === log.id ? '删除中...' : '删除'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-2">
          <p className="text-[13px] text-zinc-500">
            {`第 ${currentPage} / ${totalPages} 页 · 当前显示 ${startIndex}-${endIndex}，共 ${pagination.totalCount} 条`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={pageLoading || currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[13px] font-medium text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={14} />
              <span>上一页</span>
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={pageLoading || currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[13px] font-medium text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>下一页</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {pageLoading ? (
          <div className="mt-3 px-2 text-[12px] text-zinc-400">正在加载当前页...</div>
        ) : null}
      </div>
    </div>
  );
}
