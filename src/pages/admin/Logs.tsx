import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity, BarChart3, Calendar, FileText, RefreshCw, Trash2, Users } from 'lucide-react';

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

const statCards = [
  { key: 'totalCalls', splitKey: 'totalCallsByFeature', label: '\u603b\u8c03\u7528\u6b21\u6570', icon: BarChart3 },
  { key: 'todayCalls', splitKey: 'todayCallsByFeature', label: '\u4eca\u65e5\u8c03\u7528', icon: Activity },
  { key: 'monthCalls', splitKey: 'monthCallsByFeature', label: '\u672c\u6708\u8c03\u7528', icon: Calendar },
  { key: 'totalUsers', label: '\u603b\u7528\u6237\u6570', icon: Users },
] as const;

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
  const [stats, setStats] = useState<UsageStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchLogsAndStats = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const headers = { Authorization: `Bearer ${token}` };
      const [logsRes, statsRes] = await Promise.all([
        fetch('/api/admin/logs', { headers }),
        fetch('/api/admin/stats', { headers }),
      ]);

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(Array.isArray(logsData) ? logsData : []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(normalizeUsageStats(statsData));
      }
    } catch (error) {
      console.error(error);
      alert('加载使用记录失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!window.confirm('确定要删除这条使用记录吗？')) {
      return;
    }

    setDeleting(logId);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/logs/${logId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }

      setLogs((current) => current.filter((log) => log.id !== logId));
    } catch (error) {
      console.error(error);
      alert('删除失败，请稍后重试。');
    } finally {
      setDeleting(null);
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

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            const splitStats = 'splitKey' in stat ? stats[stat.splitKey] : null;
            const value = splitStats ? `${splitStats.ocr}|${splitStats.summary}` : stats[stat.key];
            const cardClass = 'bg-white/45 text-zinc-900';
            const iconClass = index === 0 ? 'bg-zinc-100/80 text-zinc-500' : 'bg-zinc-100/80 text-zinc-500';
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
                  {index === 0 ? '累计功能调用' : index === 1 ? '当天请求波动' : index === 2 ? '月度累计趋势' : '活跃用户覆盖'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-2 sm:px-0">
        <div className="px-2 mb-4">
          <h3 className="text-[18px] font-semibold text-zinc-800">最近日志</h3>
          <p className="text-[13px] text-zinc-400">默认展示最近 100 条记录，删除操作仍然直接调用原来的后台接口。</p>
        </div>

        <div className="hidden grid-cols-[90px_minmax(0,1fr)_120px_100px_80px_80px_80px] gap-x-6 items-center px-8 py-3 text-[13px] font-medium text-zinc-400 xl:grid">
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
      </div>
    </div>
  );
}
