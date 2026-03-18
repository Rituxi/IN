import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Copy, Key, Plus, RefreshCw, Trash2 } from 'lucide-react';

interface RedeemCode {
  code: string;
  type: 'care_plus' | 'king';
  status: 'unused' | 'used';
  createdAt: string;
  expiredAt: string;
}

export default function Redeem() {
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generateType, setGenerateType] = useState<'care_plus' | 'king'>('care_plus');
  const [generateCount, setGenerateCount] = useState(1);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/redeem', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCodes(Array.isArray(data) ? data : []);
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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: generateType, count: generateCount }),
      });

      if (res.ok) {
        fetchCodes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm('确定要删除这个兑换码吗？')) return;

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/redeem/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchCodes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    alert('兑换码已复制到剪贴板。');
  };

  const unusedCodes = codes.filter((code) => code.status === 'unused');

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-[linear-gradient(135deg,rgba(255,248,236,0.92),rgba(255,255,255,0.96))] p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Redeem Codes</div>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--color-ink-950)]">兑换码管理</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">批量生成并维护会员升级兑换码，当前仅展示还可使用的兑换码。</p>
        </div>
        <button
          onClick={fetchCodes}
          className="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-white/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-900)] transition hover:bg-white"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </section>

      <section className="rounded-[30px] border border-[var(--color-ink-200)] bg-white p-6 shadow-[0_18px_60px_-38px_rgba(16,33,43,0.35)]">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-ink-800)]">生成类型</label>
            <select
              value={generateType}
              onChange={(e) => setGenerateType(e.target.value as 'care_plus' | 'king')}
              className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-3 text-sm text-[var(--color-ink-900)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
            >
              <option value="care_plus">Care+ 高级版</option>
              <option value="king">King 无限版</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-ink-800)]">生成数量</label>
            <input
              type="number"
              min="1"
              max="50"
              value={generateCount}
              onChange={(e) => setGenerateCount(Number(e.target.value))}
              className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-3 text-sm text-[var(--color-ink-900)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
            />
          </div>

          <button
            onClick={handleGenerate}
            className="inline-flex items-center justify-center gap-2 self-end rounded-2xl bg-[var(--color-brand-600)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)]"
          >
            <Plus size={16} />
            批量生成
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[30px] border border-[var(--color-ink-200)] bg-white shadow-[0_18px_60px_-38px_rgba(16,33,43,0.35)]">
        <div className="border-b border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-6 py-4">
          <div className="flex items-center gap-2 text-[var(--color-ink-950)]">
            <Key size={18} className="text-[var(--color-brand-600)]" />
            <h3 className="text-lg font-bold">可用兑换码 ({unusedCodes.length})</h3>
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-700)]">已使用或已删除的兑换码不会显示在这里。</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-white text-sm text-[var(--color-ink-700)]">
              <tr className="border-b border-[var(--color-ink-200)]">
                <th className="px-6 py-4 font-semibold">兑换码</th>
                <th className="px-6 py-4 font-semibold">类型</th>
                <th className="px-6 py-4 font-semibold">生成时间</th>
                <th className="px-6 py-4 font-semibold">过期时间</th>
                <th className="px-6 py-4 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-ink-100)] text-sm text-[var(--color-ink-900)]">
              {unusedCodes.map((code) => (
                <tr key={code.code} className="transition hover:bg-[var(--color-brand-50)]/45">
                  <td className="px-6 py-4 font-mono font-semibold tracking-wide text-[var(--color-ink-950)]">{code.code}</td>
                  <td className="px-6 py-4">
                    <span
                      className={[
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        code.type === 'king' ? 'bg-amber-50 text-amber-700' : 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]',
                      ].join(' ')}
                    >
                      {code.type === 'king' ? 'King' : 'Care+'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-[var(--color-ink-700)]">{format(new Date(code.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-[var(--color-ink-700)]">{format(new Date(code.expiredAt), 'yyyy-MM-dd')}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(code.code)}
                        className="rounded-xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-2 text-[var(--color-ink-700)] transition hover:border-[var(--color-brand-200)] hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
                        title="复制"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(code.code)}
                        className="rounded-xl border border-red-100 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {unusedCodes.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-[var(--color-ink-700)]">
                    暂无可用兑换码
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
