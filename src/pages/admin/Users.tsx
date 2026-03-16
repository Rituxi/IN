import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Search, RefreshCw, Plus, Edit2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateUser = async (userId: string, data: any) => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddQuota = (userId: string, currentExtra: number) => {
    const amount = prompt('请输入要增加的额度次数:', '10');
    if (amount && !isNaN(Number(amount))) {
      handleUpdateUser(userId, { extraQuota: currentExtra + Number(amount) });
    }
  };

  const handleUpdateNote = (userId: string, currentNote: string) => {
    const note = prompt('请输入备注信息:', currentNote);
    if (note !== null) {
      handleUpdateUser(userId, { note });
    }
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = u.userId.includes(search) || (u.note && u.note.includes(search));
    const matchLevel = filterLevel === 'all' || u.level === filterLevel;
    return matchSearch && matchLevel;
  });

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'king': return <span className="flex items-center space-x-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-md text-xs font-medium"><ShieldCheck size={14} /><span>King</span></span>;
      case 'care_plus': return <span className="flex items-center space-x-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md text-xs font-medium"><Shield size={14} /><span>Care+</span></span>;
      default: return <span className="flex items-center space-x-1 text-slate-600 bg-slate-100 px-2 py-1 rounded-md text-xs font-medium"><ShieldAlert size={14} /><span>Care</span></span>;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">用户管理</h2>
          <p className="text-slate-500 mt-2">共 {filteredUsers.length} 名用户</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={fetchUsers} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="搜索用户 ID 或备注..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
            />
          </div>
          <select 
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm font-medium text-slate-700"
          >
            <option value="all">所有等级</option>
            <option value="care">Care (普通)</option>
            <option value="care_plus">Care+ (高级)</option>
            <option value="king">King (无限)</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                <th className="py-4 px-6 font-medium">用户 ID</th>
                <th className="py-4 px-6 font-medium">等级状态</th>
                <th className="py-4 px-6 font-medium">OCR 额度</th>
                <th className="py-4 px-6 font-medium">小结额度</th>
                <th className="py-4 px-6 font-medium">额外额度</th>
                <th className="py-4 px-6 font-medium">累计使用</th>
                <th className="py-4 px-6 font-medium">加入日期</th>
                <th className="py-4 px-6 font-medium">备注</th>
                <th className="py-4 px-6 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filteredUsers.map((user, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 font-medium text-slate-900 truncate max-w-[120px]" title={user.userId}>
                    {user.userId}
                  </td>
                  <td className="py-4 px-6">
                    {getLevelBadge(user.level)}
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    {user.isUnlimited ? '无限' : `${user.ocrUsed} / ${user.ocrLimit}`}
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    {user.isUnlimited ? '无限' : `${user.summaryUsed} / ${user.summaryLimit}`}
                  </td>
                  <td className="py-4 px-6 text-emerald-600 font-medium">
                    +{user.extraQuota || 0}
                  </td>
                  <td className="py-4 px-6 text-slate-900 font-medium">
                    {user.totalUsedCount}
                  </td>
                  <td className="py-4 px-6 text-slate-500 whitespace-nowrap">
                    {format(new Date(user.firstUsedAt), 'yyyy-MM-dd')}
                  </td>
                  <td className="py-4 px-6 text-slate-500 max-w-[150px] truncate" title={user.note}>
                    {user.note || '-'}
                  </td>
                  <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => handleAddQuota(user.userId, user.extraQuota || 0)} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-lg transition-colors" title="增加额度">
                      <Plus size={16} />
                    </button>
                    <button onClick={() => handleUpdateNote(user.userId, user.note || '')} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors" title="修改备注">
                      <Edit2 size={16} />
                    </button>
                    
                    {user.level !== 'king' && (
                      <button onClick={() => handleUpdateUser(user.userId, { level: 'king' })} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg transition-colors text-xs font-medium" title="升级为 King">
                        升 King
                      </button>
                    )}
                    {user.level !== 'care_plus' && (
                      <button onClick={() => handleUpdateUser(user.userId, { level: 'care_plus' })} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors text-xs font-medium" title="设为 Care+">
                        设 Care+
                      </button>
                    )}
                    {user.level !== 'care' && (
                      <button onClick={() => handleUpdateUser(user.userId, { level: 'care' })} className="text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors text-xs font-medium" title="降级为 Care">
                        降 Care
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">未找到匹配的用户</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
