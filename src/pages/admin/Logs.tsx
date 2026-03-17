import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity, BarChart3, Calendar, Trash2, Users } from 'lucide-react';

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

  const statCards = [
    { label: '总调用次数', value: stats.totalCalls, icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: '今日调用', value: stats.todayCalls, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: '本月调用', value: stats.monthCalls, icon: Calendar, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: '总用户数', value: stats.totalUsers, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">使用记录</h2>
          <p className="mt-2 text-slate-500">本页集中展示整体数据与接口调用记录，方便统一查看。</p>
        </div>
        <button
          onClick={fetchLogsAndStats}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          刷新数据
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className={`rounded-2xl p-4 ${card.bg} ${card.color}`}>
                <card.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="px-6 py-4 font-medium">时间</th>
                <th className="px-6 py-4 font-medium">用户信息</th>
                <th className="px-6 py-4 font-medium">IP 属地</th>
                <th className="px-6 py-4 font-medium">功能</th>
                <th className="px-6 py-4 font-medium">本月次数</th>
                <th className="px-6 py-4 font-medium">累计次数</th>
                <th className="px-6 py-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {logs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {format(new Date(log.usedAt), 'yyyy-MM-dd HH:mm:ss')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-[180px] truncate font-medium text-slate-900" title={log.userId}>
                      {log.userId}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{log.ip || 'unknown'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{log.ipLocation || '未知'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        log.feature === 'ocr' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {log.feature === 'ocr' ? '智能 OCR' : '智能小结'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">{log.monthlyUsedCount}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{log.totalUsedCount}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleDelete(log.id)}
                      disabled={deleting === log.id}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-red-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      {deleting === log.id ? '删除中...' : '删除'}
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    暂无使用记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
