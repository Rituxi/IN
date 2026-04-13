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
  { key: 'totalCalls', splitKey: 'totalCallsByFeature', label: '\u603b\u8c03\u7528\u6b21\u6570', icon: BarChart3 },
  { key: 'todayCalls', splitKey: 'todayCallsByFeature', label: '\u4eca\u65e5\u8c03\u7528', icon: Activity },
  { key: 'monthCalls', splitKey: 'monthCallsByFeature', label: '\u672c\u6708\u8c03\u7528', icon: Calendar },
  { key: 'totalUsers', label: '\u603b\u7528\u6237\u6570', icon: Users },
] as const;

function getFeatureMeta(feature: UsageLog['feature']) {
  if (feature === 'ocr') {
    return {
      label: '\u667a\u80fd OCR',
      className: 'bg-emerald-50/80 text-emerald-600 ring-1 ring-emerald-100/50',
    };
  }

  return {
    label: '\u667a\u80fd\u5c0f\u7ed3',
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
    ? `\u7b2c 1 \u9875\uff08\u6700\u8fd1 ${pagination.memoryWindow} \u6761\uff09\u6309\u9700\u7f13\u5b58`
    : `\u7b2c 1-${effectiveCachedPageCount} \u9875\uff08\u6700\u8fd1 ${pagination.memoryWindow} \u6761\uff09\u6309\u9700\u7f13\u5b58`;
  const cacheStrategyText = totalPages > effectiveCachedPageCount
    ? `${cacheRangeText}\uff0c\u7b2c ${effectiveCachedPageCount + 1} \u9875\u8d77\u6309\u9700\u52a0\u8f7d\u5386\u53f2\u8bb0\u5f55\u3002`
    : `${cacheRangeText}\uff0c\u5f53\u524d\u603b\u9875\u6570\u90fd\u5728\u7f13\u5b58\u8303\u56f4\u5185\u3002`;
  const retentionText = `\u5217\u8868\u4ec5\u4fdd\u7559\u6700\u8fd1 ${pagination.maxStore} \u6761\u65e5\u5fd7\uff0c\u8d85\u51fa\u540e\u4f1a\u81ea\u52a8\u6eda\u52a8\u8986\u76d6\u66f4\u65e9\u8bb0\u5f55\u3002`;

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
      alert('\u52a0\u8f7d\u4f7f\u7528\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
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
      alert('\u52a0\u8f7d\u4f7f\u7528\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setPageLoading(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u6761\u4f7f\u7528\u8bb0\u5f55\u5417\uff1f')) {
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
      alert('\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setDeleting(null);
      setPageLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsAndStats();
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-sm text-zinc-500">\u6b63\u5728\u52a0\u8f7d\u6570\u636e...</div>;
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
            <h2 className="mb-2 text-[28px] font-semibold tracking-tight text-zinc-900 sm:text-[30px]">\u4f7f\u7528\u8bb0\u5f55</h2>
            <p className="text-[13px] font-medium text-zinc-500">
              \u7edf\u4e00\u67e5\u770b\u8c03\u7528\u7edf\u8ba1\u3001IP \u6765\u6e90\u3001\u529f\u80fd\u4f7f\u7528\u60c5\u51b5\u548c\u5220\u9664\u64cd\u4f5c\u3002
            </p>
          </div>

          <button
            onClick={fetchLogsAndStats}
            className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white shadow-md transition-all active:scale-95 hover:bg-black"
          >
            <RefreshCw size={15} />
            \u5237\u65b0\u6570\u636e
          </button>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            const splitStats = 'splitKey' in stat ? stats[stat.splitKey] : null;
            const value = splitStats ? `${splitStats.ocr}|${splitStats.summary}` : stats[stat.key];
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
                <div className="text-[32px] font-semibold leading-none tracking-tight">{value}</div>
                <div className={`mt-3 text-[12px] font-medium ${noteClass}`}>
                  {index === 0
                    ? '\u7d2f\u8ba1\u529f\u80fd\u8c03\u7528'
                    : index === 1
                      ? '\u5f53\u5929\u8bf7\u6c42\u6ce2\u52a8'
                      : index === 2
                        ? '\u6708\u5ea6\u7d2f\u8ba1\u8d8b\u52bf'
                        : '\u6d3b\u8dc3\u7528\u6237\u8986\u76d6'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-2 sm:px-0">
        <div className="mb-4 px-2">
          <h3 className="text-[18px] font-semibold text-zinc-800">\u6700\u8fd1\u65e5\u5fd7</h3>
          <p className="text-[13px] text-zinc-400">
            {`\u5206\u9875\u89c4\u5219\uff1a\u6bcf\u9875 ${pageSize} \u6761\u3002${cacheStrategyText}`}
          </p>
          <p className="mt-1 text-[13px] text-zinc-400">{retentionText}</p>
        </div>

        <div className="hidden grid-cols-[90px_minmax(0,1fr)_120px_100px_80px_80px_80px] items-center gap-x-6 px-8 py-3 text-[13px] font-medium text-zinc-400 xl:grid">
          <div>\u65f6\u95f4</div>
          <div>\u7528\u6237\u4fe1\u606f</div>
          <div>IP \u5f52\u5c5e\u5730</div>
          <div>\u529f\u80fd</div>
          <div>\u672c\u6708\u6b21\u6570</div>
          <div>\u529f\u80fd\u7d2f\u8ba1</div>
          <div className="text-right">\u64cd\u4f5c</div>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-200 bg-white/30 py-16 text-center text-[15px] text-zinc-500">
            \u6682\u65e0\u4f7f\u7528\u8bb0\u5f55
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

                  <div className="text-[13px] font-medium text-zinc-600">{log.ipLocation || '\u672a\u77e5'}</div>

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
                      {deleting === log.id ? '\u5220\u9664\u4e2d...' : '\u5220\u9664'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-2">
          <p className="text-[13px] text-zinc-500">
            {`\u7b2c ${currentPage} / ${totalPages} \u9875 \u00b7 \u5f53\u524d\u663e\u793a ${startIndex}-${endIndex}\uff0c\u5171 ${pagination.totalCount} \u6761`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={pageLoading || currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[13px] font-medium text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={14} />
              <span>\u4e0a\u4e00\u9875</span>
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={pageLoading || currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[13px] font-medium text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>\u4e0b\u4e00\u9875</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {pageLoading ? (
          <div className="mt-3 px-2 text-[12px] text-zinc-400">\u6b63\u5728\u52a0\u8f7d\u5f53\u524d\u9875...</div>
        ) : null}
      </div>
    </div>
  );
}
