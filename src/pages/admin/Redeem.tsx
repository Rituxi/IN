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
      const safeCount = Math.max(1, Math.min(50, Number(generateCount) || 1));
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: generateType, count: safeCount }),
      });

      if (res.ok) {
        setGenerateCount(safeCount);
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4 px-2">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400">Redeem Codes</div>
          <h2 className="mb-2 flex items-center gap-3 text-[28px] font-semibold tracking-tight text-zinc-900">兑换码</h2>
          <p className="text-[13px] font-medium text-zinc-500">生成、查看和维护可用兑换码，保留现有后台逻辑不变。</p>
        </div>
        <button
          onClick={fetchCodes}
          className="flex items-center gap-2 rounded-full bg-white/60 px-5 py-2.5 text-[14px] font-medium text-zinc-800 shadow-sm ring-1 ring-white/80 transition-all hover:bg-white active:scale-95"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin text-zinc-500' : 'text-zinc-500'} />
          刷新数据
        </button>
      </div>

      <div className="rounded-[28px] bg-white/50 p-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <label className="text-[13px] font-semibold text-zinc-700">生成类型</label>
            <select
              value={generateType}
              onChange={(e) => setGenerateType(e.target.value as 'care_plus' | 'king')}
              className="w-full rounded-[14px] border border-transparent bg-zinc-100/60 px-4 py-3 text-[14px] font-medium text-zinc-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-300"
            >
              <option value="care_plus">Care+ 进阶版</option>
              <option value="king">King 无限版</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-semibold text-zinc-700">生成数量</label>
            <input
              type="number"
              min="1"
              max="50"
              value={generateCount}
              onChange={(e) => {
                const value = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                setGenerateCount(value);
              }}
              className="w-full rounded-[14px] border border-transparent bg-zinc-100/60 px-4 py-3 text-[14px] font-medium text-zinc-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-300"
            />
          </div>

          <button
            onClick={handleGenerate}
            className="flex items-center justify-center gap-2 self-end rounded-full bg-zinc-900 px-6 py-3 text-[14px] font-medium text-white shadow-md transition-all hover:bg-black active:scale-95"
          >
            <Plus size={16} />
            批量生成
          </button>
        </div>
      </div>

      <div className="w-full">
        <div className="mb-4 px-2">
          <h3 className="text-[18px] font-semibold text-zinc-800">可用兑换码</h3>
          <p className="text-[13px] text-zinc-400">仅展示当前仍可使用的兑换码。</p>
        </div>

        <div className="grid grid-cols-[minmax(0,1.5fr)_140px_160px_140px_80px] gap-x-6 items-center px-8 py-3 text-[13px] font-medium text-zinc-400 max-lg:hidden">
          <div>兑换码</div>
          <div>类型</div>
          <div>生成时间</div>
          <div>过期时间</div>
          <div className="flex justify-end text-right">操作</div>
        </div>

        <div className="space-y-3">
          {unusedCodes.map((code) => (
            <div
              key={code.code}
              className="grid items-center gap-x-6 gap-y-3 rounded-[20px] bg-white/50 px-8 py-4 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.03)] ring-1 ring-white/80 transition-all duration-300 hover:bg-white/70 hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] lg:grid-cols-[minmax(0,1.5fr)_140px_160px_140px_80px]"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-zinc-400 lg:hidden">兑换码</div>
                <span className="block truncate font-mono text-[14px] font-semibold tracking-tight text-zinc-900" title={code.code}>
                  {code.code}
                </span>
              </div>

              <div>
                <div className="text-[12px] font-medium text-zinc-400 lg:hidden">类型</div>
                <span
                  className={[
                    'inline-flex items-center rounded-[8px] px-2.5 py-1 text-[12px] font-bold tracking-wide ring-1',
                    code.type === 'king'
                      ? 'bg-amber-50/80 text-amber-600 ring-amber-100/70'
                      : 'bg-emerald-50/80 text-emerald-600 ring-emerald-100/70',
                  ].join(' ')}
                >
                  {code.type === 'king' ? 'King' : 'Care+'}
                </span>
              </div>

              <div className="text-[13px] font-medium text-zinc-600">
                <div className="text-[12px] font-medium text-zinc-400 lg:hidden">生成时间</div>
                {format(new Date(code.createdAt), 'yyyy-MM-dd HH:mm')}
              </div>

              <div className="text-[13px] font-medium text-zinc-600">
                <div className="text-[12px] font-medium text-zinc-400 lg:hidden">过期时间</div>
                {format(new Date(code.expiredAt), 'yyyy-MM-dd')}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleCopy(code.code)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-700"
                  title="复制"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => handleDelete(code.code)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-all duration-200 hover:bg-red-50 hover:text-red-500"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {unusedCodes.length === 0 && !loading && (
            <div className="rounded-[20px] bg-white/50 px-8 py-12 text-center text-[14px] font-medium text-zinc-400 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.03)] ring-1 ring-white/80">
              暂无可用兑换码
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
