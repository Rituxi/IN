import { useEffect, useState } from 'react';
import { CheckCircle2, Crown, MessageSquareText, RefreshCw, Save, Shield, Star } from 'lucide-react';

interface LevelConfig {
  ocrLimit: number;
  summaryLimit: number;
  ocrModel: string;
  summaryModel: string;
}

interface ConfigData {
  configs: Record<string, LevelConfig>;
  supportedModels: string[];
}

type SummaryPromptKey = 'slot1';

interface SummaryPromptSlot {
  name: string;
  prompt: string;
  description: string;
}

type SummaryPrompts = Record<SummaryPromptKey, SummaryPromptSlot>;

const defaultSummaryPrompts: SummaryPrompts = {
  slot1: { name: '插槽 1', prompt: '', description: '未配置' },
};

const levelInfo = {
  care: { label: 'Care 基础版', icon: Shield, iconWrap: 'bg-zinc-100 text-zinc-500 ring-zinc-200/50' },
  care_plus: { label: 'Care+ 进阶版', icon: Star, iconWrap: 'bg-blue-50 text-blue-500 ring-blue-100/50' },
  king: { label: 'King 无限版', icon: Crown, iconWrap: 'bg-amber-50 text-amber-500 ring-amber-100/50' },
} as const;

export default function LevelConfigPage() {
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [configs, setConfigs] = useState<Record<string, LevelConfig>>({});
  const [summaryPrompts, setSummaryPrompts] = useState<SummaryPrompts>(defaultSummaryPrompts);
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [levelMessage, setLevelMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [slotMessage, setSlotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    const token = localStorage.getItem('adminToken');
    const res = await fetch('/api/admin/level-configs', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error('加载等级配置失败');
    }
    const data = await res.json();
    setConfigData(data);
    setConfigs(data.configs || {});
  };

  const fetchSummaryPrompts = async () => {
    const token = localStorage.getItem('adminToken');
    const res = await fetch('/api/admin/summary/prompts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error('加载小结提示词失败');
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error('小结提示词返回格式异常');
    }
    const slot1 = data.prompts?.slot1 || data.prompt || {};
    setSummaryPrompts({
      slot1: { ...defaultSummaryPrompts.slot1, ...slot1 },
    });
  };

  const reloadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchConfig(), fetchSummaryPrompts()]);
    } catch (error) {
      console.error(error);
      setLevelMessage({ type: 'error', text: '加载失败，请刷新后重试。' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadAll();
  }, []);

  const handleSaveLevelConfig = async () => {
    setSavingLevel(true);
    setLevelMessage(null);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/level-configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ configs }),
      });
      if (!res.ok) {
        throw new Error('保存失败');
      }
      setLevelMessage({ type: 'success', text: '等级配置已保存。' });
      setTimeout(() => setLevelMessage(null), 3000);
    } catch (error) {
      console.error(error);
      setLevelMessage({ type: 'error', text: '保存失败，请稍后重试。' });
    } finally {
      setSavingLevel(false);
    }
  };

  const updateConfig = (level: string, field: keyof LevelConfig, value: string | number) => {
    const nextValue =
      field === 'ocrLimit' || field === 'summaryLimit'
        ? Math.max(0, Number(value) || 0)
        : value;

    setConfigs((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [field]: nextValue,
      },
    }));
  };

  const updatePromptSlot = (field: keyof SummaryPromptSlot, value: string) => {
    setSummaryPrompts((prev) => ({
      ...prev,
      slot1: {
        ...prev.slot1,
        [field]: value,
      },
    }));
  };

  const handleSavePromptSlot = async () => {
    setSavingSlot(true);
    setSlotMessage(null);
    try {
      const token = localStorage.getItem('adminToken');
      const slotData = summaryPrompts.slot1;
      const res = await fetch('/api/admin/summary/prompts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slot: 'slot1',
          name: slotData.name,
          prompt: slotData.prompt,
          description: slotData.description,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '保存失败');
      }

      if (data.prompts?.slot1 || data.prompt) {
        const slot1 = data.prompts?.slot1 || data.prompt || {};
        setSummaryPrompts({
          slot1: { ...defaultSummaryPrompts.slot1, ...slot1 },
        });
      }

      setSlotMessage({ type: 'success', text: '提示词已保存。' });
      setTimeout(() => setSlotMessage(null), 2500);
    } catch (error) {
      console.error(error);
      setSlotMessage({ type: 'error', text: '提示词保存失败。' });
    } finally {
      setSavingSlot(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500">
        <RefreshCw size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4 px-2">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400">Level Configuration</div>
          <h2 className="mb-2 flex items-center gap-3 text-[28px] font-semibold tracking-tight text-zinc-900">等级配置</h2>
          <p className="text-[13px] font-medium text-zinc-500">极简矩阵配置，统一管理各等级的配额与模型路由。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={reloadAll}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/60 text-zinc-700 shadow-sm ring-1 ring-white/80 transition-all hover:bg-white active:scale-95"
            title="刷新配置"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleSaveLevelConfig}
            disabled={savingLevel}
            className="flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-2.5 text-[14px] font-medium text-white shadow-md transition-all hover:bg-black active:scale-95 disabled:opacity-60"
          >
            <Save size={16} />
            {savingLevel ? '保存中...' : '保存系统配置'}
          </button>
        </div>
      </div>

      {levelMessage && (
        <div
          className={[
            'rounded-[16px] px-4 py-3 text-[13px] font-medium',
            levelMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
          ].join(' ')}
        >
          {levelMessage.text}
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] bg-white/50 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
        <div className="grid grid-cols-[160px_120px_120px_1fr_1fr] gap-6 border-b border-zinc-200/50 bg-white/40 px-8 py-4 text-[13px] font-medium text-zinc-400 max-lg:hidden">
          <div>会员等级</div>
          <div>OCR 额度/月</div>
          <div>小结 额度/月</div>
          <div>OCR 模型路由</div>
          <div>小结 模型路由</div>
        </div>

        <div className="divide-y divide-zinc-200/50">
          {Object.entries(levelInfo).map(([level, info]) => {
            const config = configs[level];
            const Icon = info.icon;

            return (
              <div
                key={level}
                className="grid items-center gap-6 px-8 py-5 transition-colors hover:bg-white/60 lg:grid-cols-[160px_120px_120px_1fr_1fr]"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 ${info.iconWrap}`}>
                    <Icon size={14} />
                  </div>
                  <span className="text-[14px] font-semibold text-zinc-900">{info.label}</span>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-medium text-zinc-400 lg:hidden">OCR 额度/月</div>
                  <input
                    type="number"
                    value={config?.ocrLimit || 0}
                    onChange={(event) => updateConfig(level, 'ocrLimit', Number.parseInt(event.target.value, 10) || 0)}
                    className="w-full rounded-[10px] border border-transparent bg-zinc-100/50 px-3 py-2.5 text-center text-[14px] font-semibold text-zinc-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-medium text-zinc-400 lg:hidden">小结 额度/月</div>
                  <input
                    type="number"
                    value={config?.summaryLimit || 0}
                    onChange={(event) => updateConfig(level, 'summaryLimit', Number.parseInt(event.target.value, 10) || 0)}
                    className="w-full rounded-[10px] border border-transparent bg-zinc-100/50 px-3 py-2.5 text-center text-[14px] font-semibold text-zinc-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-medium text-zinc-400 lg:hidden">OCR 模型路由</div>
                  <select
                    value={config?.ocrModel || ''}
                    onChange={(event) => updateConfig(level, 'ocrModel', event.target.value)}
                    className="w-full appearance-none rounded-[10px] border border-transparent bg-zinc-100/50 px-4 py-2.5 text-[13px] font-medium text-zinc-700 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-200"
                  >
                    {configData?.supportedModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-medium text-zinc-400 lg:hidden">小结 模型路由</div>
                  <select
                    value={config?.summaryModel || ''}
                    onChange={(event) => updateConfig(level, 'summaryModel', event.target.value)}
                    className="w-full appearance-none rounded-[10px] border border-transparent bg-zinc-100/50 px-4 py-2.5 text-[13px] font-medium text-zinc-700 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-zinc-200"
                  >
                    {configData?.supportedModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[28px] bg-white/50 p-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
        <div className="mb-2 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-200/50">
            <MessageSquareText size={18} />
          </div>
          <div>
            <h3 className="text-[18px] font-bold text-zinc-900">智能小结提示词</h3>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              当前系统先使用一个提示词插槽 <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">slot1</code>，后续如果扩展多个槽位，也能继续沿用这套结构。
            </p>
          </div>
        </div>

        {slotMessage && (
          <div
            className={[
              'mt-4 rounded-[16px] px-4 py-3 text-[13px] font-medium',
              slotMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
            ].join(' ')}
          >
            {slotMessage.text}
          </div>
        )}

        <div className="mt-5 rounded-[20px] bg-zinc-50/60 p-5 ring-1 ring-zinc-200/50">
          <div className="mb-5 flex items-center justify-between">
            <div className="rounded-[8px] bg-white px-3 py-1 text-[14px] font-mono font-semibold text-zinc-800 shadow-sm ring-1 ring-zinc-200/50">slot1</div>
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-emerald-100/50">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="text-emerald-600">{summaryPrompts.slot1.prompt.trim() ? '已配置' : '未配置'}</span>
            </div>
          </div>

          <div className="mb-5 flex gap-5 max-md:flex-col">
            <div className="w-1/3 max-md:w-full">
              <label className="mb-2 ml-1 block text-[13px] font-semibold text-zinc-700">名称</label>
              <input
                value={summaryPrompts.slot1.name}
                onChange={(event) => updatePromptSlot('name', event.target.value)}
                className="w-full rounded-[12px] border-none bg-white px-4 py-2.5 text-[14px] font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200/50 outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>

            <div className="flex-1">
              <label className="mb-2 ml-1 block text-[13px] font-semibold text-zinc-700">说明</label>
              <input
                value={summaryPrompts.slot1.description}
                onChange={(event) => updatePromptSlot('description', event.target.value)}
                className="w-full rounded-[12px] border-none bg-white px-4 py-2.5 text-[14px] text-zinc-800 shadow-sm ring-1 ring-zinc-200/50 outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-2 ml-1 block text-[13px] font-semibold text-zinc-700">提示词</label>
            <textarea
              rows={10}
              value={summaryPrompts.slot1.prompt}
              onChange={(event) => updatePromptSlot('prompt', event.target.value)}
              className="min-h-[180px] w-full resize-y rounded-[16px] border-none bg-white px-4 py-3.5 font-mono text-[14px] leading-relaxed text-zinc-700 shadow-inner ring-1 ring-zinc-200/50 outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>

          <button
            onClick={handleSavePromptSlot}
            disabled={savingSlot}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-zinc-900 py-3.5 text-[14px] font-medium text-white shadow-md transition-all hover:bg-black active:scale-95 disabled:opacity-60"
          >
            <Save size={16} />
            {savingSlot ? '保存中...' : '保存提示词'}
          </button>
        </div>
      </div>

    </div>
  );
}
