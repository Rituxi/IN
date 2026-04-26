import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, FileJson, RefreshCw, Upload } from 'lucide-react';

interface BackupStatus {
  schemaVersion: number;
  timezone: string;
  exportableKeyCount: number;
  includedPatterns: string[];
  checkedAt: string;
}

interface BackupPayload {
  schemaVersion: number;
  app: string;
  exportedAt: string;
  timezone: string;
  keyCount: number;
  entries: unknown[];
}

interface ImportResult {
  success: boolean;
  deletedKeyCount: number;
  restoredKeyCount: number;
  importedAt: string;
  sourceExportedAt: string;
}

const RESTORE_CONFIRM_TEXT = 'RESTORE';
const SUPPORTED_BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_FILE_BYTES = 40 * 1024 * 1024;
const BACKUP_FILE_ACCEPT = 'application/json,.json';

function getAuthHeaders() {
  const token = localStorage.getItem('adminToken') || '';
  return { Authorization: `Bearer ${token}` };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '操作失败，请稍后重试。';
}

function parseBackupFileText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('备份文件不是合法 JSON，请重新选择后台导出的备份文件。');
  }
}

function normalizeBackupPayload(value: unknown): BackupPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.entries)) {
    return null;
  }
  const entries = payload.entries;
  const schemaVersion = Number(payload.schemaVersion);
  if (!Number.isFinite(schemaVersion)) {
    return null;
  }
  return {
    schemaVersion,
    app: typeof payload.app === 'string' ? payload.app : '',
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    timezone: typeof payload.timezone === 'string' ? payload.timezone : '',
    keyCount: entries.length,
    entries,
  };
}

function getBackupFileValidationError(file: File): string {
  const fileName = file.name.toLowerCase();
  const isJsonFile = file.type === 'application/json' || fileName.endsWith('.json');
  if (!isJsonFile) {
    return '请选择后台导出的 JSON 备份文件。';
  }
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    return '备份文件过大，请选择 40MB 以内的 JSON 文件。';
  }
  return '';
}

function getBackupPayloadValidationError(payload: BackupPayload): string {
  if (payload.schemaVersion !== SUPPORTED_BACKUP_SCHEMA_VERSION) {
    return `备份文件版本 v${payload.schemaVersion} 暂不支持，当前后台只支持 v${SUPPORTED_BACKUP_SCHEMA_VERSION}。`;
  }
  return '';
}

export default function Backup() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<BackupPayload | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [statusError, setStatusError] = useState('');

  const canImport = useMemo(
    () => Boolean(selectedBackup && confirmText.trim() === RESTORE_CONFIRM_TEXT && !importing),
    [confirmText, importing, selectedBackup],
  );

  const fetchStatus = async () => {
    setLoading(true);
    setStatusError('');
    try {
      const res = await fetch('/api/admin/backup/status', { headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error('Load backup status failed');
      }
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error(error);
      setStatusError('备份状态暂时不可用，请确认 Redis 配置和服务连接。');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/backup/export', { headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error('Export backup failed');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || `inno-admin-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      await fetchStatus();
    } catch (error) {
      console.error(error);
      alert('导出失败，请稍后重试。');
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setResult(null);
    setSelectedBackup(null);
    setSelectedFileName('');
    setConfirmText('');

    if (!file) {
      return;
    }

    try {
      const fileError = getBackupFileValidationError(file);
      if (fileError) {
        alert(fileError);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      const text = await file.text();
      const payload = normalizeBackupPayload(parseBackupFileText(text));
      if (!payload) {
        throw new Error('备份文件格式不正确，请选择后台导出的 JSON 文件。');
      }
      const payloadError = getBackupPayloadValidationError(payload);
      if (payloadError) {
        alert(payloadError);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      setSelectedFileName(file.name);
      setSelectedBackup(payload);
    } catch (error) {
      console.error(error);
      alert(getErrorMessage(error));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImport = async () => {
    if (!selectedBackup || !canImport) {
      return;
    }

    if (!window.confirm('导入会覆盖当前后台受管数据，确定继续吗？')) {
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/admin/backup/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          mode: 'replace',
          confirm: RESTORE_CONFIRM_TEXT,
          backup: selectedBackup,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Import backup failed');
      }
      setResult(data);
      setConfirmText('');
      await fetchStatus();
    } catch (error) {
      console.error(error);
      alert(getErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-sm text-zinc-500">正在加载备份状态...</div>;
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="px-2 py-1 sm:px-0 sm:py-0">
        <div className="flex flex-wrap items-end justify-between gap-4 px-2">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-400">
              <Database size={13} />
              Data Backup
            </div>
            <h2 className="mb-2 text-[28px] font-semibold tracking-tight text-zinc-900 sm:text-[30px]">数据备份</h2>
            <p className="max-w-2xl text-[13px] font-medium leading-6 text-zinc-500">
              导出后台受管数据到本地 JSON 文件，导入时会按备份快照覆盖当前后台数据。
            </p>
          </div>

          <button
            onClick={fetchStatus}
            className="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2.5 text-[14px] font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200/50 transition-all hover:bg-white"
          >
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </div>

      {statusError ? (
        <div className="flex items-start gap-3 rounded-[24px] bg-amber-50/80 p-5 text-[14px] leading-6 text-amber-800 ring-1 ring-amber-100">
          <AlertTriangle size={19} className="mt-0.5 shrink-0" />
          <span>{statusError}</span>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] bg-zinc-100 text-zinc-600">
            <FileJson size={21} />
          </div>
          <div className="text-[13px] font-medium text-zinc-500">可导出 Key 数</div>
          <div className="mt-2 text-[34px] font-bold leading-none text-zinc-900">{status?.exportableKeyCount ?? 0}</div>
        </div>

        <div className="rounded-[24px] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] bg-zinc-100 text-zinc-600">
            <Database size={21} />
          </div>
          <div className="text-[13px] font-medium text-zinc-500">备份版本</div>
          <div className="mt-2 text-[34px] font-bold leading-none text-zinc-900">v{status?.schemaVersion ?? 1}</div>
        </div>

        <div className="rounded-[24px] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] bg-zinc-100 text-zinc-600">
            <RefreshCw size={21} />
          </div>
          <div className="text-[13px] font-medium text-zinc-500">检查时间</div>
          <div className="mt-2 text-[18px] font-semibold text-zinc-900">{formatDateTime(status?.checkedAt || '')}</div>
          <div className="mt-2 text-[12px] text-zinc-400">{status?.timezone || '--'}</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] bg-white/55 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[20px] font-semibold text-zinc-900">导出到本地</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                文件名会自动带上导出时间戳，适合紧急备份和迁移留档。
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-emerald-50 text-emerald-600">
              <Download size={21} />
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3.5 text-[15px] font-semibold text-white shadow-md transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={16} />
            {exporting ? '正在导出...' : '下载备份文件'}
          </button>
        </div>

        <div className="rounded-[28px] bg-white/55 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[20px] font-semibold text-zinc-900">从备份导入</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                当前版本采用完整恢复模式，只覆盖备份功能管理的 Redis 数据范围。
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-amber-50 text-amber-700">
              <Upload size={21} />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={BACKUP_FILE_ACCEPT}
            onChange={handleFileChange}
            className="block w-full rounded-[18px] bg-white/70 px-4 py-3 text-[14px] text-zinc-700 ring-1 ring-zinc-200/70 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-white"
          />

          {selectedBackup ? (
            <div className="mt-4 rounded-[20px] bg-zinc-100/60 p-4 text-[13px] text-zinc-600">
              <div className="font-semibold text-zinc-900">{selectedFileName}</div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <span>导出时间：{formatDateTime(selectedBackup.exportedAt)}</span>
                <span>Key 数：{selectedBackup.keyCount}</span>
                <span>版本：v{selectedBackup.schemaVersion}</span>
                <span>时区：{selectedBackup.timezone || '--'}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-start gap-3 rounded-[20px] bg-amber-50/70 p-4 text-[13px] leading-6 text-amber-800 ring-1 ring-amber-100">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>导入会先删除当前受管数据，再写入备份快照。执行前建议先下载一份当前备份。</span>
          </div>

          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={`输入 ${RESTORE_CONFIRM_TEXT} 后启用导入`}
            className="mt-4 w-full rounded-[18px] bg-white/80 px-4 py-3 text-[14px] text-zinc-900 outline-none ring-1 ring-zinc-200/70 transition focus:ring-2 focus:ring-zinc-300"
          />

          <button
            onClick={handleImport}
            disabled={!canImport}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3.5 text-[15px] font-semibold text-white shadow-md transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Upload size={16} />
            {importing ? '正在导入...' : '覆盖并导入'}
          </button>
        </div>
      </section>

      {result ? (
        <div className="flex items-start gap-3 rounded-[24px] bg-emerald-50/80 p-5 text-[14px] leading-6 text-emerald-800 ring-1 ring-emerald-100">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">导入完成</div>
            <div>
              已删除 {result.deletedKeyCount} 个当前 Key，恢复 {result.restoredKeyCount} 个备份 Key；备份来源时间：
              {formatDateTime(result.sourceExportedAt)}。
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
