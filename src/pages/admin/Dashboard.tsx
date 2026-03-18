import { useEffect, useState } from 'react';
import { Activity, BarChart3, Calendar, Users } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalCalls: 0, todayCalls: 0, monthCalls: 0, totalUsers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: '总调用次数', value: stats.totalCalls, icon: BarChart3, tone: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]' },
    { label: '今日调用', value: stats.todayCalls, icon: Activity, tone: 'bg-emerald-50 text-emerald-700' },
    { label: '本月调用', value: stats.monthCalls, icon: Calendar, tone: 'bg-sky-50 text-sky-700' },
    { label: '总用户数', value: stats.totalUsers, icon: Users, tone: 'bg-[var(--color-accent-50)] text-amber-700' },
  ];

  if (loading) {
    return <div className="p-10 text-center text-sm text-[var(--color-ink-700)]">正在加载统计数据...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-[linear-gradient(135deg,rgba(47,127,121,0.12),rgba(255,255,255,0.96))] p-6">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-700)]">Dashboard</div>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--color-ink-950)]">数据概览</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">查看系统整体调用量、活跃用户和近期趋势。</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article
            key={card.label}
            className="rounded-[28px] border border-[var(--color-ink-200)] bg-white px-5 py-5 shadow-[0_18px_50px_-36px_rgba(16,33,43,0.32)]"
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${card.tone}`}>
                <card.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-ink-700)]">{card.label}</p>
                <p className="mt-1 text-3xl font-extrabold text-[var(--color-ink-950)]">{card.value}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
