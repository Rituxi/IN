import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Key, Trash2, Copy, RefreshCw, Plus } from 'lucide-react';

export default function Redeem() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generateType, setGenerateType] = useState('care_plus');
  const [generateCount, setGenerateCount] = useState(1);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/redeem', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCodes(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const handleGenerate = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/redeem', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ type: generateType, count: generateCount })
      });
      if (res.ok) {
        fetchCodes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm('确定要删除这个兑换码吗？')) return;
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/redeem/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchCodes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    alert('已复制到剪贴板');
  };

  const unusedCodes = codes.filter(c => c.status === 'unused');

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">兑换码管理</h2>
          <p className="text-slate-500 mt-2">生成和管理等级兑换码</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={fetchCodes} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-slate-700">生成类型</label>
          <select 
            value={generateType}
            onChange={(e) => setGenerateType(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm font-medium text-slate-700"
          >
            <option value="care_plus">Care+ (高级)</option>
            <option value="king">King (无限)</option>
          </select>
        </div>
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-slate-700">生成数量</label>
          <input 
            type="number" 
            min="1" max="50"
            value={generateCount}
            onChange={(e) => setGenerateCount(Number(e.target.value))}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
          />
        </div>
        <button 
          onClick={handleGenerate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center space-x-2"
        >
          <Plus size={18} />
          <span>批量生成</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-medium text-slate-700 flex items-center space-x-2">
            <Key size={18} className="text-indigo-500" />
            <span>可用兑换码 ({unusedCodes.length})</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">已使用或删除的兑换码不会显示在此列表中。</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-sm">
                <th className="py-4 px-6 font-medium">兑换码</th>
                <th className="py-4 px-6 font-medium">类型</th>
                <th className="py-4 px-6 font-medium">生成时间</th>
                <th className="py-4 px-6 font-medium">过期时间</th>
                <th className="py-4 px-6 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {unusedCodes.map((code, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 font-mono text-slate-900 font-medium tracking-wide">
                    {code.code}
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      code.type === 'king' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {code.type === 'king' ? 'King' : 'Care+'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-500 whitespace-nowrap">
                    {format(new Date(code.createdAt), 'yyyy-MM-dd HH:mm')}
                  </td>
                  <td className="py-4 px-6 text-slate-500 whitespace-nowrap">
                    {format(new Date(code.expiredAt), 'yyyy-MM-dd')}
                  </td>
                  <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => handleCopy(code.code)} className="text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors" title="复制">
                      <Copy size={16} />
                    </button>
                    <button onClick={() => handleDelete(code.code)} className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="删除">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {unusedCodes.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">暂无可用兑换码</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
