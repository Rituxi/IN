import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Shield, Star, Crown } from 'lucide-react';

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

const levelInfo = {
  care: { label: 'Care', icon: Shield, color: 'slate', desc: '基础用户等级' },
  care_plus: { label: 'Care+', icon: Star, color: 'indigo', desc: '进阶用户等级' },
  king: { label: 'King', icon: Crown, color: 'amber', desc: '高级用户等级' }
};

export default function LevelConfig() {
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [configs, setConfigs] = useState<Record<string, LevelConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/level-configs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfigData(data);
        setConfigs(data.configs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
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
      if (res.ok) {
        setMessage({ type: 'success', text: '配置保存成功！' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存失败，请重试' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
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
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">等级配置</h2>
          <p className="text-slate-500 mt-2">配置各用户等级的次数限制和模型设置</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchConfig}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
          >
            <Save size={18} />
            <span>{saving ? '保存中...' : '保存配置'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
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
                    <span>次数限制</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">智能OCR 次数/月</label>
                      <input
                        type="number"
                        value={config?.ocrLimit || 0}
                        onChange={(e) => updateConfig(level, 'ocrLimit', parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">智能小结 次数/月</label>
                      <input
                        type="number"
                        value={config?.summaryLimit || 0}
                        onChange={(e) => updateConfig(level, 'summaryLimit', parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-slate-700 flex items-center space-x-2">
                    <Settings size={16} />
                    <span>模型配置</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-slate-500 mb-1">智能OCR 模型</label>
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
                      <label className="block text-sm text-slate-500 mb-1">智能小结 模型</label>
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

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <h4 className="font-medium text-blue-700 mb-2">配置说明</h4>
        <ul className="text-sm text-blue-600 space-y-1">
          <li>• 次数限制：每月可使用次数，King 等级建议设置为 9999 表示无限制</li>
          <li>• 模型配置：不同等级可使用不同性能的 Gemini 模型</li>
          <li>• 修改配置后点击「保存配置」即可生效，新用户将使用新配置</li>
          <li>• 已有用户的额度需要手动调整或在等级变更时自动更新</li>
        </ul>
      </div>
    </div>
  );
}
