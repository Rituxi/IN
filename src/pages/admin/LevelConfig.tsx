import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Shield, Star, Crown, MessageSquareText } from 'lucide-react';

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
  slot1: { name: 'Slot 1', prompt: '', description: 'Not configured' },
};

const levelInfo = {
  care: { label: 'Care', icon: Shield, color: 'slate', desc: 'Basic users' },
  care_plus: { label: 'Care+', icon: Star, color: 'indigo', desc: 'Advanced users' },
  king: { label: 'King', icon: Crown, color: 'amber', desc: 'Top-tier users' }
};

export default function LevelConfig() {
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
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error('Failed to load level configs');
    }
    const data = await res.json();
    setConfigData(data);
    setConfigs(data.configs || {});
  };

  const fetchSummaryPrompts = async () => {
    const token = localStorage.getItem('adminToken');
    const res = await fetch('/api/admin/summary/prompts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error('Failed to load summary prompts');
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error('Invalid summary prompts response');
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
    } catch (err) {
      console.error(err);
      setLevelMessage({ type: 'error', text: 'Load failed. Please refresh.' });
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
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ configs })
      });
      if (!res.ok) {
        throw new Error('Save failed');
      }
      setLevelMessage({ type: 'success', text: 'Level config saved.' });
      setTimeout(() => setLevelMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setLevelMessage({ type: 'error', text: 'Save failed. Please retry.' });
    } finally {
      setSavingLevel(false);
    }
  };

  const updateConfig = (level: string, field: keyof LevelConfig, value: string | number) => {
    setConfigs(prev => ({
      ...prev,
      [level]: {
        ...prev[level],
        [field]: value
      }
    }));
  };

  const updatePromptSlot = (field: keyof SummaryPromptSlot, value: string) => {
    setSummaryPrompts(prev => ({
      ...prev,
      slot1: {
        ...prev.slot1,
        [field]: value
      }
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
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          slot: 'slot1',
          name: slotData.name,
          prompt: slotData.prompt,
          description: slotData.description
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Save failed');
      }

      if (data.prompts?.slot1 || data.prompt) {
        const slot1 = data.prompts?.slot1 || data.prompt || {};
        setSummaryPrompts({
          slot1: { ...defaultSummaryPrompts.slot1, ...slot1 },
        });
      }

      setSlotMessage({ type: 'success', text: 'Prompt saved.' });
      setTimeout(() => setSlotMessage(null), 2500);
    } catch (err) {
      console.error(err);
      setSlotMessage({ type: 'error', text: 'Prompt save failed.' });
    } finally {
      setSavingSlot(false);
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
      slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', iconBg: 'bg-slate-100' },
      indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', iconBg: 'bg-indigo-100' },
      amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', iconBg: 'bg-amber-100' }
    };
    return colors[color] || colors.slate;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Level Config</h2>
          <p className="text-slate-500 mt-2">Manage quotas, models, and summary prompt slot.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={reloadAll}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
            title="Refresh"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={handleSaveLevelConfig}
            disabled={savingLevel}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
          >
            <Save size={18} />
            <span>{savingLevel ? 'Saving...' : 'Save Level Config'}</span>
          </button>
        </div>
      </div>

      {levelMessage && (
        <div className={`p-4 rounded-xl ${levelMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {levelMessage.text}
        </div>
      )}

      <div className="grid gap-6">
        {Object.entries(levelInfo).map(([level, info]) => {
          const config = configs[level];
          const Icon = info.icon;
          const colorClasses = getColorClasses(info.color);

          return (
            <div key={level} className={`p-6 rounded-2xl border-2 ${colorClasses.bg} ${colorClasses.border}`}>
              <div className="flex items-center space-x-3 mb-6">
                <div className={`p-2.5 rounded-xl ${colorClasses.iconBg}`}>
                  <Icon size={24} className={colorClasses.text} />
                </div>
                <div>
                  <h3 className={`text-xl font-semibold ${colorClasses.text}`}>{info.label}</h3>
                  <p className="text-sm text-slate-500">{info.desc}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-slate-700 flex items-center space-x-2">
                    <Settings size={16} />
                    <span>Quota</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">OCR / month</label>
                      <input
                        type="number"
                        value={config?.ocrLimit || 0}
                        onChange={(e) => updateConfig(level, 'ocrLimit', parseInt(e.target.value, 10) || 0)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">Summary / month</label>
                      <input
                        type="number"
                        value={config?.summaryLimit || 0}
                        onChange={(e) => updateConfig(level, 'summaryLimit', parseInt(e.target.value, 10) || 0)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-slate-700 flex items-center space-x-2">
                    <Settings size={16} />
                    <span>Model</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">OCR model</label>
                      <select
                        value={config?.ocrModel || ''}
                        onChange={(e) => updateConfig(level, 'ocrModel', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {configData?.supportedModels.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">Summary model</label>
                      <select
                        value={config?.summaryModel || ''}
                        onChange={(e) => updateConfig(level, 'summaryModel', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {configData?.supportedModels.map(model => (
                          <option key={model} value={model}>{model}</option>
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

      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center space-x-2 text-slate-900">
          <MessageSquareText size={20} />
          <h3 className="text-xl font-semibold">Summary Prompt</h3>
        </div>
        <p className="text-sm text-slate-500">
          This app now uses one prompt slot (`slot1`). Mini-program can keep using `promptSlot: "slot1"`.
        </p>

        {slotMessage && (
          <div className={`p-3 rounded-xl text-sm ${slotMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {slotMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5">
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-800">slot1</h4>
              <span className="text-xs text-slate-500">
                {summaryPrompts.slot1.prompt.trim() ? 'Configured' : 'Not configured'}
              </span>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input
                value={summaryPrompts.slot1.name}
                onChange={(e) => updatePromptSlot('name', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <input
                value={summaryPrompts.slot1.description}
                onChange={(e) => updatePromptSlot('description', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Prompt</label>
              <textarea
                rows={10}
                value={summaryPrompts.slot1.prompt}
                onChange={(e) => updatePromptSlot('prompt', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>

            <button
              onClick={handleSavePromptSlot}
              disabled={savingSlot}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {savingSlot ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
