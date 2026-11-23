import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Group, Student, SessionReport, Evaluation } from '@/types';
import {
  LineChart as LineChartIcon,
  Loader2,
  TrendingUp,
  ChevronDown,
  Info,
  X,
} from 'lucide-react';

type Metric = 'quiz' | 'dictation' | 'reading' | 'homework' | 'behavior';

const METRICS: { value: Metric; label: string }[] = [
  { value: 'quiz', label: 'Quiz Score (%)' },
  { value: 'dictation', label: 'Dictation' },
  { value: 'reading', label: 'Reading' },
  { value: 'homework', label: 'Homework' },
  { value: 'behavior', label: 'Behavior' },
];

const ORDINAL_OPTIONS: Record<string, { values: string[]; scores: Record<string, number> }> = {
  reading: {
    values: ['Needs Study More', 'Needs Practice', 'Good'],
    scores: { 'Needs Study More': 0, 'Needs Practice': 50, Good: 100 },
  },
  homework: {
    values: ['Not Done', 'Careless', 'Done Well'],
    scores: { 'Not Done': 0, Careless: 50, 'Done Well': 100 },
  },
  behavior: {
    values: ['Disruptive', 'Committed'],
    scores: { Disruptive: 0, Committed: 100 },
  },
};

interface SeriesPoint {
  date: string;
  label: string;
  value: number | null;
  raw: string | null;
  maxScore: number;
  notes: string;
  pace: string;
}

// Older records may hold text values; parse defensively so they never crash the chart.
function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function StudentProgress() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [metric, setMetric] = useState<Metric>('quiz');
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; point: SeriesPoint } | null>(null);

  const isTeacher = profile?.role === 'teacher';

  const loadGroups = useCallback(async () => {
    let query = supabase.from('groups').select('*');
    if (isTeacher) {
      query = query.eq('teacher_id', profile!.id);
    }
    const { data } = await query.order('name');
    setGroups((data as Group[]) || []);
    setLoading(false);
  }, [isTeacher, profile]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Load students for the selected group
  useEffect(() => {
    if (!selectedGroupId) {
      setStudents([]);
      return;
    }
    supabase
      .from('students')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('name')
      .then(({ data }) => {
        setStudents((data as Student[]) || []);
        setSelectedStudentId('');
      });
  }, [selectedGroupId]);

  // Load series when a student + metric is selected
  useEffect(() => {
    if (!selectedStudentId) {
      setSeries([]);
      return;
    }
    setLoadingSeries(true);
    (async () => {
      const { data: evals } = await supabase
        .from('student_evaluations')
        .select('*, session_report:sessions(*)')
        .eq('student_id', selectedStudentId)
        .order('created_at', { ascending: true });

      if (!evals) {
        setSeries([]);
        setLoadingSeries(false);
        return;
      }

      const points: SeriesPoint[] = (evals as (Evaluation & { session_report: SessionReport })[])
        .map((e) => {
          const sr = e.session_report;
          let value: number | null = null;
          let raw: string | null = null;
          let maxScore = 100;
          if (metric === 'quiz' || metric === 'dictation') {
            const numVal = metric === 'quiz' ? toNumber(e.quiz_score) : toNumber(e.dictation as string | number | null);
            maxScore = metric === 'quiz'
              ? (sr?.quiz_max_score ?? 100)
              : (sr?.dictation_max_score ?? 10);
            raw = numVal !== null ? String(numVal) : null;
            value = numVal !== null && maxScore > 0
              ? Math.round((numVal / maxScore) * 100)
              : null;
          } else {
            raw = (e[metric] as string | null) ?? null;
            const scores = ORDINAL_OPTIONS[metric]?.scores;
            if (raw && scores && raw in scores) value = scores[raw];
          }
          return {
            date: sr?.report_date ?? '',
            label: sr?.report_date
              ? new Date(sr.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '',
            value,
            raw,
            maxScore,
            notes: sr?.content ?? '',
            pace: sr?.pace ?? '',
          };
        })
        .filter((p) => p.date)
        .sort((a, b) => a.date.localeCompare(b.date));

      setSeries(points);
      setLoadingSeries(false);
    })();
  }, [selectedStudentId, metric]);

  const sortedSeries = useMemo(() => series, [series]);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LineChartIcon className="w-6 h-6 text-emerald-600" />
          Student Progress
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Visualize a student's performance across saved sessions over time.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Group</label>
            <div className="relative">
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 pr-9 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              >
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g.level ? ` — ${g.level}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Student</label>
            <div className="relative">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                disabled={!selectedGroupId || students.length === 0}
                className="w-full appearance-none px-3 py-2.5 pr-9 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Select a student...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Metric</label>
            <div className="relative">
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as Metric)}
                className="w-full appearance-none px-3 py-2.5 pr-9 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : !selectedStudentId ? (
          <EmptyState
            icon={<LineChartIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />}
            title="No student selected"
            subtitle="Pick a group and student above to see their progress over time."
          />
        ) : loadingSeries ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : sortedSeries.length < 2 ? (
          <EmptyState
            icon={<Info className="w-12 h-12 mx-auto mb-3 text-slate-300" />}
            title="Not enough sessions yet"
            subtitle={
              sortedSeries.length === 0
                ? "This student has no saved student_evaluations yet. Progress will appear here once sessions are logged."
                : "This student has only one saved session. At least two sessions are needed to show a trend."
            }
          />
        ) : (
          <ProgressChart series={sortedSeries} metric={metric} hover={hover} setHover={setHover} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16">
      {icon}
      <p className="font-medium text-slate-700">{title}</p>
      <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">{subtitle}</p>
    </div>
  );
}

function ProgressChart({
  series,
  metric,
  hover,
  setHover,
}: {
  series: SeriesPoint[];
  metric: Metric;
  hover: { x: number; y: number; point: SeriesPoint } | null;
  setHover: (h: { x: number; y: number; point: SeriesPoint } | null) => void;
}) {
  const width = 760;
  const height = 320;
  const padding = { top: 20, right: 20, bottom: 44, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const validPoints = series.filter((p) => p.value !== null);
  const hasAny = validPoints.length > 0;

  // X scale: index-based, spread across all series points
  const xFor = (i: number) => padding.left + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  // Y scale: 0..100 -> bottom..top
  const yFor = (v: number) => padding.top + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const linePath = useMemo(() => {
    if (!hasAny) return '';
    let d = '';
    let started = false;
    series.forEach((p, i) => {
      if (p.value === null) return;
      d += `${started ? ' L' : 'M'} ${xFor(i).toFixed(2)} ${yFor(p.value).toFixed(2)}`;
      started = true;
    });
    return d;
  }, [series, hasAny]);

  const areaPath = useMemo(() => {
    if (!hasAny) return '';
    const pts = series.filter((p, i) => p.value !== null).map((p, i) => ({ p, idx: series.indexOf(p) }));
    if (pts.length === 0) return '';
    const top = pts.map((pt) => `${pt.idx === 0 ? 'M' : 'L'} ${xFor(pt.idx).toFixed(2)} ${yFor(pt.p.value!).toFixed(2)}`).join(' ');
    const lastIdx = pts[pts.length - 1].idx;
    const firstIdx = pts[0].idx;
    return `${top} L ${xFor(lastIdx).toFixed(2)} ${padding.top + innerH} L ${xFor(firstIdx).toFixed(2)} ${padding.top + innerH} Z`;
  }, [series, hasAny]);

  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[480px] h-auto"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y labels */}
        {gridLines.map((g) => {
          const y = yFor(g);
          return (
            <g key={g}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgb(241 245 249)" strokeWidth={1} />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: 11 }}>
                {g}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        {hasAny && (
          <>
            <path d={areaPath} fill="url(#progressArea)" />
            <path d={linePath} fill="none" stroke="rgb(16 185 129)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {/* Points + interaction targets */}
        {series.map((p, i) => {
          const cx = xFor(i);
          const hasValue = p.value !== null;
          const cy = hasValue ? yFor(p.value!) : padding.top + innerH;
          return (
            <g key={i}>
              {hasValue && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={hover?.point === p ? 6 : 4}
                  fill="white"
                  stroke="rgb(16 185 129)"
                  strokeWidth={2.5}
                  className="transition-all"
                />
              )}
              {/* X label */}
              <text x={cx} y={height - padding.bottom + 20} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
                {p.label}
              </text>
              {/* Invisible hit area */}
              <rect
                x={cx - innerW / Math.max(series.length, 1) / 2}
                y={padding.top}
                width={innerW / Math.max(series.length, 1)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover({ x: cx, y: cy, point: p })}
                onTouchStart={() => setHover({ x: cx, y: cy, point: p })}
              />
            </g>
          );
        })}

        {/* Hover indicator line */}
        {hover && (
          <line
            x1={hover.x}
            y1={padding.top}
            x2={hover.x}
            y2={padding.top + innerH}
            stroke="rgb(203 213 225)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hover && (
        <Tooltip
          point={hover.point}
          metric={metric}
          chartWidth={width}
          leftPct={hover.x / width}
          topPct={hover.y / height}
          onClose={() => setHover(null)}
        />
      )}

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400">
        <TrendingUp className="w-3.5 h-3.5" />
        {metric === 'quiz' || metric === 'dictation'
          ? `Scores shown as a percentage of each session max score (${metric === 'quiz' ? 'quiz' : 'dictation'}).`
          : 'Ordinal metrics mapped to a 0–100 scale.'}
      </div>
    </div>
  );
}

function Tooltip({
  point,
  metric,
  chartWidth,
  leftPct,
  topPct,
  onClose,
}: {
  point: SeriesPoint;
  metric: Metric;
  chartWidth: number;
  leftPct: number;
  topPct: number;
  onClose: () => void;
}) {
  const dateLabel = point.date
    ? new Date(point.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? metric;
  const valueLabel =
    point.value === null
      ? 'No data'
      : metric === 'reading' || metric === 'homework' || metric === 'behavior'
      ? `${point.raw} (${point.value}/100)`
      : `${point.raw}/${point.maxScore} (${point.value}%)`;

  // Position tooltip relative to the chart container. Flip horizontally near edges.
  const flip = leftPct > 0.72;
  const style: React.CSSProperties = {
    left: `${leftPct * 100}%`,
    top: `${topPct * 100}%`,
    transform: `translate(${flip ? '-100%' : '0'}, calc(-100% - 14px))`,
  };

  return (
    <div
      className="absolute z-10 pointer-events-auto w-56 rounded-lg bg-slate-900 text-white shadow-xl p-3 text-xs"
      style={style}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-semibold leading-tight">{dateLabel}</p>
        <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        <Row label={metricLabel} value={valueLabel} />
        <Row label="Pace" value={paceLabel(point.pace)} />
      </div>
      {point.notes && (
        <p className="mt-2 pt-2 border-t border-slate-700 text-slate-300 leading-relaxed line-clamp-3">
          {point.notes}
        </p>
      )}
      <div
        className="absolute w-3 h-3 rotate-45 bg-slate-900"
        style={{
          [flip ? 'right' : 'left']: 10,
          bottom: -5,
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function paceLabel(pace: string) {
  switch (pace) {
    case 'on_time':
      return 'On Time';
    case 'delayed':
      return 'Delayed';
    case 'faster':
      return 'Faster';
    default:
      return '—';
  }
}
