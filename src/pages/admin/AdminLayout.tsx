import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, Key, LogOut, Settings, Sparkles, Users } from 'lucide-react';

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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">指标笔记·Inno 管理后台</h1>
            <p className="text-sm text-slate-500">请输入管理员密码</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="请输入密码"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700"
            >
              登录
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: '/admin/logs', icon: FileText, label: '使用记录' },
    { to: '/admin/users', icon: Users, label: '用户管理' },
    { to: '/admin/redeem', icon: Key, label: '兑换码' },
    { to: '/admin/level-config', icon: Settings, label: '用户配置' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-6">
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 p-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles size={18} />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Inno Admin</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">指标笔记·Inno</h1>
            <p className="mt-1 text-xs text-slate-500">智能指标管理后台</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={20} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
