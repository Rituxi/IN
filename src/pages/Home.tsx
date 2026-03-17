import React, { useState, useEffect } from 'react';
import { Upload, FileText, Image as ImageIcon, Loader2, Copy, Download, History, Trash2, Check, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface HistoryItem {
  id: string;
  type: 'ocr' | 'summary';
  timestamp: string;
  fileName: string;
  data: any;
}

interface MedicalRecord {
  title: string;
  date: string;
  hospital: string;
  doctor: string;
  items: Array<{
    name?: string;
    itemName?: string;
    value?: string;
    result?: string;
    unit: string;
    range: string;
  }>;
  notes: string;
}

function formatToMedicalRecords(data: any): { medicalRecords: MedicalRecord[] } {
  const record: MedicalRecord = {
    title: data.title || '检查单导入',
    date: data.date || new Date().toISOString().split('T')[0],
    hospital: data.hospital || '',
    doctor: data.doctor || '',
    items: (data.items || []).map((item: any) => ({
      name: item.name || '',
      itemName: item.itemName || item.name || '',
      value: item.value || '',
      result: item.result || item.value || '',
      unit: item.unit || '',
      range: item.range || ''
    })),
    notes: data.notes || '检查单识别导入'
  };

  return { medicalRecords: [record] };
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userId] = useState(() => {
    const stored = localStorage.getItem('userId');
    if (stored) return stored;
    const newId = `web_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem('userId', newId);
    return newId;
  });

  useEffect(() => {
    const stored = localStorage.getItem('ocrHistory');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse history:', e);
      }
    }
  }, []);

  const saveToHistory = (type: 'ocr' | 'summary', fileName: string, data: any) => {
    const newItem: HistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      fileName,
      data
    };
    const updated = [newItem, ...history].slice(0, 50);
    setHistory(updated);
    localStorage.setItem('ocrHistory', JSON.stringify(updated));
  };

  const deleteHistoryItem = (id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem('ocrHistory', JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('ocrHistory');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        const items = jsonData.map((row: any) => ({
          name: row['检查项目'] || '',
          value: String(row['检查结果'] || ''),
          unit: row['单位'] || '',
          range: String(row['参考范围'] || '')
        }));

        const examData = {
          date: jsonData[0]?.['日期'] || new Date().toISOString().split('T')[0],
          items
        };

        const res = await fetch('/api/summary/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, examData, promptSlot: 'slot1', nickname: 'Web User', userLevel: 'care', model: 'gemini-2.5-flash' })
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Error processing Excel');
        
        const resultData = { type: 'summary' as const, data: json };
        setResult(resultData);
        saveToHistory('summary', file.name, json);
      } else {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          try {
            const res = await fetch('/api/analyze/image-base64', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64, mimeType: file.type, userId, nickname: 'Web User' })
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.message || 'Error processing image');
            const resultData = { type: 'ocr' as const, data: json };
            setResult(resultData);
            saveToHistory('ocr', file.name, json);
          } catch (err: any) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    const formattedData = formatToMedicalRecords(result.data);
    try {
      await navigator.clipboard.writeText(JSON.stringify(formattedData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const exportCSV = () => {
    if (!result || result.type !== 'ocr') return;
    const items = result.data.items || [];
    if (items.length === 0) return;

    const headers = ['name', 'value', 'unit', 'range'];
    const csvContent = [
      headers.join(','),
      ...items.map((item: any) => 
        headers.map(h => `"${(item[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medical_records_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setResult({ type: item.type, data: item.data });
    setShowHistory(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="text-center space-y-4 pt-12">
          <h1 className="text-4xl font-semibold tracking-tight">智能报告单识别</h1>
          <p className="text-slate-500 text-lg">上传您的检查报告单图片或历史记录Excel，获取智能解析与小结。</p>
        </header>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <History size={18} />
              <span>历史记录 ({history.length})</span>
            </button>
          </div>

          {showHistory && (
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 max-h-80 overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-slate-700">识别历史</h3>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center space-x-1"
                  >
                    <Trash2 size={14} />
                    <span>清空</span>
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无历史记录</p>
              ) : (
                <div className="space-y-2">
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
                    >
                      <button
                        onClick={() => loadFromHistory(item)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center space-x-2">
                          {item.type === 'ocr' ? (
                            <ImageIcon size={16} className="text-blue-500" />
                          ) : (
                            <FileText size={16} className="text-emerald-500" />
                          )}
                          <span className="font-medium text-sm truncate max-w-[200px]">{item.fileName}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(item.timestamp).toLocaleString('zh-CN')}
                        </p>
                      </button>
                      <button
                        onClick={() => deleteHistoryItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
            <input 
              type="file" 
              accept="image/*,.xlsx,.xls" 
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                <Upload size={32} />
              </div>
              <div>
                <p className="font-medium text-lg">点击或拖拽文件到此处</p>
                <p className="text-slate-500 text-sm mt-1">支持 JPG, PNG, Excel 格式</p>
              </div>
            </div>
          </div>

          {file && (
            <div className="mt-6 flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex items-center space-x-3">
                {file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? (
                  <FileText className="text-emerald-500" />
                ) : (
                  <ImageIcon className="text-blue-500" />
                )}
                <span className="font-medium truncate max-w-xs">{file.name}</span>
              </div>
              <button 
                onClick={handleUpload}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-full font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                <span>{loading ? '处理中...' : '开始识别'}</span>
              </button>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">识别结果</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-sm font-medium"
                >
                  {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  <span>{copied ? '已复制' : '复制 JSON'}</span>
                </button>
                {result.type === 'ocr' && (
                  <button
                    onClick={exportCSV}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl transition-colors text-sm font-medium"
                  >
                    <Download size={16} />
                    <span>导出 CSV</span>
                  </button>
                )}
              </div>
            </div>
            
            {result.type === 'ocr' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500">标题:</span> <span className="font-medium">{result.data.title}</span></div>
                  <div><span className="text-slate-500">日期:</span> <span className="font-medium">{result.data.date}</span></div>
                  <div><span className="text-slate-500">医院:</span> <span className="font-medium">{result.data.hospital}</span></div>
                  <div><span className="text-slate-500">医生:</span> <span className="font-medium">{result.data.doctor}</span></div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-sm">
                        <th className="py-3 font-medium">项目名称</th>
                        <th className="py-3 font-medium">结果</th>
                        <th className="py-3 font-medium">参考范围</th>
                        <th className="py-3 font-medium">单位</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {result.data.items?.map((item: any, i: number) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 font-medium">{item.name}</td>
                          <td className="py-3">{item.value}</td>
                          <td className="py-3 text-slate-500">{item.range}</td>
                          <td className="py-3 text-slate-500">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {result.data.notes && (
                  <div className="p-4 bg-amber-50 text-amber-800 rounded-xl text-sm">
                    <span className="font-semibold">备注: </span>{result.data.notes}
                  </div>
                )}
              </div>
            )}

            {result.type === 'summary' && (
              <div className="space-y-4">
                <div className="p-6 bg-indigo-50 text-indigo-900 rounded-2xl leading-relaxed">
                  {result.data.summary}
                </div>
                <div className="text-sm text-slate-500 text-right">
                  剩余可用次数: {result.data.quota?.remaining}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
