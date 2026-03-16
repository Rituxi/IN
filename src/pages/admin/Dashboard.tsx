import { useState, useEffect } from 'react';
import { Activity, Users, Calendar, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalCalls: 0, todayCalls: 0, monthCalls: 0, totalUsers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` }
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
    { label: '总调用次数', value: stats.totalCalls, icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: '今日调用', value: stats.todayCalls, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: '本月调用', value: stats.monthCalls, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '总用户数', value: stats.totalUsers, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  if (loading) return <div className="p-8 text-center text-slate-500">加载中...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">数据概览</h2>
        <p className="text-slate-500 mt-2">查看系统整体使用情况</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center space-x-4">
            <div className={`p-4 rounded-2xl ${card.bg} ${card.color}`}>
              <card.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">{card.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
