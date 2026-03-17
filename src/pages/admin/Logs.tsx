import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    setDeleting(logId);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/logs/${logId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(logs.filter(log => log.id !== logId));
      } else {
        alert('删除失败，请稍后重试');
      }
    } catch (err) {
      console.error(err);
      alert('删除失败，网络错误');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">加载中...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">使用记录</h2>
        <p className="text-slate-500 mt-2">查看用户调用 API 的详细记录</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                <th className="py-4 px-6 font-medium">时间</th>
                <th className="py-4 px-6 font-medium">用户信息</th>
                <th className="py-4 px-6 font-medium">属地</th>
                <th className="py-4 px-6 font-medium">功能</th>
                <th className="py-4 px-6 font-medium">本月次数</th>
                <th className="py-4 px-6 font-medium">累计次数</th>
                <th className="py-4 px-6 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {logs.map((log, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 text-slate-500 whitespace-nowrap">
                    {format(new Date(log.usedAt), 'yyyy-MM-dd HH:mm:ss')}
                  </td>
                  <td className="py-4 px-6">
                    <div className="font-medium text-slate-900 truncate max-w-[150px]" title={log.userId}>
                      {log.userId}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">{log.ip}</div>
                  </td>
                  <td className="py-4 px-6 text-slate-500">{log.ipLocation}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      log.feature === 'ocr' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {log.feature === 'ocr' ? '智能 OCR' : '智能小结'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-900">{log.monthlyUsedCount}</td>
                  <td className="py-4 px-6 text-slate-900">{log.totalUsedCount}</td>
                  <td className="py-4 px-6">
                    <button
                      onClick={() => handleDelete(log.id)}
                      disabled={deleting === log.id}
                      className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {deleting === log.id ? '删除中...' : '删除'}
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">暂无记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
