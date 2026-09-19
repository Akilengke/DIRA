import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Activity, 
  Filter, 
  ShieldAlert, 
  Info,
  CheckCircle2,
  ChevronRight,
  FileText
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { DonkeyCase, CaseCategory } from '../types';
import { CATEGORY_INFO } from '../data/mockData';

interface WeeklyIncidentChartProps {
  cases: DonkeyCase[];
  onSelectCategory?: (category: CaseCategory) => void;
  onOpenGeneralReportModal?: () => void;
}

type TimeframeOption = '6w' | '12w' | 'all';
type ViewMode = 'total' | 'by_category';

interface WeekBucket {
  weekKey: string;
  label: string;
  rangeLabel: string;
  startDate: Date;
  endDate: Date;
  total: number;
  theft: number;
  slaughter: number;
  trafficking: number;
  abuse: number;
  other: number;
  donkeysAffected: number;
  resolved: number;
}

export const WeeklyIncidentChart: React.FC<WeeklyIncidentChartProps> = ({
  cases,
  onSelectCategory,
  onOpenGeneralReportModal,
}) => {
  const [timeframe, setTimeframe] = useState<TimeframeOption>('6w');
  const [viewMode, setViewMode] = useState<ViewMode>('total');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  // Compute weekly buckets
  const weeklyData = useMemo(() => {
    const numWeeks = timeframe === '6w' ? 6 : timeframe === '12w' ? 12 : 16;
    const now = new Date();

    // Align to current week's Sunday end
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ...
    const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    // Most recent Monday at 00:00:00
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - daysSinceMonday);
    currentMonday.setHours(0, 0, 0, 0);

    const buckets: WeekBucket[] = [];

    for (let i = numWeeks - 1; i >= 0; i--) {
      const weekStart = new Date(currentMonday);
      weekStart.setDate(currentMonday.getDate() - i * 7);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
      const startDay = weekStart.getDate();
      const endDay = weekEnd.getDate();

      const label = `${startMonth} ${startDay}`;
      const rangeLabel = startMonth === endMonth 
        ? `${startMonth} ${startDay} - ${endDay}` 
        : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;

      buckets.push({
        weekKey: weekStart.toISOString().slice(0, 10),
        label,
        rangeLabel,
        startDate: weekStart,
        endDate: weekEnd,
        total: 0,
        theft: 0,
        slaughter: 0,
        trafficking: 0,
        abuse: 0,
        other: 0,
        donkeysAffected: 0,
        resolved: 0,
      });
    }

    // Populate with actual incident cases
    cases.forEach((c) => {
      let caseTime = 0;
      if (c.reportedAt) {
        const t = new Date(c.reportedAt).getTime();
        if (!isNaN(t)) caseTime = t;
      }
      if (!caseTime && c.incidentDateTime) {
        const t = new Date(c.incidentDateTime).getTime();
        if (!isNaN(t)) caseTime = t;
      }
      if (!caseTime) return;

      const caseDate = new Date(caseTime);

      // Find matching week bucket
      const bucket = buckets.find(
        (b) => caseDate >= b.startDate && caseDate <= b.endDate
      );

      if (bucket) {
        bucket.total += 1;
        bucket.donkeysAffected += (c.donkeysCount || 1);
        if (c.status === 'resolved') {
          bucket.resolved += 1;
        }

        switch (c.category) {
          case 'donkey_theft':
            bucket.theft += 1;
            break;
          case 'bush_slaughter':
            bucket.slaughter += 1;
            break;
          case 'trafficking':
            bucket.trafficking += 1;
            break;
          case 'general_abuse':
            bucket.abuse += 1;
            break;
          default:
            bucket.other += 1;
            break;
        }
      }
    });

    return buckets;
  }, [cases, timeframe]);

  // Derived statistics
  const totalIncidentsInPeriod = useMemo(() => {
    return weeklyData.reduce((acc, b) => acc + b.total, 0);
  }, [weeklyData]);

  const currentWeekCount = weeklyData[weeklyData.length - 1]?.total || 0;
  const prevWeekCount = weeklyData[weeklyData.length - 2]?.total || 0;
  const weeklyAverage = weeklyData.length > 0 
    ? (totalIncidentsInPeriod / weeklyData.length).toFixed(1) 
    : '0.0';

  const peakWeek = useMemo(() => {
    let max = 0;
    let peakBucket: WeekBucket | null = null;
    weeklyData.forEach((b) => {
      if (b.total > max) {
        max = b.total;
        peakBucket = b;
      }
    });
    return peakBucket;
  }, [weeklyData]);

  const weekOverWeekDelta = currentWeekCount - prevWeekCount;

  // Custom high-contrast tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data: WeekBucket = payload[0].payload;
      return (
        <div className="bg-zinc-900 text-white p-3 rounded-2xl shadow-xl border border-zinc-800 text-xs min-w-[200px] z-50">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
            <span className="font-extrabold text-white flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              {data.rangeLabel}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-[10px]">
              Week Total: {data.total}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Total Incidents:</span>
              <span className="font-bold text-white">{data.total}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Donkeys Affected:</span>
              <span className="font-bold text-amber-400">{data.donkeysAffected}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Cases Resolved:</span>
              <span className="font-bold text-emerald-400">{data.resolved}</span>
            </div>

            {data.total > 0 && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                  Category Breakdown
                </div>
                {data.theft > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Donkey Theft
                    </span>
                    <span className="font-bold text-zinc-200">{data.theft}</span>
                  </div>
                )}
                {data.slaughter > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-rose-900" />
                      Bush Slaughter
                    </span>
                    <span className="font-bold text-zinc-200">{data.slaughter}</span>
                  </div>
                )}
                {data.trafficking > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      Trafficking
                    </span>
                    <span className="font-bold text-zinc-200">{data.trafficking}</span>
                  </div>
                )}
                {data.abuse > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      Abuse / Neglect
                    </span>
                    <span className="font-bold text-zinc-200">{data.abuse}</span>
                  </div>
                )}
                {data.other > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      Other
                    </span>
                    <span className="font-bold text-zinc-200">{data.other}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="weekly-incident-chart-section" className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-2xs">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-red-100/80 text-red-700">
              <Activity className="w-4 h-4" />
            </span>
            <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 font-display">
              Weekly Incident Frequency
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-bold text-[10px]">
              Kitui County
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Weekly trend of reported donkey theft, illegal slaughter, trafficking, and welfare abuse
          </p>
        </div>

        {/* Action Controls: Timeframe & View Mode */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-[11px] font-bold">
            <button
              id="btn-viewmode-total"
              onClick={() => setViewMode('total')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                viewMode === 'total'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Total Volume
            </button>
            <button
              id="btn-viewmode-category"
              onClick={() => setViewMode('by_category')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                viewMode === 'by_category'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              By Category
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-[11px] font-bold">
            <button
              id="btn-timeframe-6w"
              onClick={() => setTimeframe('6w')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                timeframe === '6w'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              6 Weeks
            </button>
            <button
              id="btn-timeframe-12w"
              onClick={() => setTimeframe('12w')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                timeframe === '12w'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              12 Weeks
            </button>
          </div>

          {onOpenGeneralReportModal && (
            <button
              id="btn-chart-export-pdf"
              onClick={onOpenGeneralReportModal}
              className="px-3 py-1.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Export Weekly, Monthly, Quarterly or Annual Case Audit Report (PDF)"
            >
              <FileText className="w-3.5 h-3.5 text-white" />
              <span>Export PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 sm:px-5 bg-zinc-50/70 border-b border-zinc-100">
        <div id="kpi-this-week" className="p-2.5 rounded-2xl bg-white border border-zinc-200/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
            This Week
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-zinc-950 font-mono">
              {currentWeekCount}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium">reports</span>
            {weekOverWeekDelta !== 0 && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ml-auto ${
                weekOverWeekDelta > 0 ? 'text-red-600' : 'text-emerald-600'
              }`}>
                {weekOverWeekDelta > 0 ? (
                  <>
                    <TrendingUp className="w-3 h-3" />
                    +{weekOverWeekDelta}
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3" />
                    {weekOverWeekDelta}
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <div id="kpi-weekly-avg" className="p-2.5 rounded-2xl bg-white border border-zinc-200/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
            Weekly Average
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-zinc-950 font-mono">
              {weeklyAverage}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium">cases/wk</span>
          </div>
        </div>

        <div id="kpi-peak-week" className="p-2.5 rounded-2xl bg-white border border-zinc-200/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
            Peak Week
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-red-700 font-mono">
              {peakWeek ? peakWeek.total : 0}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium truncate">
              {peakWeek && peakWeek.total > 0 ? peakWeek.label : 'None'}
            </span>
          </div>
        </div>

        <div id="kpi-period-total" className="p-2.5 rounded-2xl bg-white border border-zinc-200/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
            Period Total
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-zinc-950 font-mono">
              {totalIncidentsInPeriod}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium">total cases</span>
          </div>
        </div>
      </div>

      {/* Main Line Chart Canvas */}
      <div className="p-4 sm:p-5">
        <div className="w-full h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={weeklyData}
              margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#cbd5e1"
                tickLine={false}
                dy={6}
              />
              <YAxis 
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#cbd5e1"
                tickLine={false}
                dx={-4}
              />
              <Tooltip content={<CustomTooltip />} />

              {viewMode === 'total' ? (
                <>
                  {/* Primary Total Incident Frequency Line */}
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Reported Incidents"
                    stroke="#991B1B"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#991B1B', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 7, fill: '#7F1D1D', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                  {/* Resolved Cases Trend Line */}
                  <Line
                    type="monotone"
                    dataKey="resolved"
                    name="Resolved Cases"
                    stroke="#059669"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#059669', strokeWidth: 1, stroke: '#ffffff' }}
                    activeDot={{ r: 5, fill: '#047857' }}
                  />
                </>
              ) : (
                <>
                  {/* Category-specific lines */}
                  <Line
                    type="monotone"
                    dataKey="theft"
                    name="Donkey Theft"
                    stroke="#DC2626"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#DC2626', strokeWidth: 1, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#B91C1C' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="slaughter"
                    name="Bush Slaughter"
                    stroke="#7F1D1D"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#7F1D1D', strokeWidth: 1, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#5F1414' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trafficking"
                    name="Trafficking"
                    stroke="#EA580C"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#EA580C', strokeWidth: 1, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#C2410C' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="abuse"
                    name="Abuse / Neglect"
                    stroke="#9333EA"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#9333EA', strokeWidth: 1, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#7E22CE' }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend / Interactive Category Filter Pill */}
        <div className="mt-3 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {viewMode === 'total' ? (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-50 text-red-800 font-bold border border-red-100 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-[#991B1B]" />
                  <span>Reported Incidents</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  <span>Resolved Cases</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                  <span>Theft</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-[#7F1D1D]" />
                  <span>Slaughter</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
                  <span>Trafficking</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-[#9333EA]" />
                  <span>Abuse</span>
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Updated live from community reports</span>
          </div>
        </div>

        {/* Empty / Low Incident State guidance */}
        {totalIncidentsInPeriod === 0 && (
          <div className="mt-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/80 text-xs text-zinc-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Zero incidents recorded in the current {timeframe === '6w' ? '6-week' : '12-week'} window. New reports submitted via <strong>Ripoti Sasa</strong> or <strong>Emergency Report</strong> will automatically chart here.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
