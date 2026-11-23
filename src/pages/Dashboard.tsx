import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

export function Dashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [recentReports, setRecentReports] = useState<(SessionReport & { group?: Group })[]>([]);
  const [exams, setExams] = useState<(Exam & { group?: Group })[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<(Evaluation & { quiz_max_score?: number })[]>([]);

  const loadData = useCallback(async () => {
    const [groupsRes, teachersRes, studentsRes, reportsRes, examsRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('students').select('*'),
      supabase.from('sessions').select('*, group:groups(*)').order('report_date', { ascending: false }).limit(50),
      supabase.from('exams').select('*, group:groups(*)').order('exam_date'),
    ]);

    setGroups((groupsRes.data as Group[]) || []);
    setTeachers((teachersRes.data as Profile[]) || []);
    setStudents((studentsRes.data as Student[]) || []);
    setRecentReports((reportsRes.data as (SessionReport & { group: Group })[]) || []);
    setExams((examsRes.data as (Exam & { group: Group })[]) || []);

    // Load student_evaluations for all recent reports
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Teacher pace tracking
  const teacherPace = teachers.filter((t) => t.role === 'teacher').map((teacher) => {
    const teacherReports = recentReports.filter((r) => r.teacher_id === teacher.id);
    const onTime = teacherReports.filter((r) => r.pace === 'on_time').length;
    const delayed = teacherReports.filter((r) => r.pace === 'delayed').length;
    const faster = teacherReports.filter((r) => r.pace === 'faster').length;
    const total = teacherReports.length;
    return { teacher, onTime, delayed, faster, total };
  });

  // Group intelligence
  const groupIntelligence = groups.map((g) => {
    const groupStudents = students.filter((s) => s.group_id === g.id);
    return { group: g, studentCount: groupStudents.length };
  });

  // Exam alarms — within 14 days
  const today = new Date();
  const upcomingExams = exams
    .map((e) => {
      const days = Math.ceil((new Date(e.exam_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { ...e, daysUntil: days };
    })
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const urgentExams = upcomingExams.filter((e) => e.daysUntil <= 7);

  // Student progress analytics — average quiz percentage per group (normalized to each session's max score)
  const groupAnalytics = groups.map((g) => {
    const groupReportIds = recentReports.filter((r) => r.group_id === g.id).map((r) => r.id);
    const groupEvals = allEvaluations.filter((e) => groupReportIds.includes(e.session_report_id));
    const quizPcts = groupEvals
      .filter((e) => e.quiz_score !== null)
      .map((e) => {
        const max = (e as Evaluation & { quiz_max_score?: number }).quiz_max_score ?? 100;
        return Math.round(((e.quiz_score as number) / max) * 100);
      });
    const avgQuizPct = quizPcts.length > 0 ? Math.round(quizPcts.reduce((a, b) => a + b, 0) / quizPcts.length) : null;
    const committed = groupEvals.filter((e) => e.behavior === 'Committed').length;
    const disruptive = groupEvals.filter((e) => e.behavior === 'Disruptive').length;
    const goodHomework = groupEvals.filter((e) => e.homework === 'Done Well').length;
    const notDoneHomework = groupEvals.filter((e) => e.homework === 'Not Done').length;
    return { group: g, avgQuizPct, evalCount: groupEvals.length, committed, disruptive, goodHomework, notDoneHomework };
  });

  const maxAvgQuiz = 100;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of teacher performance, group analytics, and exam alerts</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Total Groups" value={groups.length} color="blue" />
        <StatCard icon={Users} label="Total Students" value={students.length} color="emerald" />
        <StatCard icon={Clock} label="Active Teachers" value={teachers.filter((t) => t.role === 'teacher').length} color="amber" />
        <StatCard icon={AlertTriangle} label="Urgent Exams" value={urgentExams.length} color="red" />
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
                    <p className="text-xs text-slate-500 mt-0.5">{exam.group?.name ?? 'Unknown group'}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    exam.daysUntil <= 3
                      ? 'bg-red-600 text-white'
                      : exam.daysUntil <= 7
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-500 text-white'
                  }`}>
                    {exam.daysUntil === 0 ? 'Today' : `${exam.daysUntil}d`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(exam.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                    <p className="text-sm font-medium text-slate-800 truncate">{teacher.display_name}</p>
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
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> On Time</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500" /> Delayed</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /> Faster</span>
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
                <div key={group.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{group.name}</p>
                    <p className="text-xs text-slate-400">{studentCount} students{group.level ? ` · ${group.level}` : ''}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    group.intelligence === 'strong'
                      ? 'bg-emerald-100 text-emerald-700'
                      : group.intelligence === 'weak'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {group.intelligence === 'strong' ? 'Strong' : group.intelligence === 'weak' ? 'Weak' : 'Unclassified'}
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
          <p className="text-sm text-slate-400 py-4 text-center">No evaluation data yet. Evaluations will appear here once teachers start logging sessions.</p>
        ) : (
          <div className="space-y-4">
            {groupAnalytics.filter((a) => a.evalCount > 0).map(({ group, avgQuizPct, evalCount, committed, disruptive, goodHomework, notDoneHomework }) => (
              <div key={group.id} className="border-b border-slate-100 pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                  <span className="text-xs text-slate-400">{evalCount} student_evaluations</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricBar label="Avg Quiz" value={avgQuizPct} max={100} suffix="%" color="bg-blue-500" />
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
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                      group.intelligence === 'strong'
                        ? 'bg-emerald-100 text-emerald-700'
                        : group.intelligence === 'weak'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {group.intelligence === 'strong' ? 'Strong Group' : group.intelligence === 'weak' ? 'Weak Group' : 'Unclassified'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: 'blue' | 'emerald' | 'amber' | 'red' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}

function MetricBar({ label, value, max, suffix, color }: { label: string; value: number | null; max: number; suffix?: string; color: string }) {
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
