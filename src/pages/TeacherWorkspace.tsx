import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Group, Student, SessionReport, Evaluation, CustomColumn } from '@/types';
import {
  ChevronDown,
  Plus,
  Save,
  Trash2,
  Loader2,
  ClipboardList,
  Calendar,
  AlertCircle,
  X,
  Send,
  Settings,
  Eraser,
  CheckCircle2,
  MessageSquare,
  ExternalLink,
  Users,
  Power,
  Hash,
  TrendingUp,
} from 'lucide-react';

const READING_OPTIONS = ['Good', 'Needs Practice', 'Needs Study More'];
const HOMEWORK_OPTIONS = ['Done Well', 'Careless', 'Not Done'];
const BEHAVIOR_OPTIONS = ['Committed', 'Disruptive'];

type BuiltinShareKey = 'quiz' | 'dictation' | 'reading' | 'homework' | 'behavior';
type FieldMode = 'alerts' | 'all';
type PaceStatus = 'on_time' | 'delayed' | 'faster';

interface GroupWithCourses extends Group {
  teacher_id?: string | null;
  course1_name?: string | null;
  course1_target?: number | null;
  course1_start_date?: string | null;
  course2_name?: string | null;
  course2_target?: number | null;
  course2_start_date?: string | null;
}

interface ExtendedSessionReport extends SessionReport {
  session_homework?: string | null;
  session_material?: string | null;
  course1_active?: boolean | null;
  course2_active?: boolean | null;
}

interface FieldShareConfig {
  enabled: boolean;
  mode: FieldMode;
}

interface ShareConfigState {
  quiz: FieldShareConfig;
  dictation: FieldShareConfig;
  reading: FieldShareConfig;
  homework: FieldShareConfig;
  behavior: FieldShareConfig;
  custom: Record<string, FieldShareConfig>;
}

const DEFAULT_FIELD_CONFIG: FieldShareConfig = {
  enabled: true,
  mode: 'alerts',
};

const DEFAULT_SHARE_CONFIG: ShareConfigState = {
  quiz: { ...DEFAULT_FIELD_CONFIG },
  dictation: { ...DEFAULT_FIELD_CONFIG },
  reading: { ...DEFAULT_FIELD_CONFIG },
  homework: { ...DEFAULT_FIELD_CONFIG },
  behavior: { ...DEFAULT_FIELD_CONFIG },
  custom: {},
};

function extractErrorMessage(err: unknown, fallback = 'Failed to save'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null) {
    const record = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [record.message, record.details, record.hint].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );
    if (parts.length > 0) return parts.join(' — ');
  }
  return fallback;
}

function isValidHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function computeCoursePaceAnalysis(params: {
  targetSessions: number;
  actualSessions: number;
  manualStartDate?: string | null;
  earliestSessionDate?: string | null;
  daysPerSession?: number;
}): {
  status: PaceStatus | 'not_started';
  effectiveStartDate: string | null;
  expectedSessions: number;
  diffSessions: number;
  label: string;
} {
  const {
    targetSessions,
    actualSessions,
    manualStartDate,
    earliestSessionDate,
    daysPerSession = 3.5,
  } = params;

  const effectiveStartDate = (manualStartDate && manualStartDate.trim()) || earliestSessionDate || null;

  if (!effectiveStartDate || actualSessions === 0) {
    return {
      status: 'not_started',
      effectiveStartDate,
      expectedSessions: 0,
      diffSessions: 0,
      label: 'Not Started',
    };
  }

  const startMs = new Date(effectiveStartDate).getTime();
  const nowMs = Date.now();
  const elapsedDays = Math.max(0, (nowMs - startMs) / (1000 * 60 * 60 * 24));
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
      diffSessions: Math.abs(diff),
      label: `Delayed (${Math.abs(diff)} behind)`,
    };
  }
  if (diff > 1) {
    return {
      status: 'faster',
      effectiveStartDate,
      expectedSessions,
      diffSessions: diff,
      label: `Faster (${diff} ahead)`,
    };
  }
  return {
    status: 'on_time',
    effectiveStartDate,
    expectedSessions,
    diffSessions: 0,
    label: 'On Time',
  };
}

function ColumnShareControls({
  config,
  onToggleEnabled,
  onToggleMode,
  label,
}: {
  config: FieldShareConfig;
  onToggleEnabled: () => void;
  onToggleMode: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap mt-1">
      <button
        type="button"
        onClick={onToggleEnabled}
        title={config.enabled ? `Exclude ${label} from WhatsApp` : `Include ${label} in WhatsApp`}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
          config.enabled
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200/70 line-through'
        }`}
      >
        <MessageSquare className="w-2.5 h-2.5" />
        <span>{config.enabled ? 'WA ON' : 'WA OFF'}</span>
      </button>

      {config.enabled && (
        <button
          type="button"
          onClick={onToggleMode}
          title={
            config.mode === 'all'
              ? `Showing all students for ${label} (click for alerts only)`
              : `Showing alerts only for ${label} (click for all students)`
          }
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
            config.mode === 'all'
              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Users className="w-2.5 h-2.5" />
          <span>{config.mode === 'all' ? 'All' : 'Alerts'}</span>
        </button>
      )}
    </div>
  );
}

export function TeacherWorkspace() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<GroupWithCourses[]>([]);
  const [teacherNamesMap, setTeacherNamesMap] = useState<Record<string, string>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [sessionReports, setSessionReports] = useState<ExtendedSessionReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ExtendedSessionReport | null>(null);

  const [sessionContent, setSessionContent] = useState('');
  const [sessionHomework, setSessionHomework] = useState('');
  const [sessionMaterial, setSessionMaterial] = useState('');

  // Course 1 & Course 2 states
  const [course1Name, setCourse1Name] = useState('');
  const [course1Target, setCourse1Target] = useState<number>(20);
  const [course1StartDate, setCourse1StartDate] = useState<string>('');
  const [course1Active, setCourse1Active] = useState<boolean>(false);

  const [course2Name, setCourse2Name] = useState('');
  const [course2Target, setCourse2Target] = useState<number>(20);
  const [course2StartDate, setCourse2StartDate] = useState<string>('');
  const [course2Active, setCourse2Active] = useState<boolean>(false);

  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [quizMaxScore, setQuizMaxScore] = useState(100);
  const [dictationMaxScore, setDictationMaxScore] = useState(10);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [shareConfig, setShareConfig] = useState<ShareConfigState>(DEFAULT_SHARE_CONFIG);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<CustomColumn['column_type']>('text');
  const [newColumnOptions, setNewColumnOptions] = useState('');

  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showWhatsappSettings, setShowWhatsappSettings] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadGroups = useCallback(async () => {
    if (!profile?.id) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let allowedGroupIds: string[] | null = null;
      const hasViewAllPermission = Boolean(profile.permissions?.view_all_groups);
      const shouldRestrictToAssignedGroups =
        profile.role === 'assistant' || (profile.role === 'sub_admin' && !hasViewAllPermission);

      if (shouldRestrictToAssignedGroups) {
        const { data: assignedRows, error: assignError } = await supabase
          .from('assistant_groups')
          .select('group_id')
          .eq('assistant_id', profile.id);
        if (assignError) throw assignError;

        allowedGroupIds = (assignedRows || []).map((row) => String(row.group_id));
        if (allowedGroupIds.length === 0) {
          setGroups([]);
          setLoading(false);
          return;
        }
      }

      let query = supabase.from('groups').select('*');
      if (profile.role === 'teacher') {
        query = query.eq('teacher_id', profile.id);
      } else if (allowedGroupIds !== null) {
        query = query.in('id', allowedGroupIds);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;

      const loadedGroups = (data as GroupWithCourses[]) || [];
      setGroups(loadedGroups);

      const teacherIds = Array.from(
        new Set(
          loadedGroups
            .map((g) => g.teacher_id)
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        )
      );

      if (teacherIds.length > 0) {
        const { data: teachersData } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', teacherIds);

        const nextMap: Record<string, string> = {};
        for (const t of teachersData || []) {
          if (t.id) {
            nextMap[String(t.id)] = t.display_name || 'Teacher';
          }
        }
        setTeacherNamesMap(nextMap);
      }
    } catch (err) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to load groups') });
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (profile?.id) {
      setWhatsappNumber(profile.whatsapp_number ?? '');
    }
  }, [profile]);

  // Sync course metadata from selected group
  useEffect(() => {
    const grp = groups.find((g) => g.id === selectedGroupId);
    if (!grp) {
      setCourse1Name('');
      setCourse1Target(20);
      setCourse1StartDate('');
      setCourse2Name('');
      setCourse2Target(20);
      setCourse2StartDate('');
      return;
    }
    setCourse1Name(grp.course1_name ?? '');
    setCourse1Target(grp.course1_target ?? 20);
    setCourse1StartDate(grp.course1_start_date ?? '');
    setCourse2Name(grp.course2_name ?? '');
    setCourse2Target(grp.course2_target ?? 20);
    setCourse2StartDate(grp.course2_start_date ?? '');
  }, [selectedGroupId, groups]);

  useEffect(() => {
    if (!selectedGroupId) {
      setStudents([]);
      setCustomColumns([]);
      setSessionReports([]);
      setSelectedReport(null);
      return;
    }

    supabase
      .from('students')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to load students') });
        } else {
          setStudents((data as Student[]) || []);
        }
      });

    supabase
      .from('custom_columns')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('created_at')
      .then(({ data }) => {
        const cols = (data as CustomColumn[]) || [];
        setCustomColumns(cols);
        setShareConfig((prev) => {
          const nextCustom: Record<string, FieldShareConfig> = {};
          for (const col of cols) {
            nextCustom[col.id] = prev.custom[col.id] ?? { ...DEFAULT_FIELD_CONFIG };
          }
          return { ...prev, custom: nextCustom };
        });
      });

    supabase
      .from('sessions')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('report_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to load sessions') });
        } else {
          setSessionReports((data as ExtendedSessionReport[]) || []);
        }
      });
  }, [selectedGroupId]);

  useEffect(() => {
    if (!selectedReport) {
      setEvaluations([]);
      return;
    }
    supabase
      .from('student_evaluations')
      .select('*')
      .eq('session_report_id', selectedReport.id)
      .then(({ data, error }) => {
        if (error) {
          setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to load evaluations') });
        } else {
          setEvaluations((data as Evaluation[]) || []);
        }
      });
  }, [selectedReport]);

  useEffect(() => {
    if (selectedReport) {
      setSessionContent(selectedReport.content ?? '');
      setSessionHomework(selectedReport.session_homework ?? '');
      setSessionMaterial(selectedReport.session_material ?? '');
      setCourse1Active(Boolean(selectedReport.course1_active));
      setCourse2Active(Boolean(selectedReport.course2_active));
      setReportDate(selectedReport.report_date);
      setQuizMaxScore(selectedReport.quiz_max_score ?? 100);
      setDictationMaxScore(selectedReport.dictation_max_score ?? 10);
    } else {
      setSessionContent('');
      setSessionHomework('');
      setSessionMaterial('');
      setCourse1Active(false);
      setCourse2Active(false);
      setReportDate(new Date().toISOString().split('T')[0]);
      setQuizMaxScore(100);
      setDictationMaxScore(10);
    }
  }, [selectedReport]);

  // Actual sessions count & automatic start dates from sessions
  const courseStats = useMemo(() => {
    const c1Sessions = sessionReports.filter((r) => Boolean(r.course1_active));
    const c2Sessions = sessionReports.filter((r) => Boolean(r.course2_active));

    const c1Dates = c1Sessions.map((r) => r.report_date).filter(Boolean).sort();
    const c2Dates = c2Sessions.map((r) => r.report_date).filter(Boolean).sort();

    const c1Actual = c1Sessions.length + (!selectedReport && course1Active ? 1 : 0);
    const c2Actual = c2Sessions.length + (!selectedReport && course2Active ? 1 : 0);

    const c1AutoStart = c1Dates[0] || (course1Active ? reportDate : null);
    const c2AutoStart = c2Dates[0] || (course2Active ? reportDate : null);

    const c1Analysis = computeCoursePaceAnalysis({
      targetSessions: course1Target,
      actualSessions: c1Actual,
      manualStartDate: course1StartDate || null,
      earliestSessionDate: c1AutoStart,
    });

    const c2Analysis = computeCoursePaceAnalysis({
      targetSessions: course2Target,
      actualSessions: c2Actual,
      manualStartDate: course2StartDate || null,
      earliestSessionDate: c2AutoStart,
    });

    return {
      c1Actual,
      c1AutoStart,
      c1Analysis,
      c2Actual,
      c2AutoStart,
      c2Analysis,
    };
  }, [
    sessionReports,
    selectedReport,
    course1Active,
    course2Active,
    course1Target,
    course2Target,
    course1StartDate,
    course2StartDate,
    reportDate,
  ]);

  const toggleBuiltinEnabled = (key: BuiltinShareKey) => {
    setShareConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const toggleBuiltinMode = (key: BuiltinShareKey) => {
    setShareConfig((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        mode: prev[key].mode === 'alerts' ? 'all' : 'alerts',
      },
    }));
  };

  const toggleCustomEnabled = (colId: string) => {
    setShareConfig((prev) => {
      const current = prev.custom[colId] ?? { ...DEFAULT_FIELD_CONFIG };
      return {
        ...prev,
        custom: {
          ...prev.custom,
          [colId]: { ...current, enabled: !current.enabled },
        },
      };
    });
  };

  const toggleCustomMode = (colId: string) => {
    setShareConfig((prev) => {
      const current = prev.custom[colId] ?? { ...DEFAULT_FIELD_CONFIG };
      return {
        ...prev,
        custom: {
          ...prev.custom,
          [colId]: { ...current, mode: current.mode === 'alerts' ? 'all' : 'alerts' },
        },
      };
    });
  };

  const handleSaveReport = async () => {
    if (!selectedGroupId) {
      setSaveMsg({ type: 'error', text: 'Please select a group first.' });
      return;
    }
    if (!profile?.id) {
      setSaveMsg({ type: 'error', text: 'User profile not found. Please sign in again.' });
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    try {
      const currentGroup = groups.find((g) => g.id === selectedGroupId);
      const effectiveTeacherId = currentGroup?.teacher_id || profile.id;

      const resolvedC1Start =
        course1StartDate.trim() ||
        courseStats.c1AutoStart ||
        (course1Active ? reportDate : null);
      const resolvedC2Start =
        course2StartDate.trim() ||
        courseStats.c2AutoStart ||
        (course2Active ? reportDate : null);

      const groupCoursePayload = {
        course1_name: course1Name.trim() || null,
        course1_target: Math.max(1, Number(course1Target) || 20),
        course1_start_date: resolvedC1Start || null,
        course2_name: course2Name.trim() || null,
        course2_target: Math.max(1, Number(course2Target) || 20),
        course2_start_date: resolvedC2Start || null,
      };

      const { error: groupUpdateErr } = await supabase
        .from('groups')
        .update(groupCoursePayload)
        .eq('id', selectedGroupId);
      if (groupUpdateErr) throw groupUpdateErr;

      setGroups((prev) =>
        prev.map((g) => (g.id === selectedGroupId ? { ...g, ...groupCoursePayload } : g))
      );

      // Derive overall session pace from active courses analysis for backward compatibility
      const activeStatuses = [
        course1Active ? courseStats.c1Analysis.status : null,
        course2Active ? courseStats.c2Analysis.status : null,
      ].filter((s): s is PaceStatus | 'not_started' => Boolean(s));

      const derivedPace: SessionReport['pace'] = activeStatuses.includes('delayed')
        ? 'delayed'
        : activeStatuses.includes('faster')
        ? 'faster'
        : 'on_time';

      let reportId: string;
      const sessionPayload = {
        content: sessionContent,
        session_homework: sessionHomework,
        session_material: sessionMaterial.trim(),
        course1_active: course1Active,
        course2_active: course2Active,
        pace: derivedPace,
        report_date: reportDate,
        quiz_max_score: quizMaxScore,
        dictation_max_score: dictationMaxScore,
      };

      if (selectedReport) {
        const { data, error } = await supabase
          .from('sessions')
          .update(sessionPayload)
          .eq('id', selectedReport.id)
          .select()
          .single();
        if (error) throw error;
        reportId = (data as ExtendedSessionReport).id;
        setSelectedReport(data as ExtendedSessionReport);
      } else {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            group_id: selectedGroupId,
            teacher_id: effectiveTeacherId,
            ...sessionPayload,
          })
          .select()
          .single();
        if (error) throw error;
        reportId = (data as ExtendedSessionReport).id;
        setSelectedReport(data as ExtendedSessionReport);
      }

      for (const student of students) {
        const existing = evaluations.find((e) => e.student_id === student.id);
        const payload = {
          session_report_id: reportId,
          student_id: student.id,
          quiz_score: existing?.quiz_score ?? null,
          dictation: existing?.dictation ?? null,
          reading: existing?.reading ?? null,
          homework: existing?.homework ?? null,
          behavior: existing?.behavior ?? 'Committed',
          custom_data: existing?.custom_data ?? {},
        };

        if (existing?.id) {
          const { error } = await supabase
            .from('student_evaluations')
            .update(payload)
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('student_evaluations')
            .insert(payload);
          if (error) throw error;
        }
      }

      const { data: reportsData, error: reportsErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('group_id', selectedGroupId)
        .order('report_date', { ascending: false });
      if (reportsErr) throw reportsErr;
      setSessionReports((reportsData as ExtendedSessionReport[]) || []);

      const { data: evalData, error: evalErr } = await supabase
        .from('student_evaluations')
        .select('*')
        .eq('session_report_id', reportId);
      if (evalErr) throw evalErr;
      setEvaluations((evalData as Evaluation[]) || []);

      setSaveMsg({ type: 'success', text: 'Session report & course progress saved successfully.' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to save') });
    } finally {
      setSaving(false);
    }
  };

  const handleNewReport = () => {
    setSelectedReport(null);
    setSessionContent('');
    setSessionHomework('');
    setSessionMaterial('');
    setCourse1Active(false);
    setCourse2Active(false);
    setReportDate(new Date().toISOString().split('T')[0]);
    setQuizMaxScore(100);
    setDictationMaxScore(10);
    setEvaluations([]);
  };

  const handleDeleteReport = async () => {
    if (!selectedReport || deleting) return;
    const confirmed = confirm(
      `Delete the session report from ${selectedReport.report_date}? This will permanently delete the report and all student evaluations linked to it.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setSaveMsg(null);
    try {
      const { error: evaluationsError } = await supabase
        .from('student_evaluations')
        .delete()
        .eq('session_report_id', selectedReport.id);
      if (evaluationsError) throw evaluationsError;

      const { error: reportError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', selectedReport.id);
      if (reportError) throw reportError;

      setSessionReports(sessionReports.filter((report) => report.id !== selectedReport.id));
      handleNewReport();
      setSaveMsg({ type: 'success', text: 'Session report deleted successfully.' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to delete session report') });
    } finally {
      setDeleting(false);
    }
  };

  const getOrCreateEval = (studentId: string): Evaluation => {
    const evalRow = evaluations.find((e) => e.student_id === studentId);
    if (evalRow) return evalRow;
    return {
      id: '',
      session_report_id: selectedReport?.id ?? '',
      student_id: studentId,
      quiz_score: null,
      dictation: null,
      reading: null,
      homework: null,
      behavior: 'Committed',
      custom_data: {},
      created_at: '',
    };
  };

  const updateEval = (studentId: string, field: keyof Evaluation, value: string | number | null) => {
    const existing = evaluations.find((e) => e.student_id === studentId);
    if (existing) {
      setEvaluations(
        evaluations.map((e) => (e.student_id === studentId ? { ...e, [field]: value } : e))
      );
    } else {
      const newEval: Evaluation = {
        id: '',
        session_report_id: selectedReport?.id ?? '',
        student_id: studentId,
        quiz_score: field === 'quiz_score' ? (value as number | null) : null,
        dictation: field === 'dictation' ? (value as number | null) : null,
        reading: field === 'reading' ? (value as string | null) : null,
        homework: field === 'homework' ? (value as string | null) : null,
        behavior: field === 'behavior' ? String(value ?? 'Committed') : 'Committed',
        custom_data: {},
        created_at: '',
      };
      setEvaluations([...evaluations, newEval]);
    }
  };

  const updateCustomField = (studentId: string, colId: string, value: string | number | null) => {
    const existing = evaluations.find((e) => e.student_id === studentId);
    if (existing) {
      setEvaluations(
        evaluations.map((e) =>
          e.student_id === studentId
            ? { ...e, custom_data: { ...e.custom_data, [colId]: value } }
            : e
        )
      );
    } else {
      setEvaluations([
        ...evaluations,
        {
          id: '',
          session_report_id: selectedReport?.id ?? '',
          student_id: studentId,
          quiz_score: null,
          dictation: null,
          reading: null,
          homework: null,
          behavior: 'Committed',
          custom_data: { [colId]: value },
          created_at: '',
        },
      ]);
    }
  };

  const handleAddCustomColumn = async () => {
    if (!selectedGroupId || !newColumnName.trim()) return;
    const options =
      newColumnType === 'dropdown'
        ? newColumnOptions.split(',').map((o) => o.trim()).filter(Boolean)
        : [];
    const { data, error } = await supabase
      .from('custom_columns')
      .insert({
        group_id: selectedGroupId,
        name: newColumnName.trim(),
        column_type: newColumnType,
        options,
      })
      .select()
      .single();
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to add column') });
      return;
    }
    const created = data as CustomColumn;
    setCustomColumns([...customColumns, created]);
    setShareConfig((prev) => ({
      ...prev,
      custom: { ...prev.custom, [created.id]: { ...DEFAULT_FIELD_CONFIG } },
    }));
    setShowAddColumn(false);
    setNewColumnName('');
    setNewColumnType('text');
    setNewColumnOptions('');
  };

  const handleDeleteCustomColumn = async (colId: string) => {
    const { error } = await supabase.from('custom_columns').delete().eq('id', colId);
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to delete column') });
      return;
    }
    setCustomColumns(customColumns.filter((c) => c.id !== colId));
    setShareConfig((prev) => {
      const nextCustom = { ...prev.custom };
      delete nextCustom[colId];
      return { ...prev, custom: nextCustom };
    });
    setEvaluations(
      evaluations.map((e) => {
        const newData = { ...e.custom_data };
        delete newData[colId];
        return { ...e, custom_data: newData };
      })
    );
  };

  const handleSaveWhatsappNumber = async () => {
    if (!profile?.id) return;
    setWhatsappSaving(true);
    setWhatsappMsg(null);
    const cleanedPhone = whatsappNumber.replace(/\D/g, '');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ whatsapp_number: cleanedPhone || null })
        .eq('id', profile.id);
      if (error) throw error;
      setWhatsappNumber(cleanedPhone);
      setWhatsappMsg({ type: 'success', text: 'WhatsApp number saved.' });
      setTimeout(() => {
        setWhatsappMsg(null);
        setShowWhatsappSettings(false);
      }, 1200);
    } catch (err) {
      setWhatsappMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to save WhatsApp number') });
    } finally {
      setWhatsappSaving(false);
    }
  };

  const formatBulletLines = (lines: string[]): string => lines.map((line) => `• ${line}`).join('\n');

  const handleSendWhatsapp = () => {
    if (!selectedReport) return;
    const selectedGroup = groups.find((g) => g.id === selectedGroupId);
    const groupName = selectedGroup?.name ?? 'Unknown Group';
    const teacherName =
      (selectedGroup?.teacher_id && teacherNamesMap[selectedGroup.teacher_id]) ||
      profile?.display_name ||
      'Teacher';

    const dateStr = new Date(selectedReport.report_date).toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const maxQuiz = quizMaxScore > 0 ? quizMaxScore : 100;
    const maxDictation = dictationMaxScore > 0 ? dictationMaxScore : 10;

    const sections: string[] = [];

    if (shareConfig.quiz.enabled) {
      if (shareConfig.quiz.mode === 'all') {
        const allQuizLines = students
          .map((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            if (ev?.quiz_score === null || ev?.quiz_score === undefined) return null;
            const score = Number(ev.quiz_score);
            if (Number.isNaN(score)) return null;
            return `${s.name} (${score}/${maxQuiz})`;
          })
          .filter((item): item is string => Boolean(item));

        if (allQuizLines.length > 0) {
          sections.push(`*نتائج الكويز (جميع الطلاب):*\n${formatBulletLines(allQuizLines)}`);
        }
      } else {
        const lowQuizNames = students
          .filter((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            if (ev?.quiz_score === null || ev?.quiz_score === undefined) return false;
            const score = Number(ev.quiz_score);
            if (Number.isNaN(score)) return false;
            return (score / maxQuiz) * 100 < 70;
          })
          .map((s) => s.name);

        if (lowQuizNames.length > 0) {
          sections.push(
            `*يحتاجون متابعة في الكويز (أقل من 70%):*\n${formatBulletLines(lowQuizNames)}`
          );
        }
      }
    }

    if (shareConfig.dictation.enabled) {
      if (shareConfig.dictation.mode === 'all') {
        const allDictationLines = students
          .map((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            if (ev?.dictation === null || ev?.dictation === undefined) return null;
            const score = Number(ev.dictation);
            if (Number.isNaN(score)) return null;
            return `${s.name} (${score}/${maxDictation})`;
          })
          .filter((item): item is string => Boolean(item));

        if (allDictationLines.length > 0) {
          sections.push(`*نتائج الإملاء (جميع الطلاب):*\n${formatBulletLines(allDictationLines)}`);
        }
      } else {
        const lowDictationNames = students
          .filter((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            if (ev?.dictation === null || ev?.dictation === undefined) return false;
            const score = Number(ev.dictation);
            if (Number.isNaN(score)) return false;
            return (score / maxDictation) * 100 < 70;
          })
          .map((s) => s.name);

        if (lowDictationNames.length > 0) {
          sections.push(
            `*يحتاجون متابعة في الإملاء (أقل من 70%):*\n${formatBulletLines(lowDictationNames)}`
          );
        }
      }
    }

    if (shareConfig.reading.enabled) {
      if (shareConfig.reading.mode === 'all') {
        const allReadingLines = students
          .map((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            if (!ev?.reading) return null;
            return `${s.name} (${ev.reading})`;
          })
          .filter((item): item is string => Boolean(item));

        if (allReadingLines.length > 0) {
          sections.push(`*القراءة (جميع الطلاب):*\n${formatBulletLines(allReadingLines)}`);
        }
      } else {
        const readingAlertNames = students
          .filter((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            return ev?.reading === 'Needs Practice' || ev?.reading === 'Needs Study More';
          })
          .map((s) => s.name);

        if (readingAlertNames.length > 0) {
          sections.push(`*متابعة القراءة:*\n${formatBulletLines(readingAlertNames)}`);
        }
      }
    }

    if (shareConfig.homework.enabled) {
      if (shareConfig.homework.mode === 'all') {
        const allHomeworkLines = students
          .map((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            if (!ev?.homework) return null;
            return `${s.name} (${ev.homework})`;
          })
          .filter((item): item is string => Boolean(item));

        if (allHomeworkLines.length > 0) {
          sections.push(`*الواجب (جميع الطلاب):*\n${formatBulletLines(allHomeworkLines)}`);
        }
      } else {
        const homeworkAlertNames = students
          .filter((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            return ev?.homework === 'Careless' || ev?.homework === 'Not Done';
          })
          .map((s) => s.name);

        if (homeworkAlertNames.length > 0) {
          sections.push(`*متابعة الواجب:*\n${formatBulletLines(homeworkAlertNames)}`);
        }
      }
    }

    if (shareConfig.behavior.enabled) {
      if (shareConfig.behavior.mode === 'all') {
        const allBehaviorLines = students.map((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          const beh = ev?.behavior || 'Committed';
          return `${s.name} (${beh})`;
        });

        if (allBehaviorLines.length > 0) {
          sections.push(`*السلوك (جميع الطلاب):*\n${formatBulletLines(allBehaviorLines)}`);
        }
      } else {
        const disruptiveNames = students
          .filter((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            return ev?.behavior === 'Disruptive';
          })
          .map((s) => s.name);

        if (disruptiveNames.length > 0) {
          sections.push(`*ملاحظات السلوك:*\n${formatBulletLines(disruptiveNames)}`);
        }
      }
    }

    for (const col of customColumns) {
      const cfg = shareConfig.custom[col.id] ?? { ...DEFAULT_FIELD_CONFIG };
      if (!cfg.enabled) continue;

      if (cfg.mode === 'all') {
        const allCustomLines = students
          .map((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            const val = ev?.custom_data?.[col.id];
            if (val === null || val === undefined || String(val).trim() === '') return null;
            return `${s.name} (${String(val).trim()})`;
          })
          .filter((item): item is string => Boolean(item));

        if (allCustomLines.length > 0) {
          sections.push(`*${col.name} (جميع الطلاب):*\n${formatBulletLines(allCustomLines)}`);
        }
      } else {
        const alertCustomNames = students
          .filter((s) => {
            const ev = evaluations.find((e) => e.student_id === s.id);
            const val = ev?.custom_data?.[col.id];
            return val !== null && val !== undefined && String(val).trim() !== '';
          })
          .map((s) => s.name);

        if (alertCustomNames.length > 0) {
          sections.push(`*${col.name}:*\n${formatBulletLines(alertCustomNames)}`);
        }
      }
    }

    const followUpSection =
      sections.length > 0 ? sections.join('\n\n') : 'لا توجد ملاحظات أو حالات متابعة خاصة لهذه الجلسة.';

    const topics = sessionContent.trim() || 'لم يتم تسجيل محتوى الجلسة بعد.';
    const homeworkText = sessionHomework.trim() || 'لا يوجد واجب مسجل لهذه الجلسة.';
    const materialLine = sessionMaterial.trim()
      ? `\n\u{1F3A5} *فيديو / مادة الجلسة:*\n${sessionMaterial.trim()}`
      : '';

    const activeCoursesLines: string[] = [];
    if (course1Active) {
      activeCoursesLines.push(
        `• ${course1Name.trim() || 'Course 1'} (${courseStats.c1Actual}/${course1Target} - ${courseStats.c1Analysis.label})`
      );
    }
    if (course2Active) {
      activeCoursesLines.push(
        `• ${course2Name.trim() || 'Course 2'} (${courseStats.c2Actual}/${course2Target} - ${courseStats.c2Analysis.label})`
      );
    }
    const coursesLine =
      activeCoursesLines.length > 0
        ? `\n\u{1F4C8} *الكورسات المنفذة في الجلسة:*\n${activeCoursesLines.join('\n')}`
        : '';

    const message =
`\u{1F4DA} *أكاديمية فالكونز - تقرير السيشن* \u{1F4DA}
\u{1F4C5} *التاريخ:* ${dateStr}
\u{1F465} *المجموعة:* ${groupName}
\u{1F468}\u200D\u{1F3EB} *المدرس:* ${teacherName}

\u{1F4DD} *محتوى الجلسة (Session Content):*
${topics}

\u{1F4D8} *واجب الجلسة (Session Homework):*
${homeworkText}${materialLine}${coursesLine}

\u26A0\uFE0F *متابعة وتنبيهات الطلاب:*
${followUpSection}

شكراً لمتابعتكم المستمرة معنا! \u{1F31F}`;

    const encoded = encodeURIComponent(message);
    const phone = whatsappNumber.replace(/\D/g, '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleAddStudent = async () => {
    if (!selectedGroupId) return;
    const name = prompt('Student name:');
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (trimmed.length > 80) {
      setSaveMsg({ type: 'error', text: 'Student name must be 80 characters or fewer.' });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    const { data, error } = await supabase
      .from('students')
      .insert({ name: trimmed, group_id: selectedGroupId })
      .select()
      .single();
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to add student') });
      return;
    }
    setStudents([...students, data as Student].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleCleanInvalidStudents = async () => {
    if (!selectedGroupId) return;
    const invalid = students.filter((s) => s.name.trim().length === 0 || s.name.length > 80);
    if (invalid.length === 0) {
      setSaveMsg({ type: 'success', text: 'No invalid student records found.' });
      setTimeout(() => setSaveMsg(null), 2500);
      return;
    }
    const ids = invalid.map((s) => s.id);
    const { error } = await supabase.from('students').delete().in('id', ids);
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to clean students') });
      return;
    }
    setStudents(students.filter((s) => !ids.includes(s.id)));
    setSaveMsg({ type: 'success', text: `Removed ${invalid.length} invalid record(s).` });
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const renderCourseRow = ({
    index,
    title,
    nameValue,
    onNameChange,
    targetValue,
    onTargetChange,
    actualCount,
    startDateValue,
    onStartDateChange,
    autoStartDate,
    isActive,
    onToggleActive,
    analysis,
  }: {
    index: 1 | 2;
    title: string;
    nameValue: string;
    onNameChange: (val: string) => void;
    targetValue: number;
    onTargetChange: (val: number) => void;
    actualCount: number;
    startDateValue: string;
    onStartDateChange: (val: string) => void;
    autoStartDate: string | null;
    isActive: boolean;
    onToggleActive: () => void;
    analysis: ReturnType<typeof computeCoursePaceAnalysis>;
  }) => {
    const badgeClass =
      analysis.status === 'delayed'
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : analysis.status === 'faster'
        ? 'bg-blue-100 text-blue-800 border-blue-200'
        : analysis.status === 'on_time'
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';

    return (
      <div
        className={`rounded-xl border p-3.5 transition-all ${
          isActive
            ? 'border-blue-300 bg-blue-50/40 shadow-xs'
            : 'border-slate-200 bg-slate-50/50'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Editable course input */}
          <div className="lg:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              {title} (Editable)
            </label>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`e.g. Course ${index} Name / Track...`}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>

          {/* Target counter + Actual counter */}
          <div className="lg:col-span-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Target Sessions
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={targetValue}
                  onChange={(e) => onTargetChange(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Actual Sessions
              </label>
              <div className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>{actualCount}</span>
                <Hash className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Start Date (manual or automatic from first session) */}
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Start Date {autoStartDate && !startDateValue ? `(Auto: ${autoStartDate})` : ''}
            </label>
            <input
              type="date"
              value={startDateValue || autoStartDate || ''}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:border-blue-500 outline-none"
            />
          </div>

          {/* ON / OFF toggle */}
          <div className="lg:col-span-2 flex lg:flex-col items-center lg:items-end justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 lg:hidden">Session Status</span>
            <button
              type="button"
              onClick={onToggleActive}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isActive ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* Live pace analysis badge */}
        <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">
            Expected by today: <strong className="text-slate-700">{analysis.expectedSessions}</strong> / {targetValue}
            {analysis.effectiveStartDate ? ` • Since ${analysis.effectiveStartDate}` : ''}
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border ${badgeClass}`}>
            <TrendingUp className="w-3 h-3" />
            {analysis.label}
          </span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teacher Workspace</h1>
          <p className="text-slate-500 text-sm mt-1">
            Record session reports, track courses &amp; pacing, and evaluate students
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedGroupId && (
            <button
              onClick={handleNewReport}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> New Session
            </button>
          )}
          <button
            onClick={() => setShowWhatsappSettings(true)}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" /> WhatsApp ({whatsappNumber || 'Not set'})
          </button>
          <button
            onClick={handleSaveReport}
            disabled={saving || !selectedGroupId}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Report
          </button>
        </div>
      </div>

      {saveMsg && (
        <div
          className={`mb-4 p-3.5 rounded-lg border text-sm flex items-center gap-2 ${
            saveMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {saveMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{saveMsg.text}</span>
        </div>
      )}

      {/* Group & Session selector */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
              Group
            </label>
            <div className="relative">
              <select
                value={selectedGroupId}
                onChange={(e) => {
                  setSelectedGroupId(e.target.value);
                  setSelectedReport(null);
                }}
                className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:border-blue-500 outline-none"
              >
                <option value="">Select a group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.level ? `(${g.level})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
              Session Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                disabled={!selectedGroupId}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:border-blue-500 outline-none disabled:bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
              Saved Sessions ({sessionReports.length})
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  value={selectedReport?.id ?? ''}
                  onChange={(e) => {
                    const found = sessionReports.find((r) => r.id === e.target.value) || null;
                    setSelectedReport(found);
                  }}
                  disabled={!selectedGroupId}
                  className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:border-blue-500 outline-none disabled:bg-slate-50"
                >
                  <option value="">-- New Session Report --</option>
                  {sessionReports.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.report_date} — {(rep.content || 'No topic').slice(0, 28)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {selectedReport && (
                <button
                  onClick={handleDeleteReport}
                  disabled={deleting}
                  className="p-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Delete selected session report"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!selectedGroupId ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No group selected</p>
          <p className="text-sm text-slate-400 mt-1">
            Select a group above to record a session report and evaluate students.
          </p>
        </div>
      ) : (
        <>
          {/* Session Notes & Two Courses Pacing Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Session Content / Topics
                </label>
                <textarea
                  rows={2}
                  value={sessionContent}
                  onChange={(e) => setSessionContent(e.target.value)}
                  placeholder="Topics covered in this session..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Session Homework
                </label>
                <textarea
                  rows={2}
                  value={sessionHomework}
                  onChange={(e) => setSessionHomework(e.target.value)}
                  placeholder="Assigned homework..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Session Material / Link
                </label>
                <input
                  type="text"
                  value={sessionMaterial}
                  onChange={(e) => setSessionMaterial(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Two stacked course rows (replaces On Time / Delayed / Faster buttons) */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Courses &amp; Session Pacing (Course 1 &amp; Course 2)
                </span>
                <span className="text-xs text-slate-400">
                  Toggle ON for Course 1, Course 2, or both in this session
                </span>
              </div>

              {renderCourseRow({
                index: 1,
                title: 'Row 1 • Course 1',
                nameValue: course1Name,
                onNameChange: setCourse1Name,
                targetValue: course1Target,
                onTargetChange: setCourse1Target,
                actualCount: courseStats.c1Actual,
                startDateValue: course1StartDate,
                onStartDateChange: setCourse1StartDate,
                autoStartDate: courseStats.c1AutoStart,
                isActive: course1Active,
                onToggleActive: () => setCourse1Active((prev) => !prev),
                analysis: courseStats.c1Analysis,
              })}

              {renderCourseRow({
                index: 2,
                title: 'Row 2 • Course 2',
                nameValue: course2Name,
                onNameChange: setCourse2Name,
                targetValue: course2Target,
                onTargetChange: setCourse2Target,
                actualCount: courseStats.c2Actual,
                startDateValue: course2StartDate,
                onStartDateChange: setCourse2StartDate,
                autoStartDate: courseStats.c2AutoStart,
                isActive: course2Active,
                onToggleActive: () => setCourse2Active((prev) => !prev),
                analysis: courseStats.c2Analysis,
              })}
            </div>

            {/* Max scores & WhatsApp share */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <label className="flex items-center gap-1.5 text-slate-600 font-medium">
                  Quiz Max:
                  <input
                    type="number"
                    min={1}
                    value={quizMaxScore}
                    onChange={(e) => setQuizMaxScore(Math.max(1, Number(e.target.value) || 100))}
                    className="w-16 px-2 py-1 rounded border border-slate-300 text-slate-800"
                  />
                </label>

                <label className="flex items-center gap-1.5 text-slate-600 font-medium">
                  Dictation Max:
                  <input
                    type="number"
                    min={1}
                    value={dictationMaxScore}
                    onChange={(e) => setDictationMaxScore(Math.max(1, Number(e.target.value) || 10))}
                    className="w-16 px-2 py-1 rounded border border-slate-300 text-slate-800"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowAddColumn(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Column
                </button>
                <button
                  type="button"
                  onClick={handleAddStudent}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Student
                </button>
                <button
                  type="button"
                  onClick={handleCleanInvalidStudents}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <Eraser className="w-3.5 h-3.5" /> Clean Invalid
                </button>
                {selectedReport && (
                  <button
                    type="button"
                    onClick={handleSendWhatsapp}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Share WhatsApp
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Students Evaluations Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4 min-w-[170px]">Student</th>
                    <th className="py-3 px-3 text-center min-w-[120px]">
                      <div>Quiz ({quizMaxScore})</div>
                      <ColumnShareControls
                        config={shareConfig.quiz}
                        onToggleEnabled={() => toggleBuiltinEnabled('quiz')}
                        onToggleMode={() => toggleBuiltinMode('quiz')}
                        label="Quiz"
                      />
                    </th>
                    <th className="py-3 px-3 text-center min-w-[120px]">
                      <div>Dictation ({dictationMaxScore})</div>
                      <ColumnShareControls
                        config={shareConfig.dictation}
                        onToggleEnabled={() => toggleBuiltinEnabled('dictation')}
                        onToggleMode={() => toggleBuiltinMode('dictation')}
                        label="Dictation"
                      />
                    </th>
                    <th className="py-3 px-3 text-center min-w-[145px]">
                      <div>Reading</div>
                      <ColumnShareControls
                        config={shareConfig.reading}
                        onToggleEnabled={() => toggleBuiltinEnabled('reading')}
                        onToggleMode={() => toggleBuiltinMode('reading')}
                        label="Reading"
                      />
                    </th>
                    <th className="py-3 px-3 text-center min-w-[145px]">
                      <div>Homework</div>
                      <ColumnShareControls
                        config={shareConfig.homework}
                        onToggleEnabled={() => toggleBuiltinEnabled('homework')}
                        onToggleMode={() => toggleBuiltinMode('homework')}
                        label="Homework"
                      />
                    </th>
                    <th className="py-3 px-3 text-center min-w-[135px]">
                      <div>Behavior</div>
                      <ColumnShareControls
                        config={shareConfig.behavior}
                        onToggleEnabled={() => toggleBuiltinEnabled('behavior')}
                        onToggleMode={() => toggleBuiltinMode('behavior')}
                        label="Behavior"
                      />
                    </th>
                    {customColumns.map((col) => (
                      <th key={col.id} className="py-3 px-3 text-center min-w-[145px]">
                        <div className="inline-flex items-center gap-1">
                          <span>{col.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomColumn(col.id)}
                            className="text-slate-400 hover:text-red-500"
                            title="Delete column"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <ColumnShareControls
                          config={shareConfig.custom[col.id] ?? { ...DEFAULT_FIELD_CONFIG }}
                          onToggleEnabled={() => toggleCustomEnabled(col.id)}
                          onToggleMode={() => toggleCustomMode(col.id)}
                          label={col.name}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6 + customColumns.length}
                        className="py-10 text-center text-slate-400"
                      >
                        No students in this group yet. Click &ldquo;Add Student&rdquo; above.
                      </td>
                    </tr>
                  ) : (
                    students.map((st) => {
                      const ev = getOrCreateEval(st.id);
                      return (
                        <tr key={st.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-medium text-slate-800">{st.name}</td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              value={ev.quiz_score ?? ''}
                              onChange={(e) =>
                                updateEval(
                                  st.id,
                                  'quiz_score',
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className="w-20 px-2 py-1.5 rounded border border-slate-300 text-center text-sm"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              value={ev.dictation ?? ''}
                              onChange={(e) =>
                                updateEval(
                                  st.id,
                                  'dictation',
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className="w-20 px-2 py-1.5 rounded border border-slate-300 text-center text-sm"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <select
                              value={ev.reading ?? ''}
                              onChange={(e) =>
                                updateEval(st.id, 'reading', e.target.value || null)
                              }
                              className="px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
                            >
                              <option value="">—</option>
                              {READING_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <select
                              value={ev.homework ?? ''}
                              onChange={(e) =>
                                updateEval(st.id, 'homework', e.target.value || null)
                              }
                              className="px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
                            >
                              <option value="">—</option>
                              {HOMEWORK_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <select
                              value={ev.behavior ?? 'Committed'}
                              onChange={(e) => updateEval(st.id, 'behavior', e.target.value)}
                              className="px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
                            >
                              {BEHAVIOR_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          {customColumns.map((col) => {
                            const val = ev.custom_data?.[col.id] ?? '';
                            return (
                              <td key={col.id} className="py-2.5 px-3 text-center">
                                {col.column_type === 'dropdown' ? (
                                  <select
                                    value={String(val)}
                                    onChange={(e) =>
                                      updateCustomField(st.id, col.id, e.target.value)
                                    }
                                    className="px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="">—</option>
                                    {(col.options || []).map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={col.column_type === 'number' ? 'number' : 'text'}
                                    value={String(val)}
                                    onChange={(e) =>
                                      updateCustomField(st.id, col.id, e.target.value)
                                    }
                                    className="w-28 px-2 py-1.5 rounded border border-slate-300 text-xs"
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Custom Column Modal */}
      {showAddColumn && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddColumn(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Add Custom Column</h3>
              <button onClick={() => setShowAddColumn(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Column Name</label>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="e.g. Participation"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={newColumnType}
                  onChange={(e) =>
                    setNewColumnType(e.target.value as CustomColumn['column_type'])
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="dropdown">Dropdown</option>
                </select>
              </div>

              {newColumnType === 'dropdown' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newColumnOptions}
                    onChange={(e) => setNewColumnOptions(e.target.value)}
                    placeholder="Yes, No, Partial"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddColumn(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomColumn}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Settings Modal */}
      {showWhatsappSettings && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowWhatsappSettings(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">WhatsApp Recipient Number</h3>
              <button onClick={() => setShowWhatsappSettings(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Enter international phone format without + or spaces (e.g. 2010xxxxxxxx). Leave empty to pick contact in WhatsApp.
            </p>

            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="201012345678"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm mb-3"
            />

            {sessionMaterial && isValidHttpUrl(sessionMaterial) && (
              <a
                href={sessionMaterial.trim()}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mb-3"
              >
                Preview material link <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {whatsappMsg && (
              <p
                className={`text-xs mb-3 ${
                  whatsappMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {whatsappMsg.text}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWhatsappSettings(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveWhatsappNumber}
                disabled={whatsappSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {whatsappSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
