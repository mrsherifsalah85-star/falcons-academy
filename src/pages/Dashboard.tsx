import { useState, useEffect, useCallback, useMemo } from 'react';
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
  ChevronRight,
  FolderKanban,
  UserCheck,
} from 'lucide-react';

type PaceStatus = 'on_time' | 'delayed' | 'faster' | 'not_started';

interface GroupWithCourses extends Group {
  teacher_id?: string | null;
  course1_name?: string | null;
  course1_title?: string | null;
  course_1_name?: string | null;
  course1?: string | null;
  track1_name?: string | null;
  course1_target?: number | null;
  course1_start_date?: string | null;
  course2_name?: string | null;
  course2_title?: string | null;
  course_2_name?: string | null;
  course2?: string | null;
  track2_name?: string | null;
  course2_target?: number | null;
  course2_start_date?: string | null;
}

interface ExtendedSessionReport extends SessionReport {
  course1_active?: boolean | null;
  course2_active?: boolean | null;
  group?: GroupWithCourses;
}

function resolveCourseLabel(
  group: GroupWithCourses,
  courseIndex: 1 | 2
): string {
  const candidates =
    courseIndex === 1
      ? [
          group.course1_name,
          group.course1_title,
          group.course_1_name,
          group.track1_name,
          group.course1,
        ]
      : [
          group.course2_name,
          group.course2_title,
          group.course_2_name,
          group.track2_name,
          group.course2,
        ];

  const found = candidates.find(
    (val) => typeof val === 'string' && val.trim().length > 0
  );

  if (found) return found.trim();
  return courseIndex === 1 ? 'Course 1' : 'Course 2';
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
    daysPerSession = 7, // 1 session per week
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

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

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
          .limit(100),
        supabase
          .from('sessions')
          .select('id, group_id, teacher_id, report_date, pace, course1_active, course2_active')
          .order('report_date', { ascending: true }),
        supabase.from('exams').select('*, group:groups(*)').order('exam_date'),
      ]);

    const loadedGroups = (groupsRes.data as GroupWithCourses[]) || [];
    const loadedTeachers = ((teachersRes.data as Profile[]) || []).filter(
      (t) => t.role === 'teacher'
    );

    setGroups(loadedGroups);
    setTeachers(loadedTeachers);
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

    if (loadedTeachers.length > 0) {
      setSelectedTeacherId((prev) => prev || loadedTeachers[0].id);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const teacherGroups = useMemo(() => {
    if (!selectedTeacherId) return [];
    return groups.filter((g) => g.teacher_id === selectedTeacherId);
  }, [groups, selectedTeacherId]);

  useEffect(() => {
    if (teacherGroups.length === 0) {
      setSelectedGroupId('');
      return;
    }
    const stillExists = teacherGroups.some((g) => g.id === selectedGroupId);
    if (!stillExists) {
      setSelectedGroupId(teacherGroups[0].id);
    }
  }, [teacherGroups, selectedGroupId]);

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId]
  );

  const selectedGroup = useMemo(
    () => teacherGroups.find((g) => g.id === selectedGroupId) || null,
    [teacherGroups, selectedGroupId]
  );

  const selectedGroupDetails = useMemo(() => {
    if (!selectedGroup) return null;

    const groupStudents = students.filter((s) => s.group_id === selectedGroup.id);
    const groupSessions = allGroupSessions.filter((s) => s.group_id === selectedGroup.id);

    const c1Sessions = groupSessions.filter((s) => Boolean(s.course1_active));
    const c2Sessions = groupSessions.filter((s) => Boolean(s.course2_active));

    const c1EarliestDate =
      c1Sessions.map((s) => s.report_date).filter(Boolean).sort()[0] || null;
    const c2EarliestDate =
      c2Sessions.map((s) => s.report_date).filter(Boolean).sort()[0] || null;

    const c1Target = selectedGroup.course1_target ?? 20;
    const c2Target = selectedGroup.course2_target ?? 20;

    const c1Pace = evaluateCoursePace({
      targetSessions: c1Target,
      actualSessions: c1Sessions.length,
      manualStartDate: selectedGroup.course1_start_date,
      earliestSessionDate: c1EarliestDate,
      daysPerSession: 7,
    });

    const c2Pace = evaluateCoursePace({
      targetSessions: c2Target,
      actualSessions: c2Sessions.length,
      manualStartDate: selectedGroup.course2_start_date,
      earliestSessionDate: c2EarliestDate,
      daysPerSession: 7,
    });

    const groupReportIds = recentReports
      .filter((r) => r.group_id === selectedGroup.id)
      .map((r) => r.id);
    const groupEvals = allEvaluations.filter((e) =>
      groupReportIds.includes(e.session_report_id)
    );

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
      studentCount: groupStudents.length,
      sessionsCount: groupSessions.length,
      evalCount: groupEvals.length,
      avgQuizPct,
      committed,
      disruptive,
      goodHomework,
      notDoneHomework,
      c1: {
        name: resolveCourseLabel(selectedGroup, 1),
        actual: c1Sessions.length,
        target: c1Target,
        ...c1Pace,
      },
      c2: {
        name: resolveCourseLabel(selectedGroup, 2),
        actual: c2Sessions.length,
        target: c2Target,
        ...c2Pace,
      },
    };
  }, [selectedGroup, students, allGroupSessions, recentReports, allEvaluations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

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

  const renderCourseCard = (item: {
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

    const pct = Math.min(100, Math.round((item.actual / Math.max(1, item.target)) * 100));

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900">{item.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Start Date: <strong className="text-slate-700">{item.effectiveStartDate || '—'}</strong>
            </p>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
              styleMap[item.status]
            }`}
          >
            {item.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Actual: <strong className="text-slate-900">{item.actual}</strong> / {item.target} sessions ({pct}%)
          </span>
          <span>
            Expected by today: <strong className="text-slate-800">{item.expectedSessions}</strong> sessions
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              item.status === 'delayed'
                ? 'bg-amber-500'
                : item.status === 'faster'
                ? 'bg-blue-600'
                : item.status === 'on_time'
                ? 'bg-emerald-600'
                : 'bg-slate-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Super Admin Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Select a teacher, choose a group, and inspect course pacing &amp; student progress
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Total Groups" value={groups.length} color="blue" />
        <StatCard icon={Users} label="Total Students" value={students.length} color="emerald" />
        <StatCard icon={Clock} label="Active Teachers" value={teachers.length} color="amber" />
        <StatCard icon={AlertTriangle} label="Urgent Exams" value={urgentExams.length} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Column 1: Teachers list */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-600" />
            Teachers ({teachers.length})
          </h2>

          {teachers.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No teachers found.</p>
          ) : (
            <div className="space-y-1.5">
              {teachers.map((teacher) => {
                const count = groups.filter((g) => g.teacher_id === teacher.id).length;
                const active = teacher.id === selectedTeacherId;
                return (
                  <button
                    key={teacher.id}
                    type="button"
                    onClick={() => setSelectedTeacherId(teacher.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                        : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{teacher.display_name}</p>
                      <p className="text-[11px] text-slate-400">{count} groups</p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-blue-600' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 2: Groups for selected teacher */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-emerald-600" />
            {selectedTeacher ? `${selectedTeacher.display_name} Groups` : 'Groups'}
          </h2>

          {teacherGroups.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No groups assigned to this teacher.
            </p>
          ) : (
            <div className="space-y-1.5">
              {teacherGroups.map((grp) => {
                const stCount = students.filter((s) => s.group_id === grp.id).length;
                const active = grp.id === selectedGroupId;
                return (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => setSelectedGroupId(grp.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                        : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{grp.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {stCount} students{grp.level ? ` · ${grp.level}` : ''}
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-emerald-600' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 3: Selected group progress & course pacing */}
        <div className="lg:col-span-6 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          {!selectedGroup || !selectedGroupDetails ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-slate-400">
              <BookOpen className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">Select a teacher and group</p>
              <p className="text-xs mt-1">
                Pick a group from the middle list to inspect its course pacing and progress.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedGroup.name}</h2>
                  <p className="text-xs text-slate-500">
                    Teacher: <strong>{selectedTeacher?.display_name || '—'}</strong> ·{' '}
                    {selectedGroupDetails.studentCount} students ·{' '}
                    {selectedGroupDetails.sessionsCount} sessions
                  </p>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full ${
                    selectedGroup.intelligence === 'strong'
                      ? 'bg-emerald-100 text-emerald-700'
                      : selectedGroup.intelligence === 'weak'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {selectedGroup.intelligence === 'strong'
                    ? 'Strong Group'
                    : selectedGroup.intelligence === 'weak'
                    ? 'Weak Group'
                    : 'Unclassified'}
                </span>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Courses Pace Analysis (1 Session / Week)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {renderCourseCard(selectedGroupDetails.c1)}
                  {renderCourseCard(selectedGroupDetails.c2)}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-purple-600" />
                  Group Evaluation Summary ({selectedGroupDetails.evalCount} records)
                </h3>

                {selectedGroupDetails.evalCount === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No student evaluation records logged for this group yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <MetricBar
                      label="Avg Quiz Score"
                      value={selectedGroupDetails.avgQuizPct}
                      max={100}
                      suffix="%"
                      color="bg-blue-600"
                    />
                    <MetricStat
                      label="Behavior"
                      good={selectedGroupDetails.committed}
                      bad={selectedGroupDetails.disruptive}
                      goodLabel="Committed"
                      badLabel="Disruptive"
                      goodIcon={CheckCircle2}
                      badIcon={XCircle}
                    />
                    <MetricStat
                      label="Homework"
                      good={selectedGroupDetails.goodHomework}
                      bad={selectedGroupDetails.notDoneHomework}
                      goodLabel="Done Well"
                      badLabel="Not Done"
                      goodIcon={CheckCircle2}
                      badIcon={XCircle}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {upcomingExams.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Early Exam Alarms (Next 14 Days)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingExams.map((exam) => (
              <div
                key={exam.id}
                className={`rounded-lg p-3.5 border ${
                  exam.daysUntil <= 3
                    ? 'border-red-200 bg-red-50'
                    : exam.daysUntil <= 7
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{exam.title}</p>
                    <p className="text-xs text-slate-500">{exam.group?.name ?? 'Unknown group'}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
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
