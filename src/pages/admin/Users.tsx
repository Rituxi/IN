import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Crown,
  FolderPlus,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Star,
  Users as UsersIcon,
  X,
} from 'lucide-react';

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

const LEVEL_META: Record<
  UserLevel | 'all',
  {
    label: string;
    icon: typeof UsersIcon;
    countTone: string;
    activeClass: string;
  }
> = {
  all: {
    label: '全部',
    icon: UsersIcon,
    countTone: 'text-[var(--color-ink-950)]',
    activeClass: 'bg-[var(--color-ink-950)] text-white shadow-[0_12px_30px_-18px_rgba(16,33,43,0.7)]',
  },
  care: {
    label: 'Care',
    icon: Shield,
    countTone: 'text-[var(--color-ink-950)]',
    activeClass: 'bg-white text-[var(--color-ink-950)] ring-1 ring-[var(--color-ink-950)] shadow-[0_10px_30px_-22px_rgba(16,33,43,0.6)]',
  },
  care_plus: {
    label: 'Care+',
    icon: Star,
    countTone: 'text-[#2667ff]',
    activeClass: 'bg-[#eff4ff] text-[#2667ff] ring-1 ring-[#c8d7ff] shadow-[0_10px_30px_-22px_rgba(38,103,255,0.4)]',
  },
  king: {
    label: 'King',
    icon: Crown,
    countTone: 'text-[#b7791f]',
    activeClass: 'bg-[#fff6e6] text-[#b7791f] ring-1 ring-[#f1d08a] shadow-[0_10px_30px_-22px_rgba(183,121,31,0.45)]',
  },
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

function getBaseQuotaDisplay(limit: number, isUnlimited: boolean) {
  if (isUnlimited) {
    return '无限';
  }
  return String(limit);
}

function getLevelBadge(level: UserLevel) {
  if (level === 'king') {
    return <span className="text-base font-bold text-[#b7791f]">King</span>;
  }

  if (level === 'care_plus') {
    return <span className="text-base font-bold text-[#2667ff]">Care+</span>;
  }

  return <span className="text-base font-bold text-[var(--color-ink-950)]">Care</span>;
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
    const normalized = Array.from(new Set([DEFAULT_GROUP, ...nextGroups]));
    setGroups(normalized);
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

      setConfigDraft((current) => {
        if (!current) {
          return current;
        }
        return { ...current, group };
      });
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
    const keyword = search.trim().toLowerCase();
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
  }, [filterGroup, filterLevel, search, users]);

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

  const handleConfigDraftChange = (field: keyof UserConfigDraft, value: string) => {
    setConfigDraft((current) => {
      if (!current) {
        return current;
      }

      if ((field === 'extraOcrQuota' || field === 'extraSummaryQuota') && value !== '' && !/^\d+$/.test(value)) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
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
    return <div className="p-10 text-center text-sm text-[var(--color-ink-700)]">正在加载用户数据...</div>;
  }

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-[34px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,246,0.98))] px-5 py-6 shadow-[0_30px_80px_-48px_rgba(16,33,43,0.4)] sm:px-8 sm:py-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-[var(--color-ink-950)] sm:text-4xl">用户管理</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">
                  共 {users.length} 个用户，当前显示 {filteredUsers.length} 个。这里可以按等级和分组筛选，并进入配置弹窗补充额度、修改备注和调整等级。
                </p>
              </div>

              <button
                onClick={reloadPageData}
                className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-white bg-white px-5 py-3 text-sm font-semibold text-[var(--color-ink-900)] shadow-[0_14px_34px_-24px_rgba(16,33,43,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(16,33,43,0.5)]"
              >
                <RefreshCw size={16} />
                刷新
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              {(['all', 'care', 'care_plus', 'king'] as const).map((key) => {
                const meta = LEVEL_META[key];
                const Icon = meta.icon;
                const isActive = filterLevel === key;
                const count = levelStats[key];

                return (
                  <button
                    key={key}
                    onClick={() => setFilterLevel(key)}
                    className={[
                      'inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition',
                      isActive ? meta.activeClass : 'bg-white text-[var(--color-ink-700)] shadow-[0_10px_30px_-24px_rgba(16,33,43,0.5)] hover:-translate-y-0.5 hover:text-[var(--color-ink-950)]',
                    ].join(' ')}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon size={16} />
                      <span>{meta.label}</span>
                    </span>
                    <span className={['text-2xl font-extrabold leading-none', isActive ? 'text-current' : meta.countTone].join(' ')}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[var(--color-ink-500)]" size={18} />
                <input
                  type="text"
                  placeholder="搜索 ID、备注..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-full border border-transparent bg-white px-14 py-4 text-sm text-[var(--color-ink-900)] outline-none shadow-[inset_0_0_0_1px_rgba(219,228,232,0.9)] transition focus:shadow-[inset_0_0_0_1px_rgba(47,127,121,0.65),0_0_0_6px_rgba(47,127,121,0.08)]"
                />
              </label>

              <div className="relative">
                <select
                  value={filterGroup}
                  onChange={(event) => setFilterGroup(event.target.value)}
                  className="w-full appearance-none rounded-full border border-transparent bg-white px-5 py-4 text-sm text-[var(--color-ink-900)] outline-none shadow-[inset_0_0_0_1px_rgba(219,228,232,0.9)] transition focus:shadow-[inset_0_0_0_1px_rgba(47,127,121,0.65),0_0_0_6px_rgba(47,127,121,0.08)]"
                >
                  <option value="all">全部分组</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                {showCreateGroup && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGroup}
                      onChange={(event) => setNewGroup(event.target.value)}
                      placeholder="输入新分组"
                      className="min-w-0 flex-1 rounded-full border border-transparent bg-white px-5 py-4 text-sm text-[var(--color-ink-900)] outline-none shadow-[inset_0_0_0_1px_rgba(219,228,232,0.9)] transition focus:shadow-[inset_0_0_0_1px_rgba(47,127,121,0.65),0_0_0_6px_rgba(47,127,121,0.08)]"
                    />
                    <button
                      onClick={handleCreateGroup}
                      disabled={creatingGroup}
                      className="rounded-full bg-white px-5 py-4 text-sm font-semibold text-[var(--color-ink-950)] shadow-[0_14px_34px_-24px_rgba(16,33,43,0.45)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {creatingGroup ? '创建中...' : '保存'}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowCreateGroup((current) => !current)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-ink-950)] px-6 py-4 text-sm font-semibold text-white shadow-[0_18px_36px_-24px_rgba(16,33,43,0.8)] transition hover:-translate-y-0.5"
                >
                  <FolderPlus size={16} />
                  新建分组
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[34px] bg-[rgba(255,255,255,0.72)] px-3 py-3 sm:px-4 sm:py-4">
          <div className="hidden grid-cols-[2.1fr_1fr_1fr_1.6fr_1.6fr_1.1fr_1.8fr_0.9fr] gap-4 px-6 py-4 text-sm font-medium text-[var(--color-ink-500)] lg:grid">
            <div>用户 ID</div>
            <div>分组</div>
            <div>等级</div>
            <div>基础额度</div>
            <div>额外额度</div>
            <div>累计使用</div>
            <div>加入时间 / 备注</div>
            <div className="text-right">操作</div>
          </div>

          <div className="space-y-4">
            {filteredUsers.map((user) => {
              const currentGroup = getDisplayGroup(user.group);

              return (
                <article
                  key={user.userId}
                  className="rounded-[30px] bg-white px-5 py-5 shadow-[0_20px_50px_-40px_rgba(16,33,43,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_60px_-42px_rgba(16,33,43,0.55)] sm:px-6"
                >
                  <div className="grid gap-5 lg:grid-cols-[2.1fr_1fr_1fr_1.6fr_1.6fr_1.1fr_1.8fr_0.9fr] lg:items-center">
                    <div>
                      <div className="truncate font-mono text-base text-[var(--color-ink-900)]" title={user.userId}>
                        {user.userId}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-ink-500)] lg:hidden">
                        <span>{formatJoinDate(user.firstUsedAt)}</span>
                        <span className="h-1 w-1 rounded-full bg-[var(--color-ink-200)]" />
                        <span>{currentGroup}</span>
                      </div>
                    </div>

                    <div>
                      <span className="inline-flex rounded-2xl bg-[var(--color-ink-100)] px-4 py-2 text-sm text-[var(--color-ink-800)]">
                        {currentGroup}
                      </span>
                    </div>

                    <div>{getLevelBadge(user.level)}</div>

                    <div className="space-y-1 text-sm text-[var(--color-ink-500)]">
                      <div className="flex items-baseline gap-3">
                        <span>OCR</span>
                        <span className="text-[28px] font-bold leading-none text-[var(--color-ink-900)]">{getQuotaDisplay(user.ocrUsed, user.ocrLimit, user.extraOcrQuota || 0, user.isUnlimited)}</span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span>小结</span>
                        <span className="text-[28px] font-bold leading-none text-[var(--color-ink-900)]">{getQuotaDisplay(user.summaryUsed, user.summaryLimit, user.extraSummaryQuota || 0, user.isUnlimited)}</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-[var(--color-ink-500)]">
                      <div className="flex items-center gap-3">
                        <span>OCR</span>
                        <span className="text-xl font-semibold text-emerald-600">+{user.extraOcrQuota || 0}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>小结</span>
                        <span className="text-xl font-semibold text-[#2667ff]">+{user.extraSummaryQuota || 0}</span>
                      </div>
                    </div>

                    <div className="text-[28px] font-semibold leading-none text-[var(--color-ink-900)]">
                      {user.ocrUsed}
                      <span className="px-3 text-[var(--color-ink-200)]">|</span>
                      {user.summaryUsed}
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-[var(--color-ink-500)]">{formatJoinDate(user.firstUsedAt)}</div>
                      <div className="line-clamp-2 text-sm text-[var(--color-ink-800)]">{(user.note ?? '').trim() || '未添加备注'}</div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => openConfigModal(user)}
                        className="rounded-full border border-[var(--color-ink-200)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-ink-900)] shadow-[0_12px_30px_-24px_rgba(16,33,43,0.38)] transition hover:-translate-y-0.5 hover:border-[var(--color-ink-400)]"
                      >
                        配置
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {filteredUsers.length === 0 && (
              <div className="rounded-[30px] bg-white px-6 py-16 text-center shadow-[0_20px_50px_-40px_rgba(16,33,43,0.5)]">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-ink-100)] text-[var(--color-ink-500)]">
                    <UsersIcon size={30} />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[var(--color-ink-900)]">没有找到匹配的用户</div>
                    <div className="mt-2 text-sm text-[var(--color-ink-600)]">可以试试切换等级筛选、分组，或者缩短搜索关键词。</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedUser && configDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,33,43,0.18)] px-4 py-6 backdrop-blur-[6px]">
          <div className="relative w-full max-w-[560px] overflow-hidden rounded-[40px] bg-[linear-gradient(180deg,#ffffff_0%,#fafaf9_100%)] px-6 py-8 shadow-[0_40px_100px_-36px_rgba(16,33,43,0.6)] sm:px-8">
            <button
              onClick={closeConfigModal}
              disabled={selectedUserSaving}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-ink-100)] text-[var(--color-ink-700)] transition hover:bg-[var(--color-ink-200)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="关闭"
            >
              <X size={18} />
            </button>

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[rgba(16,33,43,0.06)] bg-white text-[38px] font-semibold text-[var(--color-ink-900)] shadow-[0_16px_34px_-28px_rgba(16,33,43,0.55)]">
              {selectedUser.userId.slice(0, 1).toUpperCase()}
            </div>

            <div className="mt-5 text-center">
              <div className="mx-auto max-w-[320px] truncate text-[28px] font-extrabold leading-tight text-[var(--color-ink-950)]" title={selectedUser.userId}>
                {selectedUser.userId}
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink-500)]">用户配置</p>
            </div>

            <div className="mt-8 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--color-ink-600)]">用户分组</span>
                  <select
                    value={configDraft.group}
                    onChange={(event) => handleConfigDraftChange('group', event.target.value)}
                    disabled={selectedUserSaving}
                    className="w-full appearance-none rounded-[22px] border border-[var(--color-ink-200)] bg-white px-4 py-3 text-sm text-[var(--color-ink-900)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.08)]"
                  >
                    {groups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--color-ink-600)]">用户等级</span>
                  <select
                    value={configDraft.level}
                    onChange={(event) => handleConfigDraftChange('level', event.target.value)}
                    disabled={selectedUserSaving}
                    className="w-full appearance-none rounded-[22px] border border-[var(--color-ink-200)] bg-white px-4 py-3 text-sm text-[var(--color-ink-900)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.08)]"
                  >
                    <option value="care">Care</option>
                    <option value="care_plus">Care+</option>
                    <option value="king">King</option>
                  </select>
                </label>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[rgba(16,33,43,0.08)] pb-5">
                  <div>
                    <div className="text-[18px] font-semibold text-[var(--color-ink-950)]">OCR 补充</div>
                    <div className="mt-1 text-[30px] font-bold leading-none text-[var(--color-ink-500)]">
                      {getQuotaDisplay(selectedUser.ocrUsed, selectedUser.ocrLimit, selectedUser.extraOcrQuota || 0, selectedUser.isUnlimited)}
                    </div>
                    <div className="mt-2 text-sm text-[var(--color-ink-500)]">基础额度 {getBaseQuotaDisplay(selectedUser.ocrLimit, selectedUser.isUnlimited)}</div>
                  </div>

                  <div className="flex items-center rounded-full border border-[var(--color-ink-200)] bg-white px-4 py-2 shadow-[0_14px_30px_-26px_rgba(16,33,43,0.45)]">
                    <Plus size={16} className="text-[var(--color-ink-500)]" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={configDraft.extraOcrQuota}
                      onChange={(event) => handleConfigDraftChange('extraOcrQuota', event.target.value)}
                      placeholder="0"
                      disabled={selectedUserSaving}
                      className="w-20 border-0 bg-transparent px-3 text-center text-[20px] font-bold text-[var(--color-ink-600)] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] items-center gap-4 pb-2">
                  <div>
                    <div className="text-[18px] font-semibold text-[var(--color-ink-950)]">小结补充</div>
                    <div className="mt-1 text-[30px] font-bold leading-none text-[var(--color-ink-500)]">
                      {getQuotaDisplay(selectedUser.summaryUsed, selectedUser.summaryLimit, selectedUser.extraSummaryQuota || 0, selectedUser.isUnlimited)}
                    </div>
                    <div className="mt-2 text-sm text-[var(--color-ink-500)]">基础额度 {getBaseQuotaDisplay(selectedUser.summaryLimit, selectedUser.isUnlimited)}</div>
                  </div>

                  <div className="flex items-center rounded-full border border-[var(--color-ink-200)] bg-white px-4 py-2 shadow-[0_14px_30px_-26px_rgba(16,33,43,0.45)]">
                    <Plus size={16} className="text-[var(--color-ink-500)]" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={configDraft.extraSummaryQuota}
                      onChange={(event) => handleConfigDraftChange('extraSummaryQuota', event.target.value)}
                      placeholder="0"
                      disabled={selectedUserSaving}
                      className="w-20 border-0 bg-transparent px-3 text-center text-[20px] font-bold text-[var(--color-ink-600)] outline-none"
                    />
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="sr-only">添加备注</span>
                <textarea
                  value={configDraft.note}
                  onChange={(event) => handleConfigDraftChange('note', event.target.value)}
                  placeholder="添加备注"
                  disabled={selectedUserSaving}
                  rows={4}
                  className="w-full resize-none rounded-[26px] border border-transparent bg-[rgba(247,250,251,0.95)] px-5 py-4 text-sm text-[var(--color-ink-900)] outline-none shadow-[inset_0_0_0_1px_rgba(219,228,232,0.95)] transition placeholder:text-[var(--color-ink-500)] focus:shadow-[inset_0_0_0_1px_rgba(47,127,121,0.65),0_0_0_6px_rgba(47,127,121,0.08)]"
                />
              </label>
            </div>

            <div className="mt-8 space-y-4">
              <button
                onClick={handleSaveConfig}
                disabled={selectedUserSaving}
                className="w-full rounded-full bg-[var(--color-ink-950)] py-4 text-lg font-semibold text-white shadow-[0_22px_40px_-24px_rgba(16,33,43,0.85)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selectedUserSaving ? '保存中...' : '完成'}
              </button>

              <button
                onClick={closeConfigModal}
                disabled={selectedUserSaving}
                className="w-full bg-transparent py-2 text-lg text-[var(--color-ink-600)] transition hover:text-[var(--color-ink-900)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
