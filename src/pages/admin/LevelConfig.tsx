import { useEffect, useState } from 'react';
import { Crown, MessageSquareText, RefreshCw, Save, Settings, Shield, Star } from 'lucide-react';

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
  care: { label: '基础版（Care）', icon: Shield, color: 'slate', desc: '适合普通用户' },
  care_plus: { label: '进阶版（Care+）', icon: Star, color: 'indigo', desc: '适合高频用户' },
  king: { label: '旗舰版（King）', icon: Crown, color: 'amber', desc: '适合重度用户' },
};

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
    setConfigs((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [field]: value,
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

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
      slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', iconBg: 'bg-slate-100' },
      indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', iconBg: 'bg-indigo-100' },
      amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', iconBg: 'bg-amber-100' },
    };
    return colors[color] || colors.slate;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">用户配置</h2>
          <p className="mt-2 text-slate-500">管理各等级的 OCR/月额度、小结/月额度与模型配置。</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={reloadAll}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-50"
            title="刷新"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={handleSaveLevelConfig}
            disabled={savingLevel}
            className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save size={18} />
            <span>{savingLevel ? '保存中...' : '保存等级配置'}</span>
          </button>
        </div>
      </div>

      {levelMessage && (
        <div className={`rounded-xl p-4 ${levelMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {levelMessage.text}
        </div>
      )}

      <div className="grid gap-6">
        {Object.entries(levelInfo).map(([level, info]) => {
          const config = configs[level];
          const Icon = info.icon;
          const colorClasses = getColorClasses(info.color);

          return (
            <div key={level} className={`rounded-2xl border-2 p-6 ${colorClasses.bg} ${colorClasses.border}`}>
              <div className="mb-6 flex items-center space-x-3">
                <div className={`rounded-xl p-2.5 ${colorClasses.iconBg}`}>
                  <Icon size={24} className={colorClasses.text} />
                </div>
                <div>
                  <h3 className={`text-xl font-semibold ${colorClasses.text}`}>{info.label}</h3>
                  <p className="text-sm text-slate-500">{info.desc}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="flex items-center space-x-2 font-medium text-slate-700">
                    <Settings size={16} />
                    <span>额度配置</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm text-slate-500">OCR / 月</label>
                      <input
                        type="number"
                        value={config?.ocrLimit || 0}
                        onChange={(event) => updateConfig(level, 'ocrLimit', Number.parseInt(event.target.value, 10) || 0)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-slate-500">小结 / 月</label>
                      <input
                        type="number"
                        value={config?.summaryLimit || 0}
                        onChange={(event) => updateConfig(level, 'summaryLimit', Number.parseInt(event.target.value, 10) || 0)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="flex items-center space-x-2 font-medium text-slate-700">
                    <Settings size={16} />
                    <span>模型配置</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm text-slate-500">OCR 模型</label>
                      <select
                        value={config?.ocrModel || ''}
                        onChange={(event) => updateConfig(level, 'ocrModel', event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {configData?.supportedModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-slate-500">小结模型</label>
                      <select
                        value={config?.summaryModel || ''}
                        onChange={(event) => updateConfig(level, 'summaryModel', event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {configData?.supportedModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center space-x-2 text-slate-900">
          <MessageSquareText size={20} />
          <h3 className="text-xl font-semibold">智能小结提示词</h3>
        </div>
        <p className="text-sm text-slate-500">
          当前系统使用一个提示词插槽（`slot1`），小程序端继续传 `promptSlot: "slot1"` 即可。
        </p>

        {slotMessage && (
          <div className={`rounded-xl p-3 text-sm ${slotMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {slotMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-800">slot1</h4>
              <span className="text-xs text-slate-500">{summaryPrompts.slot1.prompt.trim() ? '已配置' : '未配置'}</span>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">名称</label>
              <input
                value={summaryPrompts.slot1.name}
                onChange={(event) => updatePromptSlot('name', event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">说明</label>
              <input
                value={summaryPrompts.slot1.description}
                onChange={(event) => updatePromptSlot('description', event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">提示词</label>
              <textarea
                rows={10}
                value={summaryPrompts.slot1.prompt}
                onChange={(event) => updatePromptSlot('prompt', event.target.value)}
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleSavePromptSlot}
              disabled={savingSlot}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingSlot ? '保存中...' : '保存提示词'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
