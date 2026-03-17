import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
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
  if (Array.isArray(data?.records) && data.records.length > 0) {
    return {
      medicalRecords: data.records.map((record: any) => ({
        title: record.title || data.title || '检查报告',
        date: record.date || new Date().toISOString().split('T')[0],
        hospital: record.hospital || data.hospital || '',
        doctor: record.doctor || data.doctor || '',
        items: (record.items || []).map((item: any) => ({
          name: item.name || '',
          itemName: item.itemName || item.name || '',
          value: item.value || '',
          result: item.result || item.value || '',
          unit: item.unit || '',
          range: item.range || '',
        })),
        notes: record.notes || data.notes || '',
      })),
    };
  }

  const record: MedicalRecord = {
    title: data.title || '检查报告',
    date: data.date || new Date().toISOString().split('T')[0],
    hospital: data.hospital || '',
    doctor: data.doctor || '',
    items: (data.items || []).map((item: any) => ({
      name: item.name || '',
      itemName: item.itemName || item.name || '',
      value: item.value || '',
      result: item.result || item.value || '',
      unit: item.unit || '',
      range: item.range || '',
    })),
    notes: data.notes || '',
  };

  return { medicalRecords: [record] };
}

function isExcelFile(file: File): boolean {
  return /\.xlsx?$/i.test(file.name);
}

async function parseExcelToOcrResult(fileName: string, worksheet: XLSX.WorkSheet): Promise<any> {
  const pickField = (row: any, aliases: string[]) => {
    for (const key of aliases) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  };

  const normalizeDate = (value: any) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const match = text.match(/(\d{4})[./\-年](\d{1,2})[./\-月](\d{1,2})/);
    if (match) {
      return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
    }
    return text;
  };

  const buildResultFromRows = (rows: any[]): any | null => {
    if (!rows.length) return null;
    const title = fileName.replace(/\.(xlsx|xls)$/i, '') || 'Excel 检查报告';
    const dateAliases = ['日期', '检查日期', '报告日期', 'date', 'Date'];
    const recordsByDate = new Map<string, any>();

    for (const row of rows) {
      const item = {
        name: pickField(row, ['检查项目', '项目名称', '指标', 'name', 'itemName', 'Name']),
        value: pickField(row, ['检查结果', '结果', '数值', 'value', 'result', 'Result']),
        unit: pickField(row, ['单位', 'unit', 'Unit']),
        range: pickField(row, ['参考范围', '参考值', '正常范围', 'range', 'referenceRange', 'Range']),
      };
      if (!item.name && !item.value && !item.unit && !item.range) continue;

      const rowDate = normalizeDate(pickField(row, dateAliases)) || new Date().toISOString().split('T')[0];
      if (!recordsByDate.has(rowDate)) {
        recordsByDate.set(rowDate, {
          title,
          date: rowDate,
          hospital: pickField(row, ['医院', '医院名称', 'hospital', 'Hospital']),
          doctor: pickField(row, ['医生', '医师', 'doctor', 'Doctor']),
          notes: pickField(row, ['备注', '说明', 'notes', 'Notes']),
          items: [],
        });
      }
      recordsByDate.get(rowDate).items.push(item);
    }

    const records = Array.from(recordsByDate.values()).filter((record) => record.items.length > 0);
    if (!records.length) return null;

    return {
      title,
      date: records[0].date,
      hospital: records[0].hospital,
      doctor: records[0].doctor,
      notes: records[0].notes,
      items: records[0].items,
      records,
    };
  };

  const buildResultFromWideTable = (
    matrix: any[][],
    aiMap: { dateColumnIndex: number; mappings: Array<{ columnIndex: number; id?: string; name?: string; category?: string }> } | null,
  ): any | null => {
    if (!matrix.length) return null;
    const toText = (value: any) => String(value ?? '').trim();

    let headerRowIndex = -1;
    let bestScore = -1;
    const scanCount = Math.min(matrix.length, 20);
    for (let i = 0; i < scanCount; i++) {
      const row = matrix[i] || [];
      const textCells = row.map(toText).filter(Boolean);
      if (textCells.length < 3) continue;
      const score = textCells.length;
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = i;
      }
    }
    if (headerRowIndex < 0) return null;

    const headerRow = matrix[headerRowIndex] || [];
    const headerMap = headerRow.map((cell: any, index: number) => ({ index, text: toText(cell) }));
    const nonEmptyHeaders = headerMap.filter((h) => h.text);
    if (nonEmptyHeaders.length < 3) return null;

    let dateColIndex = aiMap?.dateColumnIndex ?? -1;
    if (!Number.isInteger(dateColIndex) || dateColIndex < 0 || dateColIndex >= headerRow.length) {
      const detected = headerMap.find((h) => /日期|时间|date|day/i.test(h.text));
      dateColIndex = detected ? detected.index : 0;
    }

    let itemColumns = (aiMap?.mappings || [])
      .filter((m) => Number.isInteger(m.columnIndex) && m.columnIndex >= 0 && m.columnIndex < headerRow.length && m.columnIndex !== dateColIndex)
      .map((m) => ({
        columnIndex: m.columnIndex,
        name: toText(m.name) || toText(headerRow[m.columnIndex]),
      }));

    if (!itemColumns.length) {
      itemColumns = headerMap
        .filter((h) => h.index !== dateColIndex && h.text)
        .map((h) => ({ columnIndex: h.index, name: h.text }));
    }

    const records: any[] = [];
    for (const row of matrix.slice(headerRowIndex + 1)) {
      const rowCells = row || [];
      const rawDate = toText(rowCells[dateColIndex]);
      const dateValue = normalizeDate(rawDate);
      if (!dateValue) continue;

      const items = itemColumns
        .map((col) => {
          const value = toText(rowCells[col.columnIndex]);
          if (!value) return null;
          return { name: col.name, value, unit: '', range: '' };
        })
        .filter((item): item is { name: string; value: string; unit: string; range: string } => !!item);

      if (!items.length) continue;

      records.push({
        title: fileName.replace(/\.(xlsx|xls)$/i, '') || 'Excel 检查报告',
        date: dateValue,
        hospital: '',
        doctor: '',
        notes: '',
        items,
      });
    }

    if (!records.length) return null;
    return {
      title: records[0].title,
      date: records[0].date,
      hospital: records[0].hospital,
      doctor: records[0].doctor,
      notes: records[0].notes,
      items: records[0].items,
      records,
    };
  };

  const objectRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
  const directResult = buildResultFromRows(objectRows);
  if (directResult) return directResult;

  const matrixRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
  if (!matrixRows.length) {
    throw new Error('Excel 文件没有数据');
  }

  let aiMap: { dateColumnIndex: number; mappings: Array<{ columnIndex: number; id?: string; name?: string; category?: string }> } | null = null;
  try {
    let headerRowIndex = 0;
    let maxTextCells = -1;
    for (let i = 0; i < Math.min(matrixRows.length, 20); i++) {
      const row = matrixRows[i] || [];
      const textCellCount = row.map((cell) => String(cell ?? '').trim()).filter(Boolean).length;
      if (textCellCount > maxTextCells) {
        maxTextCells = textCellCount;
        headerRowIndex = i;
      }
    }
    const headers = (matrixRows[headerRowIndex] || [])
      .map((cell, index) => ({ index, text: String(cell ?? '').trim() }))
      .filter((h) => h.text);

    if (headers.length > 0) {
      const resp = await fetch('/api/analyze/excel-header', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers }),
      });
      if (resp.ok) {
        const json = await resp.json();
        aiMap = {
          dateColumnIndex: Number.isInteger(json?.dateColumnIndex) ? json.dateColumnIndex : -1,
          mappings: Array.isArray(json?.mappings) ? json.mappings : [],
        };
      }
    }
  } catch (error) {
    console.warn('Excel header AI mapping failed, fallback to local parser:', error);
  }

  const wideTableResult = buildResultFromWideTable(matrixRows, aiMap);
  if (wideTableResult) return wideTableResult;

  throw new Error('未识别到可用的检查项目数据');
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
      } catch (event) {
        console.error('解析历史记录失败:', event);
      }
    }
  }, []);

  const saveToHistory = (type: 'ocr' | 'summary', fileName: string, data: any) => {
    const newItem: HistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      fileName,
      data,
    };
    const updated = [newItem, ...history].slice(0, 50);
    setHistory(updated);
    localStorage.setItem('ocrHistory', JSON.stringify(updated));
  };

  const deleteHistoryItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    localStorage.setItem('ocrHistory', JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('ocrHistory');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
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
      if (isExcelFile(file)) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelResult = await parseExcelToOcrResult(file.name, worksheet);
        const resultData = { type: 'ocr' as const, data: excelResult };
        setResult(resultData);
        saveToHistory('ocr', file.name, excelResult);
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.onerror = () => reject(new Error('读取图片失败'));
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/analyze/image-base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: file.type, userId, nickname: '网页用户' }),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.message || '图片识别失败');
        }
        const resultData = { type: 'ocr' as const, data: json };
        setResult(resultData);
        saveToHistory('ocr', file.name, json);
      }
    } catch (event: any) {
      setError(event.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    const content = result.type === 'ocr' ? formatToMedicalRecords(result.data) : result.data;
    try {
      await navigator.clipboard.writeText(JSON.stringify(content, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (event) {
      console.error('复制失败:', event);
    }
  };

  const exportJSON = () => {
    if (!result || result.type !== 'ocr') return;
    const formattedData = formatToMedicalRecords(result.data);
    const blob = new Blob([JSON.stringify(formattedData, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `检查记录_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setResult({ type: item.type, data: item.data });
    setShowHistory(false);
  };

  const ocrRecords =
    result?.type === 'ocr'
      ? Array.isArray(result.data?.records) && result.data.records.length > 0
        ? result.data.records
        : [result.data]
      : [];

  const primaryOcrRecord = ocrRecords[0] || null;
  const hasMultipleOcrRecords = ocrRecords.length > 1;
  const ocrTableRows =
    result?.type === 'ocr'
      ? hasMultipleOcrRecords
        ? ocrRecords.flatMap((record: any) =>
            (record.items || []).map((item: any) => ({
              ...item,
              recordDate: record.date || '',
            })),
          )
        : primaryOcrRecord?.items || []
      : [];

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-4 pt-12 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">指标笔记·Inno 检查单识别</h1>
          <p className="text-lg text-slate-500">上传医疗检查图片或 Excel，快速得到结构化 JSON 结果。</p>
        </header>

        <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center space-x-2 rounded-xl px-4 py-2 text-slate-600 transition-colors hover:bg-slate-100"
            >
              <History size={18} />
              <span>历史记录 ({history.length})</span>
            </button>
          </div>

          {showHistory && (
            <div className="mb-6 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-slate-700">最近识别结果</h3>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="flex items-center space-x-1 text-xs text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                    <span>清空</span>
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">暂无历史记录</p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-slate-200"
                    >
                      <button onClick={() => loadFromHistory(item)} className="flex-1 text-left">
                        <div className="flex items-center space-x-2">
                          {item.type === 'ocr' ? (
                            <ImageIcon size={16} className="text-blue-500" />
                          ) : (
                            <FileText size={16} className="text-emerald-500" />
                          )}
                          <span className="max-w-[200px] truncate text-sm font-medium">{item.fileName}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{new Date(item.timestamp).toLocaleString('zh-CN')}</p>
                      </button>
                      <button
                        onClick={() => deleteHistoryItem(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center transition-colors hover:bg-slate-50">
            <input
              type="file"
              accept="image/*,.xlsx,.xls"
              onChange={handleFileChange}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <div className="flex flex-col items-center space-y-4">
              <div className="rounded-full bg-indigo-50 p-4 text-indigo-600">
                <Upload size={32} />
              </div>
              <div>
                <p className="text-lg font-medium">将文件拖到这里，或点击上传</p>
                <p className="mt-1 text-sm text-slate-500">支持 JPG、PNG、Excel</p>
              </div>
            </div>
          </div>

          {file && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center space-x-3">
                {isExcelFile(file) ? <FileText className="text-emerald-500" /> : <ImageIcon className="text-blue-500" />}
                <span className="max-w-xs truncate font-medium">{file.name}</span>
              </div>
              <button
                onClick={handleUpload}
                disabled={loading}
                className="flex items-center space-x-2 rounded-full bg-indigo-600 px-6 py-2 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                <span>{loading ? '识别中...' : '开始识别'}</span>
              </button>
            </div>
          )}

          {error && <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-red-600">{error}</div>}
        </div>

        {result && (
          <div className="animate-in slide-in-from-bottom-4 space-y-6 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">识别结果</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center space-x-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                >
                  {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  <span>{copied ? '已复制' : '复制 JSON'}</span>
                </button>
                {result.type === 'ocr' && (
                  <button
                    onClick={exportJSON}
                    className="flex items-center space-x-2 rounded-xl bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-200"
                  >
                    <Download size={16} />
                    <span>导出 JSON</span>
                  </button>
                )}
              </div>
            </div>

            {result.type === 'ocr' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">标题：</span>
                    <span className="font-medium">{primaryOcrRecord?.title || result.data.title}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">日期：</span>
                    <span className="font-medium">
                      {hasMultipleOcrRecords ? `共 ${ocrRecords.length} 次（最新：${primaryOcrRecord?.date || ''}）` : primaryOcrRecord?.date}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">医院：</span>
                    <span className="font-medium">{primaryOcrRecord?.hospital || result.data.hospital}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">医生：</span>
                    <span className="font-medium">{primaryOcrRecord?.doctor || result.data.doctor}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm text-slate-500">
                        {hasMultipleOcrRecords && <th className="py-3 font-medium">日期</th>}
                        <th className="py-3 font-medium">项目</th>
                        <th className="py-3 font-medium">结果</th>
                        <th className="py-3 font-medium">参考范围</th>
                        <th className="py-3 font-medium">单位</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {ocrTableRows.map((item: any, index: number) => (
                        <tr key={index} className="border-b border-slate-100 last:border-0">
                          {hasMultipleOcrRecords && <td className="py-3 text-slate-500">{item.recordDate}</td>}
                          <td className="py-3 font-medium">{item.name}</td>
                          <td className="py-3">{item.value}</td>
                          <td className="py-3 text-slate-500">{item.range}</td>
                          <td className="py-3 text-slate-500">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(primaryOcrRecord?.notes || result.data.notes) && (
                  <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    <span className="font-semibold">备注：</span>
                    {primaryOcrRecord?.notes || result.data.notes}
                  </div>
                )}
              </div>
            )}

            {result.type === 'summary' && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-indigo-50 p-6 leading-relaxed text-indigo-900">{result.data.summary}</div>
                <div className="text-right text-sm text-slate-500">剩余额度：{result.data.quota?.remaining}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

