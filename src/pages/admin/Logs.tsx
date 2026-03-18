import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity, BarChart3, Calendar, RefreshCw, Trash2, Users } from 'lucide-react';

interface UsageStats {
  totalCalls: number;
  todayCalls: number;
  monthCalls: number;
  totalUsers: number;
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
};

const statCards = [
  { key: 'totalCalls', label: '总调用次数', icon: BarChart3, tone: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]' },
  { key: 'todayCalls', label: '今日调用', icon: Activity, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'monthCalls', label: '本月调用', icon: Calendar, tone: 'bg-sky-50 text-sky-700' },
  { key: 'totalUsers', label: '总用户数', icon: Users, tone: 'bg-[var(--color-accent-50)] text-amber-700' },
] as const;

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
        setStats({
          totalCalls: Number(statsData.totalCalls || 0),
          todayCalls: Number(statsData.todayCalls || 0),
          monthCalls: Number(statsData.monthCalls || 0),
          totalUsers: Number(statsData.totalUsers || 0),
        });
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
    return <div className="p-10 text-center text-sm text-[var(--color-ink-700)]">正在加载数据...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-[linear-gradient(135deg,rgba(47,127,121,0.12),rgba(255,248,236,0.78))] p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-700)]">Logs Overview</div>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--color-ink-950)]">使用记录</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">集中查看调用统计、用户来源和每次功能使用情况，便于追踪问题和运营分析。</p>
        </div>
        <button
          onClick={fetchLogsAndStats}
          className="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-white/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-900)] transition hover:bg-white"
        >
          <RefreshCw size={16} />
          刷新数据
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = stats[card.key];
          return (
            <article
              key={card.key}
              className="rounded-[28px] border border-[var(--color-ink-200)] bg-white px-5 py-5 shadow-[0_18px_50px_-36px_rgba(16,33,43,0.32)]"
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${card.tone}`}>
                  <Icon size={24} />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--color-ink-700)]">{card.label}</div>
                  <div className="mt-1 text-3xl font-extrabold text-[var(--color-ink-950)]">{value}</div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-[30px] border border-[var(--color-ink-200)] bg-white shadow-[0_18px_60px_-38px_rgba(16,33,43,0.35)]">
        <div className="border-b border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-6 py-4">
          <h3 className="text-lg font-bold text-[var(--color-ink-950)]">最近日志</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-700)]">默认展示最近 100 条记录。</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-white text-sm text-[var(--color-ink-700)]">
              <tr className="border-b border-[var(--color-ink-200)]">
                <th className="px-6 py-4 font-semibold">时间</th>
                <th className="px-6 py-4 font-semibold">用户信息</th>
                <th className="px-6 py-4 font-semibold">IP 归属地</th>
                <th className="px-6 py-4 font-semibold">功能</th>
                <th className="px-6 py-4 font-semibold">本月次数</th>
                <th className="px-6 py-4 font-semibold">该功能累计</th>
                <th className="px-6 py-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-ink-100)] text-sm text-[var(--color-ink-900)]">
              {logs.map((log) => (
                <tr key={log.id} className="transition hover:bg-[var(--color-brand-50)]/50">
                  <td className="whitespace-nowrap px-6 py-4 text-[var(--color-ink-700)]">{format(new Date(log.usedAt), 'yyyy-MM-dd HH:mm:ss')}</td>
                  <td className="px-6 py-4">
                    <div className="max-w-[220px] truncate font-semibold text-[var(--color-ink-950)]" title={log.userId}>
                      {log.userId}
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-ink-600)]">{log.ip || 'unknown'}</div>
                  </td>
                  <td className="px-6 py-4 text-[var(--color-ink-700)]">{log.ipLocation || '未知'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={[
                        'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                        log.feature === 'ocr' ? 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]' : 'bg-emerald-50 text-emerald-700',
                      ].join(' ')}
                    >
                      {log.feature === 'ocr' ? '智能 OCR' : '智能小结'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold">{log.monthlyUsedCount}</td>
                  <td className="px-6 py-4 font-semibold">{log.totalUsedCount}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(log.id)}
                      disabled={deleting === log.id}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      {deleting === log.id ? '删除中...' : '删除'}
                    </button>
                  </td>
                </tr>
              ))}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-[var(--color-ink-700)]">
                    暂无使用记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
