import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Crown, Edit2, Plus, RefreshCw, Search, Shield, Star, Users as UsersIcon } from 'lucide-react';

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
  group: string;
}

const DEFAULT_GROUP = '未分组';

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<string[]>([DEFAULT_GROUP]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<UserLevel | 'all'>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [newGroup, setNewGroup] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    });
    if (!res.ok) {
      throw new Error('Failed to fetch users');
    }
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  const fetchGroups = async () => {
    const res = await fetch('/api/admin/user-groups', {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    });
    if (!res.ok) {
      throw new Error('Failed to fetch groups');
    }
    const data = await res.json();
    const nextGroups = Array.isArray(data.groups) ? data.groups : [DEFAULT_GROUP];
    setGroups(nextGroups.length > 0 ? nextGroups : [DEFAULT_GROUP]);
  };

  const reloadPageData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchUsers(), fetchGroups()]);
    } catch (error) {
      console.error(error);
      alert('加载用户数据失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadPageData();
  }, []);

  const handleUpdateUser = async (userId: string, data: Partial<User>) => {
    setSavingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error('Failed to update user');
      }

      const updatedUser = await res.json();
      setUsers((current) => current.map((user) => (user.userId === userId ? updatedUser : user)));

      if (typeof updatedUser.group === 'string' && updatedUser.group.trim()) {
        setGroups((current) => {
          const next = new Set(current);
          next.add(updatedUser.group);
          next.add(DEFAULT_GROUP);
          return Array.from(next);
        });
      }
    } catch (error) {
      console.error(error);
      alert('用户更新失败，请稍后重试。');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleAddQuota = (userId: string, currentExtra: number) => {
    const amount = window.prompt('请输入要增加的额度次数', '10');
    if (amount === null) return;

    const quota = Number(amount);
    if (!Number.isFinite(quota) || quota <= 0) {
      alert('请输入大于 0 的数字。');
      return;
    }

    handleUpdateUser(userId, { extraQuota: currentExtra + quota });
  };

  const handleUpdateNote = (userId: string, currentNote: string) => {
    const note = window.prompt('请输入备注信息', currentNote || '');
    if (note === null) return;
    handleUpdateUser(userId, { note });
  };

  const handleCreateGroup = async () => {
    const group = newGroup.trim();
    if (!group) {
      alert('请先输入分组名称。');
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await fetch('/api/admin/user-groups', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ group }),
      });

      if (!res.ok) {
        throw new Error('Failed to create group');
      }

      const data = await res.json();
      const nextGroups = Array.isArray(data.groups) ? data.groups : [DEFAULT_GROUP, group];
      setGroups(nextGroups);
      setFilterGroup(group);
      setNewGroup('');
    } catch (error) {
      console.error(error);
      alert('创建分组失败，请稍后重试。');
    } finally {
      setCreatingGroup(false);
    }
  };

  const levelStats = useMemo(() => {
    const stats = { all: users.length, care: 0, care_plus: 0, king: 0 };
    users.forEach((user) => {
      stats[user.level] += 1;
    });
    return stats;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const keyword = search.trim().toLowerCase();
      const matchSearch =
        keyword === '' ||
        user.userId.toLowerCase().includes(keyword) ||
        (user.note || '').toLowerCase().includes(keyword) ||
        (user.group || DEFAULT_GROUP).toLowerCase().includes(keyword);
      const matchLevel = filterLevel === 'all' || user.level === filterLevel;
      const currentGroup = user.group || DEFAULT_GROUP;
      const matchGroup = filterGroup === 'all' || currentGroup === filterGroup;
      return matchSearch && matchLevel && matchGroup;
    });
  }, [filterGroup, filterLevel, search, users]);

  const getLevelBadge = (level: UserLevel) => {
    if (level === 'king') {
      return (
        <span className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
          <Crown size={14} />
          <span>King</span>
        </span>
      );
    }

    if (level === 'care_plus') {
      return (
        <span className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">
          <Star size={14} />
          <span>Care+</span>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        <Shield size={14} />
        <span>Care</span>
      </span>
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">用户管理</h2>
          <p className="mt-2 text-slate-500">
            共 {users.length} 个用户，当前显示 {filteredUsers.length} 个。
          </p>
        </div>
        <button
          onClick={reloadPageData}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button
          onClick={() => setFilterLevel('all')}
          className={`rounded-2xl border-2 p-4 text-left transition-all ${
            filterLevel === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <UsersIcon size={20} className={filterLevel === 'all' ? 'text-white' : 'text-slate-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'all' ? 'text-white' : 'text-slate-500'}`}>全部用户</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'all' ? 'text-white' : 'text-slate-900'}`}>{levelStats.all}</div>
        </button>

        <button
          onClick={() => setFilterLevel('care')}
          className={`rounded-2xl border-2 p-4 text-left transition-all ${
            filterLevel === 'care' ? 'border-slate-600 bg-slate-600 text-white' : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <Shield size={20} className={filterLevel === 'care' ? 'text-white' : 'text-slate-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'care' ? 'text-white' : 'text-slate-500'}`}>Care</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'care' ? 'text-white' : 'text-slate-900'}`}>{levelStats.care}</div>
        </button>

        <button
          onClick={() => setFilterLevel('care_plus')}
          className={`rounded-2xl border-2 p-4 text-left transition-all ${
            filterLevel === 'care_plus'
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-slate-200 bg-white hover:border-indigo-300'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <Star size={20} className={filterLevel === 'care_plus' ? 'text-white' : 'text-indigo-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'care_plus' ? 'text-white' : 'text-slate-500'}`}>Care+</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'care_plus' ? 'text-white' : 'text-slate-900'}`}>{levelStats.care_plus}</div>
        </button>

        <button
          onClick={() => setFilterLevel('king')}
          className={`rounded-2xl border-2 p-4 text-left transition-all ${
            filterLevel === 'king' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-200 bg-white hover:border-amber-300'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <Crown size={20} className={filterLevel === 'king' ? 'text-white' : 'text-amber-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'king' ? 'text-white' : 'text-slate-500'}`}>King</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'king' ? 'text-white' : 'text-slate-900'}`}>{levelStats.king}</div>
        </button>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-4 border-b border-slate-100 p-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_220px_1fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="搜索用户 ID、备注、分组"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={filterGroup}
              onChange={(event) => setFilterGroup(event.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部分组</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="text"
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
                placeholder="新建自定义分组"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingGroup ? '创建中...' : '新建分组'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="px-6 py-4 font-medium">用户 ID</th>
                <th className="px-6 py-4 font-medium">分组</th>
                <th className="px-6 py-4 font-medium">等级</th>
                <th className="px-6 py-4 font-medium">OCR 额度</th>
                <th className="px-6 py-4 font-medium">小结额度</th>
                <th className="px-6 py-4 font-medium">额外额度</th>
                <th className="px-6 py-4 font-medium">累计使用</th>
                <th className="px-6 py-4 font-medium">加入日期</th>
                <th className="px-6 py-4 font-medium">备注</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.map((user) => {
                const isSaving = savingUserId === user.userId;
                const currentGroup = user.group || DEFAULT_GROUP;

                return (
                  <tr key={user.userId} className="transition-colors hover:bg-slate-50">
                    <td className="max-w-[160px] truncate px-6 py-4 font-medium text-slate-900" title={user.userId}>
                      {user.userId}
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={currentGroup}
                        disabled={isSaving}
                        onChange={(event) => handleUpdateUser(user.userId, { group: event.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {groups.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">{getLevelBadge(user.level)}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {user.isUnlimited ? <span className="font-medium text-amber-600">无限</span> : `${user.ocrUsed} / ${user.ocrLimit}`}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {user.isUnlimited ? <span className="font-medium text-amber-600">无限</span> : `${user.summaryUsed} / ${user.summaryLimit}`}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-emerald-600">+{user.extraQuota || 0}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{user.totalUsedCount}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                      {format(new Date(user.firstUsedAt), 'yyyy-MM-dd')}
                    </td>
                    <td className="max-w-[180px] truncate px-6 py-4 text-slate-500" title={user.note || ''}>
                      {user.note || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => handleAddQuota(user.userId, user.extraQuota || 0)}
                          disabled={isSaving}
                          className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title="增加额度"
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          onClick={() => handleUpdateNote(user.userId, user.note || '')}
                          disabled={isSaving}
                          className="rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title="修改备注"
                        >
                          <Edit2 size={16} />
                        </button>
                        <select
                          value={user.level}
                          disabled={isSaving}
                          onChange={(event) => handleUpdateUser(user.userId, { level: event.target.value as UserLevel })}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          title="调整等级"
                        >
                          <option value="care">Care</option>
                          <option value="care_plus">Care+</option>
                          <option value="king">King</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <UsersIcon size={40} className="text-slate-300" />
                      <span>没有找到匹配的用户</span>
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
