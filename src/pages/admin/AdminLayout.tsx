import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, Key, LogOut, PieChart, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react';

const navItems = [
  { to: '/admin/analytics', icon: PieChart, label: '\u6570\u636e\u5206\u6790', desc: '\u67e5\u770b\u8d8b\u52bf\u56fe\u8868\u4e0e\u5b58\u6863' },
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
      <div className="flex min-h-screen items-center justify-center bg-[#f2f2f5] px-4 py-10">
        <div className="grid w-full max-w-5xl gap-6 rounded-[36px] border border-white/70 bg-white/90 p-4 shadow-[0_28px_90px_-44px_rgba(16,33,43,0.45)] lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
          <section className="rounded-[30px] bg-[linear-gradient(135deg,rgba(244,245,239,0.92),rgba(255,248,236,0.86))] p-8 sm:p-10">
            <div className="max-w-md space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-semibold text-zinc-700">
                <ShieldCheck size={16} />
                管理后台
              </span>
              <div className="space-y-3">
                <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">INNO ADMIN</h1>
                <p className="leading-7 text-zinc-600">
                  这里负责查看日志、维护用户、管理兑换码和等级配置。先登录，再继续使用后台功能。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-zinc-700">统一界面风格</div>
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-zinc-700">保留现有接口逻辑</div>
              </div>
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full rounded-[30px] border border-zinc-200/70 bg-zinc-50/80 p-8">
              <div className="mb-6 space-y-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm">
                  <Sparkles size={24} />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900">管理员登录</h2>
                <p className="text-sm text-zinc-500">请输入后台密码进入管理界面。</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入管理员密码"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200/60"
                />
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-zinc-900 py-3.5 font-semibold text-white transition hover:bg-black"
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
    <div className="min-h-screen bg-[#f2f2f5] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-[1600px] gap-6">
        <aside className="hidden h-[calc(100vh-48px)] w-[260px] shrink-0 overflow-y-auto rounded-[32px] bg-white/50 p-5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.04)] ring-1 ring-white/80 backdrop-blur-2xl md:flex md:flex-col md:sticky md:top-6">
          <div className="px-3 pt-2 pb-6">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-zinc-900 text-white shadow-md">
                <Sparkles size={16} />
              </div>
              <h1 className="text-[18px] font-bold tracking-tight text-zinc-900">INNO ADMIN</h1>
            </div>
            <p className="text-[12px] font-medium leading-relaxed text-zinc-500">
              后台管理台
              <br />
              <span className="font-normal text-zinc-400">统一管理日志、用户、兑换码和等级配置。</span>
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-[16px] px-4 py-3 text-[14px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-white/90 text-zinc-900 shadow-sm ring-1 ring-zinc-200/50'
                      : 'text-zinc-500 hover:bg-white/40 hover:text-zinc-800',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={18} className={isActive ? 'text-zinc-800' : 'text-zinc-400'} />
                    <div className="min-w-0">
                      <div className="truncate">{item.label}</div>
                      <div className="mt-0.5 text-[12px] font-normal text-zinc-400">{item.desc}</div>
                    </div>
                  </>
                )}
              </NavLink>
            ))}

            <div className="mx-2 my-1 h-px bg-zinc-200/50" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-[16px] px-4 py-3 text-[14px] font-medium text-red-500/90 transition-all duration-200 hover:bg-red-50/50 hover:text-red-600"
            >
              <LogOut size={18} />
              退出登录
            </button>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
