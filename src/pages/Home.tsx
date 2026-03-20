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
  UploadCloud,
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

    if (/^\d{1,7}$/.test(text)) {
      const serial = Number(text);
      if (!Number.isNaN(serial) && serial >= 0 && serial <= 2958465) {
        const wholeDays = Math.floor(serial);
        if (wholeDays === 60) {
          return '1900-02-29';
        }

        const excelEpoch = Date.UTC(1899, 11, 31);
        const adjustedDays = wholeDays > 60 ? wholeDays - 1 : wholeDays;
        const utcTime = excelEpoch + adjustedDays * 24 * 60 * 60 * 1000;
        const d = new Date(utcTime);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }

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

    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
      const row = matrix[i] || [];
      const textCells = row.map(toText).filter(Boolean);
      if (textCells.length < 3) continue;
      if (textCells.length > bestScore) {
        bestScore = textCells.length;
        headerRowIndex = i;
      }
    }

    if (headerRowIndex < 0) return null;

    const headerRow = matrix[headerRowIndex] || [];
    const headerMap = headerRow.map((cell: any, index: number) => ({ index, text: toText(cell) }));
    const nonEmptyHeaders = headerMap.filter((header) => header.text);
    if (nonEmptyHeaders.length < 3) return null;

    let dateColIndex = aiMap?.dateColumnIndex ?? -1;
    if (!Number.isInteger(dateColIndex) || dateColIndex < 0 || dateColIndex >= headerRow.length) {
      const detected = headerMap.find((header) => /日期|时间|date|day/i.test(header.text));
      dateColIndex = detected ? detected.index : 0;
    }

    let itemColumns = (aiMap?.mappings || [])
      .filter((mapping) => Number.isInteger(mapping.columnIndex) && mapping.columnIndex >= 0 && mapping.columnIndex < headerRow.length && mapping.columnIndex !== dateColIndex)
      .map((mapping) => ({
        columnIndex: mapping.columnIndex,
        name: toText(mapping.name) || toText(headerRow[mapping.columnIndex]),
      }));

    if (!itemColumns.length) {
      itemColumns = headerMap
        .filter((header) => header.index !== dateColIndex && header.text)
        .map((header) => ({ columnIndex: header.index, name: header.text }));
    }

    const records: any[] = [];
    for (const row of matrix.slice(headerRowIndex + 1)) {
      const rowCells = row || [];
      const rawDate = toText(rowCells[dateColIndex]);
      const dateValue = normalizeDate(rawDate);
      if (!dateValue) continue;

      const items = itemColumns
        .map((column) => {
          const value = toText(rowCells[column.columnIndex]);
          if (!value) return null;
          return { name: column.name, value, unit: '', range: '' };
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
    throw new Error('Excel 文件没有可用数据');
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
      .filter((header) => header.text);

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
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 text-slate-900 sm:px-6 sm:py-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] -top-[10%] h-[600px] w-[600px] rounded-full bg-emerald-400/20 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[5%] bottom-[10%] h-[600px] w-[600px] rounded-full bg-teal-400/10 blur-[150px]"
      />
      <div className="relative z-10 mx-auto max-w-5xl space-y-10">
        <header className="mx-auto max-w-4xl text-center">
          <h1 className="text-[54px] font-black tracking-[-0.03em] text-zinc-900 sm:text-[86px] sm:leading-[0.95]">
            指标笔记 <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Inno</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] font-medium leading-8 text-zinc-500 sm:text-[22px] sm:leading-9">
            上传医疗检查图片或 Excel，快速得到精准的结构化结果，
            <br className="hidden sm:block" />
            方便后续存档、导出和深度医疗分析。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-5 py-2.5 text-sm font-medium text-zinc-700 backdrop-blur-md">
              <ImageIcon size={16} className="text-emerald-500" />
              <span>支持图片与 Excel</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-5 py-2.5 text-sm font-medium text-zinc-700 backdrop-blur-md">
              <FileText size={16} className="text-emerald-500" />
              <span>自动提取检查项目</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-5 py-2.5 text-sm font-medium text-zinc-700 backdrop-blur-md">
              <Download size={16} className="text-emerald-500" />
              <span>一键导出标准 JSON</span>
            </div>
          </div>
        </header>

        <section className="mx-auto w-full max-w-3xl space-y-5">
          <div className="group relative h-[340px] cursor-pointer overflow-hidden rounded-[36px] border border-transparent bg-white/70 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.06)] ring-1 ring-zinc-200/60 backdrop-blur-3xl transition-all duration-500 ease-out hover:border-emerald-200/50 hover:bg-white hover:shadow-[0_20px_60px_-15px_rgba(16,185,129,0.12)]">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="absolute right-6 top-6 z-40 inline-flex items-center gap-2 rounded-full bg-zinc-100/60 px-4 py-2 text-[13px] font-semibold text-zinc-600 shadow-sm backdrop-blur-md transition-all hover:bg-zinc-200/80"
            >
              <History size={16} />
              <span>历史记录</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] text-zinc-800 shadow-sm">{history.length}</span>
            </button>
            <input
              type="file"
              accept="image/*,.xlsx,.xls"
              onChange={handleFileChange}
              aria-label="上传医疗文件"
              className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-100/20 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-zinc-200/60 bg-zinc-50/80 text-zinc-400 transition-all duration-500 group-hover:transform group-hover:border-emerald-200 group-hover:bg-emerald-50 group-hover:text-emerald-500 group-hover:scale-110">
                <UploadCloud size={36} strokeWidth={2} />
              </div>
              <p className="text-[22px] font-semibold tracking-tight text-zinc-800 transition-colors duration-300 group-hover:text-emerald-600">
                点击选择文件，或将文件拖拽至此
              </p>
              <p className="mt-2 text-[14px] font-medium text-zinc-400">支持 JPG、PNG、XLS、XLSX 格式</p>
            </div>
          </div>

          {showHistory && (
            <div className="mt-5 rounded-[26px] border border-zinc-200/70 bg-zinc-50/90 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">最近识别结果</h3>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 transition hover:text-red-700"
                  >
                    <Trash2 size={14} />
                    <span>清空</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-ink-600)]">暂时没有历史记录</p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-white bg-white px-4 py-3 shadow-sm"
                    >
                      <button onClick={() => loadFromHistory(item)} className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          {item.type === 'ocr' ? (
                            <ImageIcon size={16} className="text-[var(--color-brand-600)]" />
                          ) : (
                            <FileText size={16} className="text-[var(--color-accent-500)]" />
                          )}
                          <span className="max-w-[220px] truncate text-sm font-semibold text-[var(--color-ink-900)]">{item.fileName}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-ink-600)]">{new Date(item.timestamp).toLocaleString('zh-CN')}</p>
                      </button>
                      <button
                        onClick={() => deleteHistoryItem(item.id)}
                        className="rounded-xl p-2 text-[var(--color-ink-500)] transition hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {file && (
            <div className="mt-5 flex flex-col gap-4 rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 text-[var(--color-brand-600)] shadow-sm">
                  {isExcelFile(file) ? <FileText size={20} /> : <ImageIcon size={20} />}
                </div>
                <div>
                  <div className="max-w-xs truncate font-semibold text-[var(--color-ink-900)]">{file.name}</div>
                  <div className="text-sm text-[var(--color-ink-700)]">{loading ? '正在读取并识别文件，请稍候。' : '文件已准备好，可以开始识别。'}</div>
                </div>
              </div>
              <button
                onClick={handleUpload}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-brand-600)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                <span>{loading ? '识别中...' : '开始识别'}</span>
              </button>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}
        </section>

        {result && (
          <section className="mx-auto max-w-4xl space-y-6 rounded-[32px] border border-white/70 bg-white/94 p-6 shadow-[0_22px_70px_-34px_rgba(16,33,43,0.34)] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[var(--color-ink-950)]">识别结果</h2>
                <p className="mt-1 text-sm text-[var(--color-ink-700)]">结果会按结构化字段展示，方便你检查和导出。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-800)] transition hover:border-[var(--color-brand-200)] hover:bg-[var(--color-brand-50)]"
                >
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  <span>{copied ? '已复制' : '复制 JSON'}</span>
                </button>
                {result.type === 'ocr' && (
                  <button
                    onClick={exportJSON}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent-100)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-900)] transition hover:bg-[var(--color-accent-50)]"
                  >
                    <Download size={16} />
                    <span>导出 JSON</span>
                  </button>
                )}
              </div>
            </div>

            {result.type === 'ocr' && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-600)]">标题</div>
                    <div className="mt-2 text-lg font-bold text-[var(--color-ink-950)]">{primaryOcrRecord?.title || result.data.title || '未命名报告'}</div>
                  </div>
                  <div className="rounded-[24px] border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-600)]">日期</div>
                    <div className="mt-2 text-lg font-bold text-[var(--color-ink-950)]">
                      {hasMultipleOcrRecords ? `共 ${ocrRecords.length} 次，最新：${primaryOcrRecord?.date || '-'}` : primaryOcrRecord?.date || '-'}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-600)]">医院</div>
                    <div className="mt-2 text-base font-semibold text-[var(--color-ink-900)]">{primaryOcrRecord?.hospital || result.data.hospital || '未识别'}</div>
                  </div>
                  <div className="rounded-[24px] border border-[var(--color-ink-200)] bg-[var(--color-ink-50)] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-600)]">医生</div>
                    <div className="mt-2 text-base font-semibold text-[var(--color-ink-900)]">{primaryOcrRecord?.doctor || result.data.doctor || '未识别'}</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[28px] border border-[var(--color-ink-200)] bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead className="bg-[var(--color-ink-50)] text-sm text-[var(--color-ink-700)]">
                        <tr className="border-b border-[var(--color-ink-200)]">
                          {hasMultipleOcrRecords && <th className="px-5 py-4 font-semibold">日期</th>}
                          <th className="px-5 py-4 font-semibold">项目</th>
                          <th className="px-5 py-4 font-semibold">结果</th>
                          <th className="px-5 py-4 font-semibold">参考范围</th>
                          <th className="px-5 py-4 font-semibold">单位</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-ink-100)] text-sm text-[var(--color-ink-900)]">
                        {ocrTableRows.map((item: any, index: number) => (
                          <tr key={index} className="transition hover:bg-[var(--color-brand-50)]/60">
                            {hasMultipleOcrRecords && <td className="px-5 py-4 text-[var(--color-ink-700)]">{item.recordDate || '-'}</td>}
                            <td className="px-5 py-4 font-semibold">{item.name || '-'}</td>
                            <td className="px-5 py-4">{item.value || '-'}</td>
                            <td className="px-5 py-4 text-[var(--color-ink-700)]">{item.range || '-'}</td>
                            <td className="px-5 py-4 text-[var(--color-ink-700)]">{item.unit || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {(primaryOcrRecord?.notes || result.data.notes) && (
                  <div className="rounded-[24px] border border-[var(--color-accent-100)] bg-[var(--color-accent-50)] p-5 text-sm leading-7 text-[var(--color-ink-900)]">
                    <span className="font-bold">备注：</span>
                    {primaryOcrRecord?.notes || result.data.notes}
                  </div>
                )}
              </div>
            )}

            {result.type === 'summary' && (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] p-6 leading-8 text-[var(--color-ink-900)]">
                  {result.data.summary}
                </div>
                <div className="text-right text-sm text-[var(--color-ink-700)]">剩余额度：{result.data.quota?.remaining}</div>
              </div>
            )}
          </section>
        )}
        <div className="pb-2 pt-2 text-center text-xs font-medium text-zinc-400">© {currentYear} 指标笔记 Inno. All rights reserved.</div>
      </div>
    </div>
  );
}
