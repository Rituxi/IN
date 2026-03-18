import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FolderPlus, RefreshCw, Search, Shield, Star, Users as UsersIcon, X } from 'lucide-react';

type UserLevel = 'care' | 'care_plus' | 'king';

interface User {
  userId: string;
  level: UserLevel;
  ocrUsed: number;
  ocrLimit: number;
  summaryUsed: number;
  summaryLimit: number;
  extraOcrQuota: number;
  extraSummaryQuota: number;
  totalOcrUsedCount: number;
  totalSummaryUsedCount: number;
  totalUsedCount: number;
  isUnlimited: boolean;
  isPro: boolean;
  firstUsedAt: string;
  note: string;
  status: string;
  group: string;
}

interface UserConfigDraft {
  group: string;
  level: UserLevel;
  note: string;
  extraOcrQuota: string;
  extraSummaryQuota: string;
}

const DEFAULT_GROUP = '未分组';

const LEVEL_META: Record<UserLevel | 'all', { label: string; icon: typeof UsersIcon }> = {
  all: { label: '全部', icon: UsersIcon },
  care: { label: 'Care', icon: Shield },
  care_plus: { label: 'Care+', icon: Star },
  king: { label: 'King', icon: Star },
};

function getSafeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatJoinDate(value: string) {
  const date = getSafeDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '--';
}

function getDisplayGroup(group?: string) {
  const value = (group || '').trim();
  return value || DEFAULT_GROUP;
}

function getQuotaDisplay(used: number, limit: number, extra: number, isUnlimited: boolean) {
  if (isUnlimited) {
    return '无限';
  }
  return `${used}/${limit + extra}`;
}

function getLevelText(level: UserLevel) {
  if (level === 'care_plus') {
    return { label: 'Care+', className: 'text-blue-600' };
  }
  if (level === 'king') {
    return { label: 'King', className: 'text-amber-600' };
  }
  return { label: 'Care', className: 'text-zinc-800' };
}

function createDraft(user: User): UserConfigDraft {
  return {
    group: getDisplayGroup(user.group),
    level: user.level,
    note: user.note ?? '',
    extraOcrQuota: '',
    extraSummaryQuota: '',
  };
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
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<UserConfigDraft | null>(null);

  const deferredSearch = useDeferredValue(search);

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
    const nextGroups = Array.isArray(data.groups) ? data.groups.filter((item: unknown) => typeof item === 'string') : [];
    setGroups(Array.from(new Set([DEFAULT_GROUP, ...nextGroups])));
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

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && savingUserId !== selectedUserId) {
        setSelectedUserId(null);
        setConfigDraft(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [savingUserId, selectedUserId]);

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

      if (typeof updatedUser.group === 'string') {
        const normalizedGroup = getDisplayGroup(updatedUser.group);
        setGroups((current) => Array.from(new Set([DEFAULT_GROUP, ...current, normalizedGroup])));
      }

      return updatedUser as User;
    } catch (error) {
      console.error(error);
      alert('用户更新失败，请稍后重试。');
      return null;
    } finally {
      setSavingUserId(null);
    }
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
      const nextGroups = Array.isArray(data.groups) ? data.groups.filter((item: unknown) => typeof item === 'string') : [group];
      const normalized = Array.from(new Set([DEFAULT_GROUP, ...nextGroups, group]));
      setGroups(normalized);
      setFilterGroup(group);
      setShowCreateGroup(false);
      setNewGroup('');

      setConfigDraft((current) => (current ? { ...current, group } : current));
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
    const keyword = deferredSearch.trim().toLowerCase();
    return users.filter((user) => {
      const currentGroup = getDisplayGroup(user.group);
      const noteText = (user.note ?? '').toLowerCase();
      const matchSearch =
        keyword === '' ||
        user.userId.toLowerCase().includes(keyword) ||
        noteText.includes(keyword) ||
        currentGroup.toLowerCase().includes(keyword);
      const matchLevel = filterLevel === 'all' || user.level === filterLevel;
      const matchGroup = filterGroup === 'all' || currentGroup === filterGroup;
      return matchSearch && matchLevel && matchGroup;
    });
  }, [deferredSearch, filterGroup, filterLevel, users]);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const selectedUserSaving = selectedUser ? savingUserId === selectedUser.userId : false;

  const openConfigModal = (user: User) => {
    setSelectedUserId(user.userId);
    setConfigDraft(createDraft(user));
  };

  const closeConfigModal = () => {
    if (selectedUserSaving) {
      return;
    }
    setSelectedUserId(null);
    setConfigDraft(null);
  };

  const handleConfigDraftChange = <K extends keyof UserConfigDraft>(field: K, value: UserConfigDraft[K]) => {
    setConfigDraft((current) => {
      if (!current) {
        return current;
      }

      if ((field === 'extraOcrQuota' || field === 'extraSummaryQuota') && value !== '' && !/^\d+$/.test(String(value))) {
        return current;
      }

      return { ...current, [field]: value };
    });
  };

  const handleSaveConfig = async () => {
    if (!selectedUser || !configDraft) {
      return;
    }

    const ocrExtra = Number(configDraft.extraOcrQuota || 0);
    const summaryExtra = Number(configDraft.extraSummaryQuota || 0);

    if (!Number.isFinite(ocrExtra) || ocrExtra < 0 || !Number.isFinite(summaryExtra) || summaryExtra < 0) {
      alert('补充额度只能填写 0 或正整数。');
      return;
    }

    const nextGroup = configDraft.group.trim() || DEFAULT_GROUP;
    const payload: Partial<User> = {
      group: nextGroup,
      level: configDraft.level,
      note: configDraft.note.trim(),
      extraOcrQuota: (selectedUser.extraOcrQuota || 0) + ocrExtra,
      extraSummaryQuota: (selectedUser.extraSummaryQuota || 0) + summaryExtra,
    };

    const updatedUser = await handleUpdateUser(selectedUser.userId, payload);
    if (!updatedUser) {
      return;
    }

    setSelectedUserId(null);
    setConfigDraft(null);
  };

  if (loading) {
    return <div className="p-10 text-center text-sm text-zinc-500">正在加载用户数据...</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-6 animate-in fade-in duration-300">
        <div className="px-2 py-1 sm:px-0 sm:py-0">
          <div className="flex flex-wrap items-end justify-between gap-4 px-2">
            <div>
              <h2 className="mb-2 text-[28px] font-semibold tracking-tight text-zinc-900">用户管理</h2>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {(['all', 'care', 'care_plus'] as const).map((key, index) => {
                  const meta = LEVEL_META[key];
                  const Icon = meta.icon;
                  const isActive = filterLevel === key;
                  const activeClass =
                    index === 0
                      ? 'bg-zinc-900/90 text-white'
                      : 'bg-white/60 text-zinc-800 ring-1 ring-white/80 hover:bg-white/80';

                  return (
                    <button
                      key={key}
                      onClick={() => setFilterLevel(key)}
                      className={`flex items-center gap-2 rounded-full px-4 py-2 shadow-sm transition-all ${isActive ? activeClass : 'bg-white/40 text-zinc-600 ring-1 ring-white/60 hover:bg-white/80'}`}
                    >
                      <Icon size={14} className={isActive && index === 0 ? 'text-zinc-400' : 'text-zinc-500'} />
                      <span className={`text-[13px] font-medium ${isActive && index === 0 ? 'text-zinc-300' : ''}`}>{meta.label}</span>
                      <span className="ml-1 text-[15px] font-semibold">{levelStats[key]}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setFilterLevel('king')}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 shadow-sm transition-all ${
                    filterLevel === 'king'
                      ? 'bg-white/60 text-amber-600 ring-1 ring-amber-100'
                      : 'bg-white/40 text-zinc-600 ring-1 ring-white/60 hover:bg-white/80'
                  }`}
                >
                  <Star size={14} className="text-amber-500" />
                  <span className="text-[13px] font-medium">King</span>
                  <span className="ml-1 text-[15px] font-semibold">{levelStats.king}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={15} />
                <input
                  type="text"
                  placeholder="搜索 ID..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-full border-transparent bg-white/60 py-2.5 pl-10 pr-4 text-[14px] shadow-sm ring-1 ring-white/80 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
              </div>

              <select
                value={filterGroup}
                onChange={(event) => setFilterGroup(event.target.value)}
                className="rounded-full border-transparent bg-white/60 px-4 py-2.5 text-[14px] text-zinc-700 shadow-sm ring-1 ring-white/80 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-300"
              >
                <option value="all">全部分组</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>

              {showCreateGroup ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newGroup}
                    onChange={(event) => setNewGroup(event.target.value)}
                    placeholder="输入分组"
                    className="rounded-full border-transparent bg-white/70 px-4 py-2.5 text-[14px] shadow-sm ring-1 ring-white/80 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-300"
                  />
                  <button
                    onClick={handleCreateGroup}
                    disabled={creatingGroup}
                    className="rounded-full bg-white/80 px-4 py-2.5 text-[14px] font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200/50 transition-all disabled:opacity-50"
                  >
                    {creatingGroup ? '保存中...' : '保存'}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={reloadPageData}
                disabled={loading}
                aria-label={loading ? '刷新中' : '刷新用户数据'}
                className="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2.5 text-[14px] font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200/50 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                {loading ? '刷新中...' : '刷新'}
              </button>

              <button
                onClick={() => setShowCreateGroup((current) => !current)}
                className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-[14px] font-medium text-white shadow-md transition-all active:scale-95 hover:bg-black"
              >
                <FolderPlus size={15} />
                新建分组
              </button>
            </div>
          </div>
        </div>

        <div className="px-2 sm:px-0">
          <div className="hidden grid-cols-[1.5fr_auto_auto_1.2fr_1fr_1fr_1.5fr_auto] gap-x-6 items-center px-8 py-3 text-[13px] font-medium text-zinc-400 xl:grid">
            <div>用户 ID</div>
            <div className="w-16">分组</div>
            <div className="w-20">等级</div>
            <div>基础额度</div>
            <div>额外额度</div>
            <div>累计使用</div>
            <div>加入时间 / 备注</div>
            <div className="w-16 text-right">操作</div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-zinc-200 bg-white/30 py-16 text-center text-[15px] text-zinc-500">
              没有找到匹配的用户
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => {
                const level = getLevelText(user.level);
                const displayGroup = getDisplayGroup(user.group);

                return (
                  <div
                    key={user.userId}
                    className="grid gap-y-3 rounded-[24px] bg-white/50 px-6 py-5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] ring-1 ring-white/80 backdrop-blur-2xl transition-all duration-300 hover:bg-white/70 xl:grid-cols-[1.5fr_auto_auto_1.2fr_1fr_1fr_1.5fr_auto] xl:items-center xl:gap-x-6"
                  >
                    <div className="truncate pr-2 font-mono text-[13px] font-medium text-zinc-800" title={user.userId}>
                      {user.userId}
                    </div>

                    <div className="w-16">
                      <span className="inline-flex items-center justify-center rounded-[6px] bg-zinc-400/15 px-2.5 py-1 text-[12px] font-medium tracking-wide text-zinc-700">
                        {displayGroup}
                      </span>
                    </div>

                    <div className="w-20">
                      <span className={`text-[14px] font-bold tracking-tight ${level.className}`}>{level.label}</span>
                    </div>

                    <div className="flex flex-col gap-1.5 text-[13px]">
                      <div className="flex items-center gap-3">
                        <span className="w-8 font-medium text-zinc-400">OCR</span>
                        <span className="font-semibold text-zinc-800">
                          {getQuotaDisplay(user.ocrUsed, user.ocrLimit, user.extraOcrQuota || 0, user.isUnlimited)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-8 font-medium text-zinc-400">小结</span>
                        <span className="font-semibold text-zinc-800">
                          {getQuotaDisplay(user.summaryUsed, user.summaryLimit, user.extraSummaryQuota || 0, user.isUnlimited)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 text-[13px] font-medium">
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-zinc-400">OCR</span>
                        <span className="text-emerald-600">+{user.extraOcrQuota || 0}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-zinc-400">小结</span>
                        <span className="text-blue-600">+{user.extraSummaryQuota || 0}</span>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center">
                      <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-700">
                        <span>{user.totalOcrUsedCount ?? user.ocrUsed}</span>
                        <span className="font-light text-zinc-300">|</span>
                        <span>{user.totalSummaryUsedCount ?? user.summaryUsed}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 pr-2">
                      <span className="text-[12px] font-medium text-zinc-400">{formatJoinDate(user.firstUsedAt)}</span>
                      <span className="truncate text-[13px] font-medium text-zinc-700" title={user.note}>
                        {user.note || '未添加备注'}
                      </span>
                    </div>

                    <div className="w-16 text-right">
                      <button
                        onClick={() => openConfigModal(user)}
                        className="inline-flex w-full items-center justify-center rounded-full bg-white/80 py-2 text-[13px] font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200/50 transition-all active:scale-95 hover:bg-zinc-100 hover:ring-zinc-300"
                      >
                        配置
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedUser && configDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div onClick={closeConfigModal} className="absolute inset-0 bg-zinc-900/30 backdrop-blur-xl transition-opacity duration-300" />

          <div className="relative w-full max-w-[360px] overflow-hidden rounded-[36px] bg-white/85 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-3xl">
            <button
              onClick={closeConfigModal}
              disabled={selectedUserSaving}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
              aria-label="关闭"
            >
              <X size={16} />
            </button>

            <div className="p-6">
              <div className="mt-4 mb-6 flex flex-col items-center text-center">
                <div className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-zinc-100 text-3xl font-medium text-zinc-800 shadow-sm">
                  {selectedUser.userId.charAt(0).toUpperCase()}
                </div>
                <h3 className="mb-1.5 text-[22px] font-semibold leading-none tracking-tight text-zinc-900">
                  {selectedUser.userId.length > 12 ? `${selectedUser.userId.substring(0, 12)}...` : selectedUser.userId}
                </h3>
                <p className="text-[14px] font-medium text-zinc-400">用户配置</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={configDraft.group}
                    onChange={(event) => handleConfigDraftChange('group', event.target.value)}
                    disabled={selectedUserSaving}
                    className="rounded-[16px] bg-zinc-100/60 px-4 py-3 text-[14px] font-medium text-zinc-800 outline-none transition focus:bg-white focus:ring-2 focus:ring-zinc-300"
                  >
                    {groups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>

                  <select
                    value={configDraft.level}
                    onChange={(event) => handleConfigDraftChange('level', event.target.value as UserLevel)}
                    disabled={selectedUserSaving}
                    className="rounded-[16px] bg-zinc-100/60 px-4 py-3 text-[14px] font-medium text-zinc-800 outline-none transition focus:bg-white focus:ring-2 focus:ring-zinc-300"
                  >
                    <option value="care">Care</option>
                    <option value="care_plus">Care+</option>
                    <option value="king">King</option>
                  </select>
                </div>

                <div className="overflow-hidden rounded-[24px] bg-zinc-100/60">
                  <div className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-zinc-200/40">
                    <div className="flex flex-col">
                      <span className="text-[16px] font-medium leading-snug text-zinc-900">OCR 补充</span>
                      <span className="mt-0.5 text-[13px] font-normal text-zinc-400">
                        {getQuotaDisplay(selectedUser.ocrUsed, selectedUser.ocrLimit, selectedUser.extraOcrQuota || 0, selectedUser.isUnlimited)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 rounded-[14px] bg-white/70 px-2.5 py-1 shadow-sm transition-colors group-hover:bg-white">
                      <span className="text-[18px] font-light leading-none text-zinc-400">+</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={configDraft.extraOcrQuota}
                        onChange={(event) => handleConfigDraftChange('extraOcrQuota', event.target.value)}
                        placeholder="0"
                        disabled={selectedUserSaving}
                        className="w-[48px] bg-transparent p-0 text-center text-[18px] font-semibold text-zinc-900 outline-none"
                      />
                    </div>
                  </div>

                  <div className="ml-5 h-px bg-zinc-200/50" />

                  <div className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-zinc-200/40">
                    <div className="flex flex-col">
                      <span className="text-[16px] font-medium leading-snug text-zinc-900">小结补充</span>
                      <span className="mt-0.5 text-[13px] font-normal text-zinc-400">
                        {getQuotaDisplay(selectedUser.summaryUsed, selectedUser.summaryLimit, selectedUser.extraSummaryQuota || 0, selectedUser.isUnlimited)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 rounded-[14px] bg-white/70 px-2.5 py-1 shadow-sm transition-colors group-hover:bg-white">
                      <span className="text-[18px] font-light leading-none text-zinc-400">+</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={configDraft.extraSummaryQuota}
                        onChange={(event) => handleConfigDraftChange('extraSummaryQuota', event.target.value)}
                        placeholder="0"
                        disabled={selectedUserSaving}
                        className="w-[48px] bg-transparent p-0 text-center text-[18px] font-semibold text-zinc-900 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[20px] bg-zinc-100/60 px-5 py-4 transition-colors focus-within:bg-zinc-200/60">
                  <input
                    type="text"
                    value={configDraft.note}
                    onChange={(event) => handleConfigDraftChange('note', event.target.value)}
                    placeholder="添加备注"
                    disabled={selectedUserSaving}
                    className="w-full bg-transparent p-0 text-[16px] font-medium text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-6 pt-2">
              <button
                onClick={handleSaveConfig}
                disabled={selectedUserSaving}
                className="w-full rounded-full bg-zinc-900 py-4 text-[16px] font-semibold text-white transition-all active:scale-[0.98] hover:bg-black disabled:opacity-50"
              >
                {selectedUserSaving ? '保存中...' : '完成'}
              </button>
              <button
                onClick={closeConfigModal}
                disabled={selectedUserSaving}
                className="w-full rounded-full py-3 text-[16px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
