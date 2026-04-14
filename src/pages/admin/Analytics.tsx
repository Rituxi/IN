import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  PieChart,
  TrendingUp,
} from 'lucide-react';

type AnalyticsRange = 'month' | 'year' | 'custom';
type RemarkScope = 'month' | 'day';

interface AnalyticsSummary {
  totalCalls: number;
  totalOcr: number;
  totalSummary: number;
  peakValue: number;
  peakUnit: 'day' | 'month';
}

interface AnalyticsChartPoint {
  date: string;
  displayLabel: string;
  ocr: number;
  summary: number;
  total: number;
}

interface AnalyticsDayArchive {
  date: string;
  ocr: number;
  summary: number;
  total: number;
  remark: string;
}

interface AnalyticsMonthArchive {
  month: string;
  totalOcr: number;
  totalSummary: number;
  total: number;
  remark: string;
  days: AnalyticsDayArchive[];
}

interface AnalyticsResponse {
  availableMonths: string[];
  selectedMonth: string;
  summary: AnalyticsSummary;
  chart: AnalyticsChartPoint[];
  archives: AnalyticsMonthArchive[];
}

interface RemarkResponse {
  success: boolean;
  scope: RemarkScope;
  key: string;
  remark: string;
  updatedAt: string;
}

const emptySummary: AnalyticsSummary = {
  totalCalls: 0,
  totalOcr: 0,
  totalSummary: 0,
  peakValue: 0,
  peakUnit: 'day',
};

const emptyData: AnalyticsResponse = {
  availableMonths: [],
  selectedMonth: '',
  summary: emptySummary,
  chart: [],
  archives: [],
};

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultCustomRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    start: formatInputDate(start),
    end: formatInputDate(end),
  };
}

function getRemarkDraftKey(scope: RemarkScope, key: string) {
  return `${scope}:${key}`;
}

function buildRemarkDrafts(archives: AnalyticsMonthArchive[]): Record<string, string> {
  const nextDrafts: Record<string, string> = {};

  archives.forEach((month) => {
    nextDrafts[getRemarkDraftKey('month', month.month)] = month.remark || '';
    month.days.forEach((day) => {
      nextDrafts[getRemarkDraftKey('day', day.date)] = day.remark || '';
    });
  });

  return nextDrafts;
}

function updateArchiveRemark(
  archives: AnalyticsMonthArchive[],
  scope: RemarkScope,
  key: string,
  remark: string,
): AnalyticsMonthArchive[] {
  if (scope === 'month') {
    return archives.map((month) => (month.month === key ? { ...month, remark } : month));
  }

  return archives.map((month) => ({
    ...month,
    days: month.days.map((day) => (day.date === key ? { ...day, remark } : day)),
  }));
}

function getPersistedRemark(archives: AnalyticsMonthArchive[], scope: RemarkScope, key: string): string {
  if (scope === 'month') {
    return archives.find((month) => month.month === key)?.remark || '';
  }

  for (const month of archives) {
    const day = month.days.find((entry) => entry.date === key);
    if (day) {
      return day.remark || '';
    }
  }

  return '';
}

function getAuthHeaders() {
  const token = localStorage.getItem('adminToken') || '';
  return {
    Authorization: `Bearer ${token}`,
  };
}

function getMonthDisplay(monthKey: string) {
  return `${monthKey.replace('-', '年')}月`;
}

function getAvailableYears(months: string[]) {
  return Array.from(new Set(months.map((month) => month.slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
}

function SmoothLineChart({ data }: { data: AnalyticsChartPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex h-[260px] w-full items-center justify-center text-[14px] text-zinc-400">
        暂无该区间数据
      </div>
    );
  }

  const maxVal = Math.max(...data.map((item) => Math.max(item.ocr, item.summary)), 1) * 1.2;
  const chartWidth = 1000;
  const chartHeight = 240;

  const getPoints = (key: 'ocr' | 'summary') =>
    data
      .map((item, index) => {
        const x = (index / Math.max(data.length - 1, 1)) * chartWidth;
        const y = chartHeight - (item[key] / maxVal) * chartHeight;
        return `${x},${y}`;
      })
      .join(' L ');

  const getAreaPath = (key: 'ocr' | 'summary') => `M 0,${chartHeight} L ${getPoints(key)} L ${chartWidth},${chartHeight} Z`;
  const ocrArea = getAreaPath('ocr');
  const summaryArea = getAreaPath('summary');
  const ocrPath = `M ${getPoints('ocr')}`;
  const summaryPath = `M ${getPoints('summary')}`;

  return (
    <div className="relative h-[260px] w-full" onMouseLeave={() => setHoverIdx(null)}>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-[20px]">
        <div className="h-0 w-full border-t border-dashed border-zinc-200/80" />
        <div className="h-0 w-full border-t border-dashed border-zinc-200/80" />
        <div className="h-0 w-full border-t border-dashed border-zinc-200/80" />
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="absolute inset-0 h-[240px] w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="analytics-grad-ocr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.3)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
          </linearGradient>
          <linearGradient id="analytics-grad-summary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
          </linearGradient>
        </defs>

        <path d={summaryArea} fill="url(#analytics-grad-summary)" />
        <path d={ocrArea} fill="url(#analytics-grad-ocr)" />
        <path d={summaryPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={ocrPath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {data.map((item, index) => {
          const cx = (index / Math.max(data.length - 1, 1)) * chartWidth;
          const cyOcr = chartHeight - (item.ocr / maxVal) * chartHeight;
          const cySummary = chartHeight - (item.summary / maxVal) * chartHeight;
          const isHover = hoverIdx === index;

          return (
            <g key={item.date}>
              <circle cx={cx} cy={cyOcr} r="4" fill="#fff" stroke="#10b981" strokeWidth="2" className={isHover ? 'opacity-100' : 'opacity-0'} />
              <circle cx={cx} cy={cySummary} r="4" fill="#fff" stroke="#3b82f6" strokeWidth="2" className={isHover ? 'opacity-100' : 'opacity-0'} />
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 z-20 flex h-[240px]">
        {data.map((item, index) => (
          <div key={item.date} className="group relative h-full flex-1 cursor-crosshair" onMouseEnter={() => setHoverIdx(index)}>
            <span className="absolute top-[100%] left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap text-[11px] font-mono text-zinc-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {item.displayLabel || item.date}
            </span>

            {hoverIdx === index ? (
              <>
                <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-zinc-900/10" />
                <div className="pointer-events-none absolute bottom-1/2 left-1/2 z-30 mb-4 flex -translate-x-1/2 flex-col items-center">
                  <div className="flex min-w-[136px] flex-col gap-2 rounded-[16px] border border-white/10 bg-zinc-900/95 px-4 py-3 text-[12px] font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-md">
                    <div className="mb-1 text-center font-mono text-[11px] text-zinc-400">{item.date} 数据</div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>OCR</span>
                      </div>
                      <span className="text-[14px] font-bold text-emerald-400">{item.ocr}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <span>小结</span>
                      </div>
                      <span className="text-[14px] font-bold text-blue-400">{item.summary}</span>
                    </div>
                    <div className="my-0.5 h-px bg-zinc-700/50" />
                    <div className="flex justify-between gap-4 text-[13px]">
                      <span className="text-zinc-300">总计</span>
                      <span className="font-bold text-white">{item.total}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<AnalyticsRange>('month');
  const [currentMonth, setCurrentMonth] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [customRange, setCustomRange] = useState(createDefaultCustomRange);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [data, setData] = useState<AnalyticsResponse>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRemarkKeys, setSavingRemarkKeys] = useState<string[]>([]);

  const loadAnalytics = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = new URLSearchParams({ range });
      if (range === 'month' && currentMonth) {
        params.set('month', currentMonth);
      }
      if (range === 'year' && currentYear) {
        params.set('year', currentYear);
      }
      if (range === 'custom') {
        params.set('start', customRange.start);
        params.set('end', customRange.end);
      }

      const res = await fetch(`/api/admin/analytics?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error('Load analytics failed');
      }

      const payload = (await res.json()) as AnalyticsResponse;
      setData(payload);
      setRemarkDrafts(buildRemarkDrafts(payload.archives));

      if (range === 'month' && payload.selectedMonth && payload.selectedMonth !== currentMonth) {
        setCurrentMonth(payload.selectedMonth);
      }

      if (range === 'year') {
        const payloadYears = getAvailableYears(payload.availableMonths);
        const nextYear = payloadYears.includes(currentYear)
          ? currentYear
          : payloadYears[0] || String(new Date().getFullYear());
        if (nextYear !== currentYear) {
          setCurrentYear(nextYear);
        }
      }
    } catch (error) {
      console.error(error);
      alert('数据分析加载失败，请稍后重试。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics(true);
  }, [range, currentMonth, currentYear, customRange.start, customRange.end]);

  const availableMonths = data.availableMonths;
  const availableYears = useMemo(() => getAvailableYears(availableMonths), [availableMonths]);
  const activeYear = currentYear || availableYears[0] || '';
  const currentMonthIndex = useMemo(
    () => availableMonths.findIndex((item) => item === (currentMonth || data.selectedMonth)),
    [availableMonths, currentMonth, data.selectedMonth],
  );
  const currentYearIndex = useMemo(
    () => availableYears.findIndex((item) => item === activeYear),
    [availableYears, activeYear],
  );

  const toggleMonth = (month: string) => {
    setExpandedMonths((current) =>
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month],
    );
  };

  const handleRemarkChange = (scope: RemarkScope, key: string, value: string) => {
    const draftKey = getRemarkDraftKey(scope, key);
    setRemarkDrafts((current) => ({
      ...current,
      [draftKey]: value,
    }));
  };

  const handleRemarkBlur = async (scope: RemarkScope, key: string) => {
    const draftKey = getRemarkDraftKey(scope, key);
    const currentRemark = (remarkDrafts[draftKey] ?? '').trim();
    const persistedRemark = getPersistedRemark(data.archives, scope, key);

    if (currentRemark === persistedRemark) {
      setRemarkDrafts((current) => ({
        ...current,
        [draftKey]: persistedRemark,
      }));
      return;
    }

    setSavingRemarkKeys((current) => [...current, draftKey]);

    try {
      const res = await fetch('/api/admin/analytics/remark', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          scope,
          key,
          remark: currentRemark,
        }),
      });

      if (!res.ok) {
        throw new Error('Save remark failed');
      }

      const payload = (await res.json()) as RemarkResponse;
      setData((current) => ({
        ...current,
        archives: updateArchiveRemark(current.archives, payload.scope, payload.key, payload.remark),
      }));
      setRemarkDrafts((current) => ({
        ...current,
        [draftKey]: payload.remark,
      }));
    } catch (error) {
      console.error(error);
      setRemarkDrafts((current) => ({
        ...current,
        [draftKey]: persistedRemark,
      }));
      alert('备注保存失败，请稍后重试。');
    } finally {
      setSavingRemarkKeys((current) => current.filter((item) => item !== draftKey));
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-sm text-zinc-500">正在加载数据分析...</div>;
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="px-2 py-1 sm:px-0 sm:py-0">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 px-2">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-400">
              <PieChart size={13} />
              Analytics Overview
            </div>
            <h2 className="mb-2 text-[28px] font-semibold tracking-tight text-zinc-900 sm:text-[30px]">数据分析</h2>
            <p className="text-[13px] font-medium text-zinc-500">
              查看调用趋势、区间汇总和按月归档的详细明细。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {range === 'custom' ? (
              <div className="flex h-[36px] items-center gap-2 rounded-full bg-white/40 px-2 py-1 shadow-sm ring-1 ring-zinc-200/50 backdrop-blur-xl">
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(event) => setCustomRange((current) => ({ ...current, start: event.target.value }))}
                  className="w-[120px] cursor-pointer appearance-none bg-transparent px-3 py-1 text-[13px] font-semibold text-zinc-700 outline-none transition-colors hover:text-emerald-600"
                />
                <span className="font-light text-zinc-300">|</span>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(event) => setCustomRange((current) => ({ ...current, end: event.target.value }))}
                  className="w-[120px] cursor-pointer appearance-none bg-transparent px-3 py-1 text-[13px] font-semibold text-zinc-700 outline-none transition-colors hover:text-emerald-600"
                />
              </div>
            ) : null}

            {range === 'month' && availableMonths.length > 0 ? (
              <div className="flex h-[36px] items-center overflow-hidden rounded-full bg-white/40 shadow-sm ring-1 ring-zinc-200/50 backdrop-blur-xl">
                <button
                  disabled={currentMonthIndex >= availableMonths.length - 1}
                  onClick={() => {
                    const nextMonth = availableMonths[currentMonthIndex + 1];
                    if (nextMonth) {
                      setCurrentMonth(nextMonth);
                    }
                  }}
                  className="flex h-full items-center px-3 text-zinc-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="w-24 text-center text-[13px] font-semibold text-zinc-800">
                  {currentMonth || data.selectedMonth}
                </span>
                <button
                  disabled={currentMonthIndex <= 0}
                  onClick={() => {
                    const nextMonth = availableMonths[currentMonthIndex - 1];
                    if (nextMonth) {
                      setCurrentMonth(nextMonth);
                    }
                  }}
                  className="flex h-full items-center px-3 text-zinc-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : null}

            {range === 'year' && availableYears.length > 0 ? (
              <div className="flex h-[36px] items-center overflow-hidden rounded-full bg-white/40 shadow-sm ring-1 ring-zinc-200/50 backdrop-blur-xl">
                <button
                  disabled={currentYearIndex >= availableYears.length - 1}
                  onClick={() => {
                    const nextYear = availableYears[currentYearIndex + 1];
                    if (nextYear) {
                      setCurrentYear(nextYear);
                    }
                  }}
                  className="flex h-full items-center px-3 text-zinc-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="w-24 text-center text-[13px] font-semibold text-zinc-800">
                  {activeYear ? `${activeYear}年` : ''}
                </span>
                <button
                  disabled={currentYearIndex <= 0}
                  onClick={() => {
                    const nextYear = availableYears[currentYearIndex - 1];
                    if (nextYear) {
                      setCurrentYear(nextYear);
                    }
                  }}
                  className="flex h-full items-center px-3 text-zinc-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : null}

            <div className="flex h-[36px] items-center rounded-full bg-white/40 p-1 shadow-sm ring-1 ring-zinc-200/50 backdrop-blur-xl">
              <button
                onClick={() => setRange('month')}
                className={`h-full rounded-full px-4 py-1 text-[13px] font-semibold transition-all duration-200 ${
                  range === 'month'
                    ? 'bg-white text-zinc-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)]'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                单月
              </button>
              <button
                onClick={() => setRange('year')}
                className={`h-full rounded-full px-4 py-1 text-[13px] font-semibold transition-all duration-200 ${
                  range === 'year'
                    ? 'bg-white text-zinc-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)]'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                全年
              </button>
              <button
                onClick={() => setRange('custom')}
                className={`flex h-full items-center gap-1.5 rounded-full px-4 py-1 text-[13px] font-semibold transition-all duration-200 ${
                  range === 'custom'
                    ? 'bg-white text-zinc-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)]'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                自定义
                <CalendarDays size={14} className={range === 'custom' ? 'text-zinc-800' : 'opacity-70'} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] bg-white/40 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-0.5">
            <div className="mb-3 flex items-center justify-between text-[13px] font-medium text-zinc-500">
              当前区间总调用
              <TrendingUp size={16} className="text-zinc-400" />
            </div>
            <div className="text-[36px] leading-none font-bold tracking-tight text-zinc-900">{data.summary.totalCalls}</div>
          </div>

          <div className="rounded-[24px] bg-white/40 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-0.5">
            <div className="mb-3 text-[13px] font-medium text-zinc-500">智能 OCR 消耗</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] leading-none font-bold tracking-tight text-zinc-900">{data.summary.totalOcr}</span>
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">OCR</span>
            </div>
          </div>

          <div className="rounded-[24px] bg-white/40 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-0.5">
            <div className="mb-3 text-[13px] font-medium text-zinc-500">智能小结 消耗</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] leading-none font-bold tracking-tight text-zinc-900">{data.summary.totalSummary}</span>
              <span className="text-[12px] font-bold tracking-wide text-zinc-400">小结</span>
            </div>
          </div>

          <div className="rounded-[24px] bg-white/40 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-0.5">
            <div className="mb-3 text-[13px] font-medium text-zinc-500">{range === 'year' ? '区间峰值' : '日均峰值'}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] leading-none font-bold tracking-tight text-zinc-900">{data.summary.peakValue}</span>
              <span className="text-[12px] font-medium text-zinc-400">次/{data.summary.peakUnit === 'month' ? '月' : '日'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[32px] bg-white/50 p-8 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.03)] ring-1 ring-white/80 backdrop-blur-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h3 className="text-[18px] font-semibold text-zinc-800">
            趋势分析
            <span className="ml-2 text-[13px] font-medium text-zinc-400">动态重绘引擎</span>
          </h3>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />
              <span className="text-[12px] font-medium text-zinc-600">OCR 计数</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500 shadow-sm" />
              <span className="text-[12px] font-medium text-zinc-600">小结 计数</span>
            </div>
          </div>
        </div>
        <SmoothLineChart data={data.chart} />
      </div>

      <div className="mt-2">
        <div className="mb-4 flex items-end justify-between px-2">
          <div>
            <h3 className="text-[18px] font-semibold text-zinc-800">数据存档明细</h3>
            <p className="mt-0.5 text-[13px] text-zinc-400">默认按月归档折叠。将鼠标移至存档行，点击编辑图标即可无感添加备注。</p>
          </div>
          <button
            disabled
            title="导出功能暂未开放"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-400 shadow-sm ring-1 ring-zinc-200/80"
          >
            <Download size={14} />
            导出报表
          </button>
        </div>

        <div className="mb-2 hidden grid-cols-[160px_100px_100px_100px_minmax(200px,1fr)] items-center gap-x-6 px-8 py-3 text-[13px] font-medium text-zinc-400 xl:grid">
          <div>时间归档 (Date)</div>
          <div>智能 OCR</div>
          <div>智能小结</div>
          <div>总计消耗</div>
          <div className="border-l border-zinc-200/60 pl-4">存档备注</div>
        </div>

        <div className="space-y-4">
          {data.archives.length === 0 ? (
            <div className="py-12 text-center text-[14px] text-zinc-400">当前区间无任何存档记录</div>
          ) : null}

          {data.archives.map((monthArchive) => {
            const isExpanded = expandedMonths.includes(monthArchive.month);
            const monthDraftKey = getRemarkDraftKey('month', monthArchive.month);
            const monthSaving = savingRemarkKeys.includes(monthDraftKey);

            return (
              <div
                key={monthArchive.month}
                className="overflow-hidden rounded-[20px] bg-white/50 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.02)] ring-1 ring-white/80 transition-all duration-300 backdrop-blur-2xl"
              >
                <div
                  onClick={() => toggleMonth(monthArchive.month)}
                  className="grid cursor-pointer gap-y-3 px-6 py-4 transition-colors hover:bg-white/70 xl:grid-cols-[160px_100px_100px_100px_minmax(200px,1fr)] xl:items-center xl:gap-x-6"
                >
                  <div className="flex items-center gap-3">
                    <div className={`text-zinc-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={18} />
                    </div>
                    <span className="text-[15px] font-bold text-zinc-900">{getMonthDisplay(monthArchive.month)}</span>
                  </div>

                  <div className="text-[15px] font-semibold text-zinc-800">
                    {monthArchive.totalOcr}
                    <span className="ml-1 text-[11px] text-zinc-400">次</span>
                  </div>
                  <div className="text-[15px] font-semibold text-zinc-800">
                    {monthArchive.totalSummary}
                    <span className="ml-1 text-[11px] text-zinc-400">次</span>
                  </div>
                  <div className="text-[16px] font-bold text-zinc-900">{monthArchive.total}</div>

                  <div className="group/remark flex h-full items-center border-l border-zinc-200/60 pl-4" onClick={(event) => event.stopPropagation()}>
                    <div className="relative flex w-full items-center">
                      <input
                        type="text"
                        value={remarkDrafts[monthDraftKey] ?? monthArchive.remark}
                        onChange={(event) => handleRemarkChange('month', monthArchive.month, event.target.value)}
                        onBlur={() => handleRemarkBlur('month', monthArchive.month)}
                        className="relative z-10 w-full cursor-text rounded-[6px] border-none bg-transparent px-3 py-1.5 text-[13px] text-zinc-600 outline-none transition-all hover:bg-black/5 focus:bg-white focus:text-zinc-900 focus:shadow-sm focus:ring-1 focus:ring-zinc-200"
                      />
                      {!remarkDrafts[monthDraftKey] && !monthArchive.remark ? (
                        <div className="pointer-events-none absolute left-3 flex items-center gap-1.5 text-zinc-400 opacity-0 transition-opacity group-hover/remark:opacity-100">
                          <Edit size={13} />
                        </div>
                      ) : null}
                      {monthSaving ? <span className="absolute right-2 text-[11px] text-zinc-400">保存中...</span> : null}
                    </div>
                  </div>
                </div>

                <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[8000px] border-t border-zinc-200/50 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-zinc-50/50 py-2">
                    {monthArchive.days.map((dayArchive) => {
                      const dayDraftKey = getRemarkDraftKey('day', dayArchive.date);
                      const daySaving = savingRemarkKeys.includes(dayDraftKey);

                      return (
                        <div
                          key={dayArchive.date}
                          className="grid gap-y-3 px-6 py-2.5 transition-colors hover:bg-white/60 xl:grid-cols-[160px_100px_100px_100px_minmax(200px,1fr)] xl:items-center xl:gap-x-6"
                        >
                          <div className="flex items-center gap-3 pl-8">
                            <div className="mr-1 h-4 w-px bg-zinc-300" />
                            <span className="font-mono text-[13px] font-medium text-zinc-600">{dayArchive.date}</span>
                          </div>
                          <div className="text-[14px] font-medium text-zinc-700">{dayArchive.ocr}</div>
                          <div className="text-[14px] font-medium text-zinc-700">{dayArchive.summary}</div>
                          <div className="text-[14px] font-semibold text-zinc-800">{dayArchive.total}</div>

                          <div className="group/dayremark flex h-full items-center border-l border-zinc-200/40 pl-4">
                            <div className="relative flex w-full items-center">
                              <input
                                type="text"
                                value={remarkDrafts[dayDraftKey] ?? dayArchive.remark}
                                onChange={(event) => handleRemarkChange('day', dayArchive.date, event.target.value)}
                                onBlur={() => handleRemarkBlur('day', dayArchive.date)}
                                className="relative z-10 w-full cursor-text rounded-[6px] border-none bg-transparent px-3 py-1 text-[13px] text-zinc-500 outline-none transition-all hover:bg-black/5 focus:bg-white focus:text-zinc-800 focus:shadow-sm focus:ring-1 focus:ring-zinc-200"
                              />
                              {!remarkDrafts[dayDraftKey] && !dayArchive.remark ? (
                                <div className="pointer-events-none absolute left-3 flex items-center gap-1.5 text-zinc-400 opacity-0 transition-opacity group-hover/dayremark:opacity-100">
                                  <Edit size={13} />
                                </div>
                              ) : null}
                              {daySaving ? <span className="absolute right-2 text-[11px] text-zinc-400">保存中...</span> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {refreshing ? <div className="mt-3 px-2 text-[12px] text-zinc-400">正在刷新数据...</div> : null}
      </div>
    </div>
  );
}
