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
  care: { label: 'Care 基础版', icon: Shield, desc: '适合普通用户，额度较基础。', panelTone: 'border-[var(--color-ink-200)] bg-[var(--color-ink-50)]' },
  care_plus: { label: 'Care+ 进阶版', icon: Star, desc: '适合高频用户，额度更高。', panelTone: 'border-sky-200 bg-sky-50/70' },
  king: { label: 'King 无限版', icon: Crown, desc: '适合重度用户，强调无限和更高模型。', panelTone: 'border-amber-200 bg-amber-50/70' },
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--color-ink-700)]">
        <RefreshCw size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-[linear-gradient(135deg,rgba(47,127,121,0.12),rgba(255,255,255,0.96))] p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-700)]">Level Configuration</div>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--color-ink-950)]">等级配置</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">统一管理各等级的 OCR 配额、智能小结配额、模型和小结提示词。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={reloadAll}
            className="rounded-2xl border border-white/80 bg-white/90 p-3 text-[var(--color-ink-900)] transition hover:bg-white"
            title="刷新"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={handleSaveLevelConfig}
            disabled={savingLevel}
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-brand-600)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] disabled:opacity-60"
          >
            <Save size={16} />
            {savingLevel ? '保存中...' : '保存等级配置'}
          </button>
        </div>
      </section>

      {levelMessage && (
        <div
          className={[
            'rounded-2xl px-4 py-3 text-sm font-medium',
            levelMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
          ].join(' ')}
        >
          {levelMessage.text}
        </div>
      )}

      <section className="grid gap-5">
        {Object.entries(levelInfo).map(([level, info]) => {
          const config = configs[level];
          const Icon = info.icon;

          return (
            <article key={level} className={`rounded-[30px] border p-6 shadow-[0_18px_60px_-42px_rgba(16,33,43,0.28)] ${info.panelTone}`}>
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--color-ink-900)] shadow-sm">
                  <Icon size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--color-ink-950)]">{info.label}</h3>
                  <p className="mt-1 text-sm text-[var(--color-ink-700)]">{info.desc}</p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-[24px] border border-white/80 bg-white/85 p-5">
                  <h4 className="flex items-center gap-2 font-semibold text-[var(--color-ink-900)]">
                    <Settings size={16} />
                    额度配置
                  </h4>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-[var(--color-ink-700)]">OCR / 月</label>
                      <input
                        type="number"
                        value={config?.ocrLimit || 0}
                        onChange={(event) => updateConfig(level, 'ocrLimit', Number.parseInt(event.target.value, 10) || 0)}
                        className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-[var(--color-ink-700)]">小结 / 月</label>
                      <input
                        type="number"
                        value={config?.summaryLimit || 0}
                        onChange={(event) => updateConfig(level, 'summaryLimit', Number.parseInt(event.target.value, 10) || 0)}
                        className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/80 bg-white/85 p-5">
                  <h4 className="flex items-center gap-2 font-semibold text-[var(--color-ink-900)]">
                    <Settings size={16} />
                    模型配置
                  </h4>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm text-[var(--color-ink-700)]">OCR 模型</label>
                      <select
                        value={config?.ocrModel || ''}
                        onChange={(event) => updateConfig(level, 'ocrModel', event.target.value)}
                        className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
                      >
                        {configData?.supportedModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-[var(--color-ink-700)]">小结模型</label>
                      <select
                        value={config?.summaryModel || ''}
                        onChange={(event) => updateConfig(level, 'summaryModel', event.target.value)}
                        className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
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
            </article>
          );
        })}
      </section>

      <section className="rounded-[30px] border border-[var(--color-ink-200)] bg-white p-6 shadow-[0_18px_60px_-38px_rgba(16,33,43,0.35)]">
        <div className="flex items-center gap-2 text-[var(--color-ink-950)]">
          <MessageSquareText size={20} />
          <h3 className="text-xl font-bold">智能小结提示词</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">当前系统先使用一个提示词插槽 `slot1`，后续如果扩展多个槽位，也能继续沿用这套结构。</p>

        {slotMessage && (
          <div
            className={[
              'mt-4 rounded-2xl px-4 py-3 text-sm font-medium',
              slotMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
            ].join(' ')}
          >
            {slotMessage.text}
          </div>
        )}

        <div className="mt-5 rounded-[26px] border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-5">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-[var(--color-ink-950)]">slot1</h4>
            <span className="text-xs font-semibold text-[var(--color-ink-700)]">{summaryPrompts.slot1.prompt.trim() ? '已配置' : '未配置'}</span>
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="mb-2 block text-sm text-[var(--color-ink-700)]">名称</label>
              <input
                value={summaryPrompts.slot1.name}
                onChange={(event) => updatePromptSlot('name', event.target.value)}
                className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-white px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--color-ink-700)]">说明</label>
              <input
                value={summaryPrompts.slot1.description}
                onChange={(event) => updatePromptSlot('description', event.target.value)}
                className="w-full rounded-2xl border border-[var(--color-ink-200)] bg-white px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--color-ink-700)]">提示词</label>
              <textarea
                rows={10}
                value={summaryPrompts.slot1.prompt}
                onChange={(event) => updatePromptSlot('prompt', event.target.value)}
                className="w-full resize-y rounded-2xl border border-[var(--color-ink-200)] bg-white px-4 py-3 outline-none transition focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[rgba(47,127,121,0.12)]"
              />
            </div>

            <button
              onClick={handleSavePromptSlot}
              disabled={savingSlot}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-600)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] disabled:opacity-60"
            >
              <Save size={16} />
              {savingSlot ? '保存中...' : '保存提示词'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
