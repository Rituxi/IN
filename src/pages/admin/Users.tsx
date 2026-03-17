import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, RefreshCw, Plus, Edit2, Shield, ShieldAlert, ShieldCheck, Users as UsersIcon, Crown, Star } from 'lucide-react';

type UserLevel = 'care' | 'care_plus' | 'king';

interface User {
  userId: string;
  level: UserLevel;
  ocrUsed: number;
  ocrLimit: number;
  summaryUsed: number;
  summaryLimit: number;
  extraQuota: number;
  totalUsedCount: number;
  isUnlimited: boolean;
  isPro: boolean;
  firstUsedAt: string;
  note: string;
  status: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<UserLevel | 'all'>('all');

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

  const handleUpdateUser = async (userId: string, data: Partial<User>) => {
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

  const levelStats = useMemo(() => {
    const stats = { all: users.length, care: 0, care_plus: 0, king: 0 };
    users.forEach(u => {
      if (u.level === 'care') stats.care++;
      else if (u.level === 'care_plus') stats.care_plus++;
      else if (u.level === 'king') stats.king++;
    });
    return stats;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = search === '' || 
        u.userId.toLowerCase().includes(search.toLowerCase()) || 
        (u.note && u.note.toLowerCase().includes(search.toLowerCase()));
      const matchLevel = filterLevel === 'all' || u.level === filterLevel;
      return matchSearch && matchLevel;
    });
  }, [users, search, filterLevel]);

  const getLevelBadge = (level: UserLevel) => {
    switch (level) {
      case 'king': 
        return <span className="flex items-center space-x-1.5 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-200"><Crown size={14} /><span>King</span></span>;
      case 'care_plus': 
        return <span className="flex items-center space-x-1.5 text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg text-xs font-semibold border border-indigo-200"><Star size={14} /><span>Care+</span></span>;
      default: 
        return <span className="flex items-center space-x-1.5 text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200"><Shield size={14} /><span>Care</span></span>;
    }
  };

  const getLevelLabel = (level: UserLevel | 'all') => {
    const labels: Record<UserLevel | 'all', string> = {
      all: '全部',
      care: 'Care',
      care_plus: 'Care+',
      king: 'King'
    };
    return labels[level];
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">用户管理</h2>
          <p className="text-slate-500 mt-2">共 {users.length} 名用户，当前显示 {filteredUsers.length} 名</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={fetchUsers} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button 
          onClick={() => setFilterLevel('all')}
          className={`p-4 rounded-2xl border-2 transition-all text-left ${
            filterLevel === 'all' 
              ? 'bg-slate-900 border-slate-900 text-white' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center space-x-2 mb-2">
            <UsersIcon size={20} className={filterLevel === 'all' ? 'text-white' : 'text-slate-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'all' ? 'text-white' : 'text-slate-500'}`}>全部用户</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'all' ? 'text-white' : 'text-slate-900'}`}>{levelStats.all}</div>
        </button>

        <button 
          onClick={() => setFilterLevel('care')}
          className={`p-4 rounded-2xl border-2 transition-all text-left ${
            filterLevel === 'care' 
              ? 'bg-slate-600 border-slate-600 text-white' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center space-x-2 mb-2">
            <Shield size={20} className={filterLevel === 'care' ? 'text-white' : 'text-slate-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'care' ? 'text-white' : 'text-slate-500'}`}>Care</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'care' ? 'text-white' : 'text-slate-900'}`}>{levelStats.care}</div>
        </button>

        <button 
          onClick={() => setFilterLevel('care_plus')}
          className={`p-4 rounded-2xl border-2 transition-all text-left ${
            filterLevel === 'care_plus' 
              ? 'bg-indigo-600 border-indigo-600 text-white' 
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center space-x-2 mb-2">
            <Star size={20} className={filterLevel === 'care_plus' ? 'text-white' : 'text-indigo-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'care_plus' ? 'text-white' : 'text-slate-500'}`}>Care+</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'care_plus' ? 'text-white' : 'text-slate-900'}`}>{levelStats.care_plus}</div>
        </button>

        <button 
          onClick={() => setFilterLevel('king')}
          className={`p-4 rounded-2xl border-2 transition-all text-left ${
            filterLevel === 'king' 
              ? 'bg-amber-500 border-amber-500 text-white' 
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center space-x-2 mb-2">
            <Crown size={20} className={filterLevel === 'king' ? 'text-white' : 'text-amber-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'king' ? 'text-white' : 'text-slate-500'}`}>King</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'king' ? 'text-white' : 'text-slate-900'}`}>{levelStats.king}</div>
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="搜索用户 ID 或备注..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
            />
          </div>
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
              {filteredUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 font-medium text-slate-900 truncate max-w-[120px]" title={user.userId}>
                    {user.userId}
                  </td>
                  <td className="py-4 px-6">
                    {getLevelBadge(user.level)}
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    {user.isUnlimited ? <span className="text-amber-600 font-medium">无限</span> : `${user.ocrUsed} / ${user.ocrLimit}`}
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    {user.isUnlimited ? <span className="text-amber-600 font-medium">无限</span> : `${user.summaryUsed} / ${user.summaryLimit}`}
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-emerald-600 font-medium">+{user.extraQuota || 0}</span>
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
                  <td className="py-4 px-6 text-right space-x-1 whitespace-nowrap">
                    <button 
                      onClick={() => handleAddQuota(user.userId, user.extraQuota || 0)} 
                      className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-lg transition-colors" 
                      title="增加额度"
                    >
                      <Plus size={16} />
                    </button>
                    <button 
                      onClick={() => handleUpdateNote(user.userId, user.note || '')} 
                      className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors" 
                      title="修改备注"
                    >
                      <Edit2 size={16} />
                    </button>
                    
                    <select
                      value={user.level}
                      onChange={(e) => handleUpdateUser(user.userId, { level: e.target.value as UserLevel })}
                      className="ml-2 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="care">Care</option>
                      <option value="care_plus">Care+</option>
                      <option value="king">King</option>
                    </select>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center space-y-2">
                      <UsersIcon size={40} className="text-slate-300" />
                      <span>未找到匹配的用户</span>
                    </div>
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
