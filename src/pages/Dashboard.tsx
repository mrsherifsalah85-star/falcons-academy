import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Group, SessionReport, Evaluation, Exam, Profile, Student } from '@/types';
import {
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  Brain,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  BookOpen,
} from 'lucide-react';

type PaceStatus = 'on_time' | 'delayed' | 'faster' | 'not_started';

interface GroupWithCourses extends Group {
  course1_name?: string | null;
  course1_target?: number | null;
  course1_start_date?: string | null;
  course2_name?: string | null;
  course2_target?: number | null;
  course2_start_date?: string | null;
}

interface ExtendedSessionReport extends SessionReport {
  course1_active?: boolean | null;
  course2_active?: boolean | null;
  group?: GroupWithCourses;
}

function evaluateCoursePace(params: {
  targetSessions: number;
  actualSessions: number;
  manualStartDate?: string | null;
  earliestSessionDate?: string | null;
  daysPerSession?: number;
}): {
  status: PaceStatus;
  effectiveStartDate: string | null;
  expectedSessions: number;
  label: string;
} {
  const {
    targetSessions,
    actualSessions,
    manualStartDate,
    earliestSessionDate,
    daysPerSession = 3.5,
  } = params;

  const effectiveStartDate =
    (manualStartDate && manualStartDate.trim()) || earliestSessionDate || null;

  if (!effectiveStartDate || actualSessions === 0) {
    return {
      status: 'not_started',
      effectiveStartDate,
      expectedSessions: 0,
      label: 'Not Started',
    };
  }

  const startMs = new Date(effectiveStartDate).getTime();
  const elapsedDays = Math.max(0, (Date.now() - startMs) / (1000 * 60 * 60 * 24));
  const safeTarget = Math.max(1, targetSessions || 20);
  const expectedSessions = Math.min(
    safeTarget,
    Math.max(1, Math.round(elapsedDays / daysPerSession))
  );

  const diff = actualSessions - expectedSessions;
  if (diff < -1) {
    return {
      status: 'delayed',
      effectiveStartDate,
      expectedSessions,
      label: `Delayed (${Math.abs(diff)} behind)`,
    };
  }
  if (diff > 1) {
    return {
      status: 'faster',
      effectiveStartDate,
      expectedSessions,
      label: `Faster (${diff} ahead)`,
    };
  }
  return {
    status: 'on_time',
    effectiveStartDate,
    expectedSessions,
    label: 'On Time',
  };
}

export function Dashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupWithCourses[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [recentReports, setRecentReports] = useState<ExtendedSessionReport[]>([]);
  const [allGroupSessions, setAllGroupSessions] = useState<ExtendedSessionReport[]>([]);
  const [exams, setExams] = useState<(Exam & { group?: GroupWithCourses })[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<
    (Evaluation & { quiz_max_score?: number })[]
  >([]);

  const loadData = useCallback(async () => {
    const [groupsRes, teachersRes, studentsRes, reportsRes, allSessionsRes, examsRes] =
      await Promise.all([
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('students').select('*'),
        supabase
          .from('sessions')
          .select('*, group:groups(*)')
          .order('report_date', { ascending: false })
          .limit(50),
        supabase
          .from('sessions')
          .select('id, group_id, teacher_id, report_date, pace, course1_active, course2_active')
          .order('report_date', { ascending: true }),
        supabase.from('exams').select('*, group:groups(*)').order('exam_date'),
      ]);

    setGroups((groupsRes.data as GroupWithCourses[]) || []);
    setTeachers((teachersRes.data as Profile[]) || []);
    setStudents((studentsRes.data as Student[]) || []);
    setRecentReports((reportsRes.data as ExtendedSessionReport[]) || []);
    setAllGroupSessions((allSessionsRes.data as ExtendedSessionReport[]) || []);
    setExams((examsRes.data as (Exam & { group: GroupWithCourses })[]) || []);

    if (reportsRes.data && reportsRes.data.length > 0) {
      const reportIds = reportsRes.data.map((r) => r.id);
      const { data: evalData } = await supabase
        .from('student_evaluations')
        .select('*, session_report:sessions(quiz_max_score)')
        .in('session_report_id', reportIds);
      setAllEvaluations((evalData as (Evaluation & { quiz_max_score?: number })[]) || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Course pacing analysis per group (Course 1 & Course 2)
  const coursePacingByGroup = useMemo(() => {
    return groups.map((group) => {
      const groupSessions = allGroupSessions.filter((s) => s.group_id === group.id);

      const c1Sessions = groupSessions.filter((s) => Boolean(s.course1_active));
      const c2Sessions = groupSessions.filter((s) => Boolean(s.course2_active));

      const c1EarliestDate =
        c1Sessions.map((s) => s.report_date).filter(Boolean).sort()[0] || null;
      const c2EarliestDate =
        c2Sessions.map((s) => s.report_date).filter(Boolean).sort()[0] || null;

      const c1Target = group.course1_target ?? 20;
      const c2Target = group.course2_target ?? 20;

      const c1 = evaluateCoursePace({
        targetSessions: c1Target,
        actualSessions: c1Sessions.length,
        manualStartDate: group.course1_start_date,
        earliestSessionDate: c1EarliestDate,
      });

      const c2 = evaluateCoursePace({
        targetSessions: c2Target,
        actualSessions: c2Sessions.length,
        manualStartDate: group.course2_start_date,
        earliestSessionDate: c2EarliestDate,
      });

      return {
        group,
        c1: {
          name: (group.course1_name || '').trim() || 'Course 1',
          actual: c1Sessions.length,
          target: c1Target,
          ...c1,
        },
        c2: {
          name: (group.course2_name || '').trim() || 'Course 2',
          actual: c2Sessions.length,
          target: c2Target,
          ...c2,
        },
      };
    });
  }, [groups, allGroupSessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  const teacherPace = teachers
    .filter((t) => t.role === 'teacher')
    .map((teacher) => {
      const teacherReports = recentReports.filter((r) => r.teacher_id === teacher.id);
      const onTime = teacherReports.filter((r) => r.pace === 'on_time').length;
      const delayed = teacherReports.filter((r) => r.pace === 'delayed').length;
      const faster = teacherReports.filter((r) => r.pace === 'faster').length;
      const total = teacherReports.length;
      return { teacher, onTime, delayed, faster, total };
    });

  const groupIntelligence = groups.map((g) => {
    const groupStudents = students.filter((s) => s.group_id === g.id);
    return { group: g, studentCount: groupStudents.length };
  });

  const today = new Date();
  const upcomingExams = exams
    .map((e) => {
      const days = Math.ceil(
        (new Date(e.exam_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { ...e, daysUntil: days };
    })
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const urgentExams = upcomingExams.filter((e) => e.daysUntil <= 7);

  const groupAnalytics = groups.map((g) => {
    const groupReportIds = recentReports.filter((r) => r.group_id === g.id).map((r) => r.id);
    const groupEvals = allEvaluations.filter((e) => groupReportIds.includes(e.session_report_id));
    const quizPcts = groupEvals
      .filter((e) => e.quiz_score !== null)
      .map((e) => {
        const max = (e as Evaluation & { quiz_max_score?: number }).quiz_max_score ?? 100;
        return Math.round(((e.quiz_score as number) / max) * 100);
      });
    const avgQuizPct =
      quizPcts.length > 0
        ? Math.round(quizPcts.reduce((a, b) => a + b, 0) / quizPcts.length)
        : null;
    const committed = groupEvals.filter((e) => e.behavior === 'Committed').length;
    const disruptive = groupEvals.filter((e) => e.behavior === 'Disruptive').length;
    const goodHomework = groupEvals.filter((e) => e.homework === 'Done Well').length;
    const notDoneHomework = groupEvals.filter((e) => e.homework === 'Not Done').length;
    return {
      group: g,
      avgQuizPct,
      evalCount: groupEvals.length,
      committed,
      disruptive,
      goodHomework,
      notDoneHomework,
    };
  });

  const renderCourseBadge = (item: {
    name: string;
    actual: number;
    target: number;
    expectedSessions: number;
    effectiveStartDate: string | null;
    status: PaceStatus;
    label: string;
  }) => {
    const styleMap: Record<PaceStatus, string> = {
      on_time: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      delayed: 'bg-amber-100 text-amber-800 border-amber-200',
      faster: 'bg-blue-100 text-blue-800 border-blue-200',
      not_started: 'bg-slate-100 text-slate-600 border-slate-200',
    };

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{item.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Actual: <strong className="text-slate-800">{item.actual}</strong> / {item.target} sessions
            {' · '}
            Expected: <strong className="text-slate-700">{item.expectedSessions}</strong>
            {item.effectiveStartDate ? ` · Start: ${item.effectiveStartDate}` : ''}
          </p>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 self-start sm:self-center ${
            styleMap[item.status]
          }`}
        >
          {item.label}
        </span>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Overview of teacher performance, course pacing, group analytics, and exam alerts
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Total Groups" value={groups.length} color="blue" />
        <StatCard icon={Users} label="Total Students" value={students.length} color="emerald" />
        <StatCard
          icon={Clock}
          label="Active Teachers"
          value={teachers.filter((t) => t.role === 'teacher').length}
          color="amber"
        />
        <StatCard icon={AlertTriangle} label="Urgent Exams" value={urgentExams.length} color="red" />
      </div>

      {/* Course Pacing Analysis (Actual vs Target & Start Dates) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          Course Pacing Analysis (Actual vs Target)
        </h2>
        {coursePacingByGroup.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No groups yet.</p>
        ) : (
          <div className="space-y-4">
            {coursePacingByGroup.map(({ group, c1, c2 }) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200/80 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">
                    {group.name}
                    {group.level ? (
                      <span className="text-xs font-normal text-slate-400 ml-1.5">
                        ({group.level})
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {renderCourseBadge(c1)}
                  {renderCourseBadge(c2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exam Alarms */}
      {upcomingExams.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Early Exam Alarms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingExams.map((exam) => (
              <div
                key={exam.id}
                className={`rounded-lg p-4 border-2 transition-all ${
                  exam.daysUntil <= 3
                    ? 'border-red-200 bg-red-50'
                    : exam.daysUntil <= 7
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{exam.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {exam.group?.name ?? 'Unknown group'}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full ${
                      exam.daysUntil <= 3
                        ? 'bg-red-600 text-white'
                        : exam.daysUntil <= 7
                        ? 'bg-amber-500 text-white'
                        : 'bg-blue-500 text-white'
                    }`}
                  >
                    {exam.daysUntil === 0 ? 'Today' : `${exam.daysUntil}d`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(exam.exam_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Teacher Pace Tracking */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Teacher Pace Tracking
          </h2>
          {teacherPace.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No teacher reports yet.</p>
          ) : (
            <div className="space-y-3">
              {teacherPace.map(({ teacher, onTime, delayed, faster, total }) => (
                <div key={teacher.id} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {teacher.display_name}
                    </p>
                    <p className="text-xs text-slate-400">{total} reports</p>
                  </div>
                  <div className="flex-1 flex h-7 rounded-lg overflow-hidden bg-slate-100">
                    {total > 0 && (
                      <>
                        {onTime > 0 && (
                          <div
                            className="bg-emerald-500 flex items-center justify-center text-xs text-white font-medium"
                            style={{ width: `${(onTime / total) * 100}%` }}
                          >
                            {onTime > 2 ? onTime : ''}
                          </div>
                        )}
                        {delayed > 0 && (
                          <div
                            className="bg-amber-500 flex items-center justify-center text-xs text-white font-medium"
                            style={{ width: `${(delayed / total) * 100}%` }}
                          >
                            {delayed > 2 ? delayed : ''}
                          </div>
                        )}
                        {faster > 0 && (
                          <div
                            className="bg-blue-500 flex items-center justify-center text-xs text-white font-medium"
                            style={{ width: `${(faster / total) * 100}%` }}
                          >
                            {faster > 2 ? faster : ''}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-500" /> On Time
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-500" /> Delayed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-blue-500" /> Faster
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Group Intelligence */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            Group Intelligence
          </h2>
          {groupIntelligence.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No groups yet.</p>
          ) : (
            <div className="space-y-2">
              {groupIntelligence.map(({ group, studentCount }) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{group.name}</p>
                    <p className="text-xs text-slate-400">
                      {studentCount} students{group.level ? ` · ${group.level}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      group.intelligence === 'strong'
                        ? 'bg-emerald-100 text-emerald-700'
                        : group.intelligence === 'weak'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {group.intelligence === 'strong'
                      ? 'Strong'
                      : group.intelligence === 'weak'
                      ? 'Weak'
                      : 'Unclassified'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Student Progress Analytics */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          Student Progress Analytics
        </h2>
        {groupAnalytics.every((a) => a.evalCount === 0) ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            No evaluation data yet. Evaluations will appear here once teachers start logging sessions.
          </p>
        ) : (
          <div className="space-y-4">
            {groupAnalytics
              .filter((a) => a.evalCount > 0)
              .map(
                ({
                  group,
                  avgQuizPct,
                  evalCount,
                  committed,
                  disruptive,
                  goodHomework,
                  notDoneHomework,
                }) => (
                  <div key={group.id} className="border-b border-slate-100 pb-4 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                      <span className="text-xs text-slate-400">
                        {evalCount} student_evaluations
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricBar
                        label="Avg Quiz"
                        value={avgQuizPct}
                        max={100}
                        suffix="%"
                        color="bg-blue-500"
                      />
                      <MetricStat
                        label="Behavior"
                        good={committed}
                        bad={disruptive}
                        goodLabel="Committed"
                        badLabel="Disruptive"
                        goodIcon={CheckCircle2}
                        badIcon={XCircle}
                      />
                      <MetricStat
                        label="Homework"
                        good={goodHomework}
                        bad={notDoneHomework}
                        goodLabel="Done Well"
                        badLabel="Not Done"
                        goodIcon={CheckCircle2}
                        badIcon={XCircle}
                      />
                      <div className="flex items-center justify-center">
                        <span
                          className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                            group.intelligence === 'strong'
                              ? 'bg-emerald-100 text-emerald-700'
                              : group.intelligence === 'weak'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {group.intelligence === 'strong'
                            ? 'Strong Group'
                            : group.intelligence === 'weak'
                            ? 'Weak Group'
                            : 'Unclassified'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  max,
  suffix,
  color,
}: {
  label: string;
  value: number | null;
  max: number;
  suffix?: string;
  color: string;
}) {
  const pct = value !== null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium text-slate-700 shrink-0">
          {value !== null ? `${value}${suffix ?? ''}` : '—'}
        </span>
      </div>
    </div>
  );
}

function MetricStat({
  label,
  good,
  bad,
  goodLabel,
  badLabel,
  goodIcon: GoodIcon,
  badIcon: BadIcon,
}: {
  label: string;
  good: number;
  bad: number;
  goodLabel: string;
  badLabel: string;
  goodIcon: typeof CheckCircle2;
  badIcon: typeof XCircle;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 text-emerald-600">
          <GoodIcon className="w-3.5 h-3.5" /> {good} {goodLabel}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs mt-0.5">
        <span className="flex items-center gap-1 text-red-500">
          <BadIcon className="w-3.5 h-3.5" /> {bad} {badLabel}
        </span>
      </div>
    </div>
  );
}
