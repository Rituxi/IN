import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, Key, LogOut, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react';

const navItems = [
  { to: '/admin/logs', icon: FileText, label: '使用记录', desc: '查看调用情况和日志' },
  { to: '/admin/users', icon: Users, label: '用户管理', desc: '管理用户等级和备注' },
  { to: '/admin/redeem', icon: Key, label: '兑换码', desc: '生成和维护兑换码' },
  { to: '/admin/level-config', icon: Settings, label: '等级配置', desc: '配置额度和模型' },
];

export default function AdminLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      return;
    }

    localStorage.setItem('adminToken', password);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    navigate('/admin');
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl gap-6 rounded-[36px] border border-white/70 bg-white/92 p-4 shadow-[0_28px_90px_-44px_rgba(16,33,43,0.45)] lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
          <section className="rounded-[30px] bg-[linear-gradient(135deg,rgba(47,127,121,0.12),rgba(255,248,236,0.72))] p-8 sm:p-10">
            <div className="max-w-md space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)]">
                <ShieldCheck size={16} />
                管理后台
              </span>
              <div className="space-y-3">
                <h1 className="text-4xl font-extrabold tracking-tight text-[var(--color-ink-950)]">指标笔记 Inno Admin</h1>
                <p className="leading-7 text-[var(--color-ink-700)]">
                  这里负责查看日志、维护用户、管理兑换码和等级配置。先登录，再继续使用后台功能。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[var(--color-ink-800)]">统一颜色和组件风格</div>
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-[var(--color-ink-800)]">保留现有接口和业务逻辑</div>
              </div>
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full rounded-[30px] border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-8">
              <div className="mb-6 space-y-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--color-brand-600)] shadow-sm">
                  <Sparkles size={24} />
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-ink-950)]">管理员登录</h2>
                <p className="text-sm text-[var(--color-ink-700)]">请输入后台密码进入管理界面。</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入管理员密码"
                  className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-white px-4 py-3.5 text-[var(--color-ink-900)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
                />
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-[var(--color-brand-600)] py-3.5 font-semibold text-white transition hover:bg-[var(--color-brand-700)]"
                >
                  登录
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,251,0.94))] p-4 shadow-[0_24px_70px_-38px_rgba(16,33,43,0.42)]">
          <div className="rounded-[26px] bg-[linear-gradient(135deg,rgba(47,127,121,0.14),rgba(255,248,236,0.86))] p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-brand-700)]">
              <Sparkles size={14} />
              Inno Admin
            </div>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--color-ink-950)]">后台管理台</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">统一管理日志、用户、兑换码和等级配置。</p>
          </div>

          <nav className="mt-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'group flex items-start gap-3 rounded-[22px] border px-4 py-4 transition',
                    isActive
                      ? 'border-[var(--color-brand-100)] bg-[var(--color-brand-50)] shadow-sm'
                      : 'border-transparent bg-white/80 hover:border-[var(--color-ink-200)] hover:bg-white',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={[
                        'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition',
                        isActive ? 'bg-white text-[var(--color-brand-600)] shadow-sm' : 'bg-[var(--color-ink-50)] text-[var(--color-ink-700)]',
                      ].join(' ')}
                    >
                      <item.icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--color-ink-950)]">{item.label}</div>
                      <div className="mt-1 text-sm leading-6 text-[var(--color-ink-700)]">{item.desc}</div>
                    </div>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[22px] border border-red-100 bg-red-50 px-4 py-3 font-semibold text-red-600 transition hover:bg-red-100"
          >
            <LogOut size={18} />
            退出登录
          </button>
        </aside>

        <main className="rounded-[30px] border border-white/70 bg-white/92 p-4 shadow-[0_24px_70px_-38px_rgba(16,33,43,0.34)] sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
