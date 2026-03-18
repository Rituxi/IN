import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Crown, Plus, RefreshCw, Search, Shield, Sparkles, Star, Users as UsersIcon } from 'lucide-react';

type UserLevel = 'care' | 'care_plus' | 'king';
type QuotaType = 'ocr' | 'summary';

interface User {
  userId: string;
  level: UserLevel;
  ocrUsed: number;
  ocrLimit: number;
  summaryUsed: number;
  summaryLimit: number;
  extraOcrQuota: number;
  extraSummaryQuota: number;
  totalUsedCount: number;
  isUnlimited: boolean;
  isPro: boolean;
  firstUsedAt: string;
  note: string;
  status: string;
  group: string;
}

interface QuotaDraft {
  ocr: string;
  summary: string;
}

const DEFAULT_GROUP = '未分组';

function getQuotaDraftValue(draft: QuotaDraft | undefined, type: QuotaType) {
  return draft?.[type] ?? '';
}

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
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, QuotaDraft>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

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
      return true;
    } catch (error) {
      console.error(error);
      alert('用户更新失败，请稍后重试。');
      return false;
    } finally {
      setSavingUserId(null);
    }
  };

  const handleQuotaDraftChange = (userId: string, type: QuotaType, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) {
      return;
    }

    setQuotaDrafts((current) => ({
      ...current,
      [userId]: {
        ocr: current[userId]?.ocr ?? '',
        summary: current[userId]?.summary ?? '',
        [type]: value,
      },
    }));
  };

  const handleAddQuota = async (user: User, type: QuotaType) => {
    const draftValue = getQuotaDraftValue(quotaDrafts[user.userId], type);
    const quota = Number(draftValue || 0);

    if (!Number.isFinite(quota) || quota <= 0) {
      alert(`请输入大于 0 的${type === 'ocr' ? 'OCR' : '智能小结'}额度。`);
      return;
    }

    const field = type === 'ocr' ? 'extraOcrQuota' : 'extraSummaryQuota';
    const currentValue = type === 'ocr' ? user.extraOcrQuota || 0 : user.extraSummaryQuota || 0;

    const success = await handleUpdateUser(user.userId, { [field]: currentValue + quota } as Partial<User>);

    if (!success) {
      return;
    }

    setQuotaDrafts((current) => ({
      ...current,
      [user.userId]: {
        ocr: type === 'ocr' ? '' : current[user.userId]?.ocr ?? '',
        summary: type === 'summary' ? '' : current[user.userId]?.summary ?? '',
      },
    }));
  };

  const handleNoteDraftChange = (userId: string, value: string) => {
    setNoteDrafts((current) => ({
      ...current,
      [userId]: value,
    }));
  };

  const handleSaveNote = async (user: User) => {
    const note = (noteDrafts[user.userId] ?? user.note ?? '').trim();
    await handleUpdateUser(user.userId, { note });
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
      const currentGroup = user.group || DEFAULT_GROUP;
      const noteText = (noteDrafts[user.userId] ?? user.note ?? '').toLowerCase();
      const matchSearch =
        keyword === '' ||
        user.userId.toLowerCase().includes(keyword) ||
        noteText.includes(keyword) ||
        currentGroup.toLowerCase().includes(keyword);
      const matchLevel = filterLevel === 'all' || user.level === filterLevel;
      const matchGroup = filterGroup === 'all' || currentGroup === filterGroup;
      return matchSearch && matchLevel && matchGroup;
    });
  }, [filterGroup, filterLevel, noteDrafts, search, users]);

  const getLevelBadge = (level: UserLevel) => {
    if (level === 'king') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          <Crown size={14} />
          <span>King</span>
        </span>
      );
    }

    if (level === 'care_plus') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          <Sparkles size={14} />
          <span>Care+</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
        <Shield size={14} />
        <span>Care</span>
      </span>
    );
  };

  const getQuotaText = (used: number, limit: number, extra: number, isUnlimited: boolean) => {
    if (isUnlimited) {
      return '无限';
    }
    return `${used}/${limit + extra}`;
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
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <button
          onClick={() => setFilterLevel('all')}
          className={`rounded-3xl border p-5 text-left transition-all ${
            filterLevel === 'all'
              ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="mb-3 flex items-center gap-2">
            <UsersIcon size={18} className={filterLevel === 'all' ? 'text-white' : 'text-slate-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'all' ? 'text-white' : 'text-slate-500'}`}>全部用户</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'all' ? 'text-white' : 'text-slate-900'}`}>{levelStats.all}</div>
        </button>

        <button
          onClick={() => setFilterLevel('care')}
          className={`rounded-3xl border p-5 text-left transition-all ${
            filterLevel === 'care'
              ? 'border-slate-700 bg-slate-700 text-white shadow-lg shadow-slate-700/10'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="mb-3 flex items-center gap-2">
            <Shield size={18} className={filterLevel === 'care' ? 'text-white' : 'text-slate-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'care' ? 'text-white' : 'text-slate-500'}`}>Care</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'care' ? 'text-white' : 'text-slate-900'}`}>{levelStats.care}</div>
        </button>

        <button
          onClick={() => setFilterLevel('care_plus')}
          className={`rounded-3xl border p-5 text-left transition-all ${
            filterLevel === 'care_plus'
              ? 'border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-600/15'
              : 'border-slate-200 bg-white hover:border-sky-300'
          }`}
        >
          <div className="mb-3 flex items-center gap-2">
            <Star size={18} className={filterLevel === 'care_plus' ? 'text-white' : 'text-sky-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'care_plus' ? 'text-white' : 'text-slate-500'}`}>Care+</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'care_plus' ? 'text-white' : 'text-slate-900'}`}>{levelStats.care_plus}</div>
        </button>

        <button
          onClick={() => setFilterLevel('king')}
          className={`rounded-3xl border p-5 text-left transition-all ${
            filterLevel === 'king'
              ? 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/15'
              : 'border-slate-200 bg-white hover:border-amber-300'
          }`}
        >
          <div className="mb-3 flex items-center gap-2">
            <Crown size={18} className={filterLevel === 'king' ? 'text-white' : 'text-amber-500'} />
            <span className={`text-sm font-medium ${filterLevel === 'king' ? 'text-white' : 'text-slate-500'}`}>King</span>
          </div>
          <div className={`text-2xl font-bold ${filterLevel === 'king' ? 'text-white' : 'text-slate-900'}`}>{levelStats.king}</div>
        </button>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(241,245,249,0.85))] p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px_minmax(0,1fr)]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="搜索用户 ID、备注、分组"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-white/70 bg-white px-11 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <select
              value={filterGroup}
              onChange={(event) => setFilterGroup(event.target.value)}
              className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">全部分组</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>

            <div className="flex gap-3">
              <input
                type="text"
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
                placeholder="新建自定义分组"
                className="min-w-0 flex-1 rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100"
              />
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingGroup ? '创建中...' : '新建分组'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1680px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <th className="whitespace-nowrap px-6 py-4">用户 ID</th>
                <th className="whitespace-nowrap px-6 py-4">分组</th>
                <th className="whitespace-nowrap px-6 py-4">等级</th>
                <th className="whitespace-nowrap px-6 py-4">OCR 额度</th>
                <th className="whitespace-nowrap px-6 py-4">小结额度</th>
                <th className="whitespace-nowrap px-6 py-4">额外额度</th>
                <th className="whitespace-nowrap px-6 py-4">累计使用</th>
                <th className="whitespace-nowrap px-6 py-4">加入日期</th>
                <th className="whitespace-nowrap px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredUsers.map((user) => {
                const isSaving = savingUserId === user.userId;
                const currentGroup = user.group || DEFAULT_GROUP;
                const noteDraft = noteDrafts[user.userId] ?? user.note ?? '';

                return (
                  <tr key={user.userId} className="transition-colors hover:bg-slate-50/70">
                    <td className="max-w-[220px] px-6 py-4">
                      <div className="truncate font-semibold text-slate-900" title={user.userId}>
                        {user.userId}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <select
                        value={currentGroup}
                        disabled={isSaving}
                        onChange={(event) => handleUpdateUser(user.userId, { group: event.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100"
                      >
                        {groups.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">{getLevelBadge(user.level)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-800">
                      {getQuotaText(user.ocrUsed, user.ocrLimit, user.extraOcrQuota || 0, user.isUnlimited)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-800">
                      {getQuotaText(user.summaryUsed, user.summaryLimit, user.extraSummaryQuota || 0, user.isUnlimited)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                        +{user.extraOcrQuota || 0} | +{user.extraSummaryQuota || 0}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-900">
                      {user.ocrUsed} | {user.summaryUsed}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                      {format(new Date(user.firstUsedAt), 'yyyy-MM-dd')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-2 py-1.5">
                          <span className="text-xs font-semibold text-emerald-700">OCR</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={getQuotaDraftValue(quotaDrafts[user.userId], 'ocr')}
                            onChange={(event) => handleQuotaDraftChange(user.userId, 'ocr', event.target.value)}
                            placeholder="加额"
                            disabled={isSaving}
                            className="w-16 rounded-xl border border-emerald-200 bg-white px-2.5 py-1.5 text-center text-xs text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                          />
                          <button
                            onClick={() => handleAddQuota(user, 'ocr')}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus size={14} />
                            添加
                          </button>
                        </div>

                        <div className="inline-flex items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-2 py-1.5">
                          <span className="text-xs font-semibold text-sky-700">小结</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={getQuotaDraftValue(quotaDrafts[user.userId], 'summary')}
                            onChange={(event) => handleQuotaDraftChange(user.userId, 'summary', event.target.value)}
                            placeholder="加额"
                            disabled={isSaving}
                            className="w-16 rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-center text-xs text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                          />
                          <button
                            onClick={() => handleAddQuota(user, 'summary')}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus size={14} />
                            添加
                          </button>
                        </div>

                        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(event) => handleNoteDraftChange(user.userId, event.target.value)}
                            placeholder="编辑备注"
                            disabled={isSaving}
                            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                          />
                          <button
                            onClick={() => handleSaveNote(user)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check size={14} />
                            保存
                          </button>
                        </div>

                        <select
                          value={user.level}
                          disabled={isSaving}
                          onChange={(event) => handleUpdateUser(user.userId, { level: event.target.value as UserLevel })}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100"
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
                  <td colSpan={9} className="px-6 py-14 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <UsersIcon size={40} className="text-slate-300" />
                      <span>没有找到匹配的用户。</span>
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
