import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

const READING_OPTIONS = ['Good', 'Needs Practice', 'Needs Study More'];
const HOMEWORK_OPTIONS = ['Done Well', 'Careless', 'Not Done'];
const BEHAVIOR_OPTIONS = ['Committed', 'Disruptive'];

type BuiltinShareKey = 'quiz' | 'dictation' | 'reading' | 'homework' | 'behavior';

interface ShareTogglesState {
  quiz: boolean;
  dictation: boolean;
  reading: boolean;
  homework: boolean;
  behavior: boolean;
  custom: Record<string, boolean>;
}

const DEFAULT_SHARE_TOGGLES: ShareTogglesState = {
  quiz: true,
  dictation: true,
  reading: true,
  homework: true,
  behavior: true,
  custom: {},
};

const PACE_OPTIONS: { value: SessionReport['pace']; label: string; color: string }[] = [
  { value: 'on_time', label: 'On Time', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'delayed', label: 'Delayed', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'faster', label: 'Faster', color: 'bg-blue-100 text-blue-700 border-blue-200' },
];

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

function ShareToggleButton({
  active,
  onToggle,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={active ? `Include ${label} in WhatsApp report` : `Exclude ${label} from WhatsApp report`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
        active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200/70 line-through'
      }`}
    >
      <MessageSquare className="w-2.5 h-2.5" />
      <span>{active ? 'WA ON' : 'WA OFF'}</span>
    </button>
  );
}

export function TeacherWorkspace() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [sessionReports, setSessionReports] = useState<SessionReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SessionReport | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [reportPace, setReportPace] = useState<SessionReport['pace']>('on_time');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [quizMaxScore, setQuizMaxScore] = useState(100);
  const [dictationMaxScore, setDictationMaxScore] = useState(10);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [shareToggles, setShareToggles] = useState<ShareTogglesState>(DEFAULT_SHARE_TOGGLES);

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

  const isTeacher = profile?.role === 'teacher';

  const loadGroups = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('groups').select('*');
    if (isTeacher && profile?.id) {
      query = query.eq('teacher_id', profile.id);
    }
    const { data, error } = await query.order('name');
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to load groups') });
    } else {
      setGroups((data as Group[]) || []);
    }
    setLoading(false);
  }, [isTeacher, profile]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (profile?.id) {
      setWhatsappNumber(profile.whatsapp_number ?? '');
    }
  }, [profile]);

  useEffect(() => {
    if (!selectedGroupId) {
      setStudents([]);
      setCustomColumns([]);
      setSessionReports([]);
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
        setShareToggles((prev) => {
          const nextCustom: Record<string, boolean> = {};
          for (const col of cols) {
            nextCustom[col.id] = prev.custom[col.id] ?? true;
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
          setSessionReports((data as SessionReport[]) || []);
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
      setReportContent(selectedReport.content);
      setReportPace(selectedReport.pace);
      setReportDate(selectedReport.report_date);
      setQuizMaxScore(selectedReport.quiz_max_score ?? 100);
      setDictationMaxScore(selectedReport.dictation_max_score ?? 10);
    } else {
      setReportContent('');
      setReportPace('on_time');
      setReportDate(new Date().toISOString().split('T')[0]);
      setQuizMaxScore(100);
      setDictationMaxScore(10);
    }
  }, [selectedReport]);

  const toggleBuiltinShare = (key: BuiltinShareKey) => {
    setShareToggles((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleCustomShare = (colId: string) => {
    setShareToggles((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        [colId]: !(prev.custom[colId] ?? true),
      },
    }));
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
      let reportId: string;

      if (selectedReport) {
        const { data, error } = await supabase
          .from('sessions')
          .update({
            content: reportContent,
            pace: reportPace,
            report_date: reportDate,
            quiz_max_score: quizMaxScore,
            dictation_max_score: dictationMaxScore,
          })
          .eq('id', selectedReport.id)
          .select()
          .single();
        if (error) throw error;
        reportId = (data as SessionReport).id;
        setSelectedReport(data as SessionReport);
      } else {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            group_id: selectedGroupId,
            teacher_id: profile.id,
            content: reportContent,
            pace: reportPace,
            report_date: reportDate,
            quiz_max_score: quizMaxScore,
            dictation_max_score: dictationMaxScore,
          })
          .select()
          .single();
        if (error) throw error;
        reportId = (data as SessionReport).id;
        setSelectedReport(data as SessionReport);
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
      setSessionReports((reportsData as SessionReport[]) || []);

      const { data: evalData, error: evalErr } = await supabase
        .from('student_evaluations')
        .select('*')
        .eq('session_report_id', reportId);
      if (evalErr) throw evalErr;
      setEvaluations((evalData as Evaluation[]) || []);

      setSaveMsg({ type: 'success', text: 'Session report saved successfully.' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to save') });
    } finally {
      setSaving(false);
    }
  };

  const handleNewReport = () => {
    setSelectedReport(null);
    setReportContent('');
    setReportPace('on_time');
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
    setShareToggles((prev) => ({
      ...prev,
      custom: { ...prev.custom, [created.id]: true },
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
    setShareToggles((prev) => {
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

  const formatNameList = (names: string[]): string => names.map((n) => `• ${n}`).join('\n');

  const handleSendWhatsapp = () => {
    if (!selectedReport) return;
    const group = groups.find((g) => g.id === selectedGroupId);
    const groupName = group?.name ?? 'Unknown Group';
    const teacherName = profile?.display_name ?? 'Teacher';
    const dateStr = new Date(selectedReport.report_date).toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const maxQuiz = quizMaxScore > 0 ? quizMaxScore : 100;
    const maxDictation = dictationMaxScore > 0 ? dictationMaxScore : 10;

    const sections: string[] = [];

    if (shareToggles.quiz) {
      const lowQuizStudents = students
        .filter((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          if (ev?.quiz_score === null || ev?.quiz_score === undefined) return false;
          const score = Number(ev.quiz_score);
          if (Number.isNaN(score)) return false;
          return (score / maxQuiz) * 100 < 70;
        })
        .map((s) => s.name);

      if (lowQuizStudents.length > 0) {
        sections.push(
          `*يحتاجون متابعة في الكويز (أقل من 70%):*\n${formatNameList(lowQuizStudents)}`
        );
      }
    }

    if (shareToggles.dictation) {
      const lowDictationStudents = students
        .filter((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          if (ev?.dictation === null || ev?.dictation === undefined) return false;
          const score = Number(ev.dictation);
          if (Number.isNaN(score)) return false;
          return (score / maxDictation) * 100 < 70;
        })
        .map((s) => s.name);

      if (lowDictationStudents.length > 0) {
        sections.push(
          `*يحتاجون متابعة في الإملاء (أقل من 70%):*\n${formatNameList(lowDictationStudents)}`
        );
      }
    }

    if (shareToggles.reading) {
      const readingNeedsAttention = students
        .filter((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          return ev?.reading === 'Needs Practice' || ev?.reading === 'Needs Study More';
        })
        .map((s) => s.name);

      if (readingNeedsAttention.length > 0) {
        sections.push(
          `*متابعة القراءة:*\n${formatNameList(readingNeedsAttention)}`
        );
      }
    }

    if (shareToggles.homework) {
      const homeworkNeedsAttention = students
        .filter((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          return ev?.homework === 'Careless' || ev?.homework === 'Not Done';
        })
        .map((s) => s.name);

      if (homeworkNeedsAttention.length > 0) {
        sections.push(
          `*متابعة الواجب:*\n${formatNameList(homeworkNeedsAttention)}`
        );
      }
    }

    if (shareToggles.behavior) {
      const disruptiveStudents = students
        .filter((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          return ev?.behavior === 'Disruptive';
        })
        .map((s) => s.name);

      if (disruptiveStudents.length > 0) {
        sections.push(
          `*ملاحظات السلوك:*\n${formatNameList(disruptiveStudents)}`
        );
      }
    }

    for (const col of customColumns) {
      const isEnabled = shareToggles.custom[col.id] ?? true;
      if (!isEnabled) continue;

      const flaggedStudents = students
        .filter((s) => {
          const ev = evaluations.find((e) => e.student_id === s.id);
          const val = ev?.custom_data?.[col.id];
          return val !== null && val !== undefined && String(val).trim() !== '';
        })
        .map((s) => s.name);

      if (flaggedStudents.length > 0) {
        sections.push(
          `*${col.name}:*\n${formatNameList(flaggedStudents)}`
        );
      }
    }

    const followUpSection =
      sections.length > 0 ? sections.join('\n\n') : 'لا توجد ملاحظات أو حالات متابعة خاصة لهذه الجلسة.';

    const topics = selectedReport.content?.trim() || 'لم يتم تسجيل الدروس لهذه الجلسة.';

    const message =
`\u{1F4DA} *أكاديمية فالكونز - تقرير السيشن* \u{1F4DA}
\u{1F4C5} *التاريخ:* ${dateStr}
\u{1F465} *المجموعة:* ${groupName}
\u{1F468}\u200D\u{1F3EB} *المدرس:* ${teacherName}
\u{1F4DD} *الدروس التي تم شرحها:*
${topics}
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
      setSaveMsg({ type: 'success', text: 'No invalid student entries found.' });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    if (!confirm(`Remove ${invalid.length} invalid/corrupted student entry(ies) from this group?`)) return;
    const ids = invalid.map((s) => s.id);
    const { error } = await supabase.from('students').delete().in('id', ids);
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to remove invalid entries') });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    setStudents(students.filter((s) => !ids.includes(s.id)));
    setSaveMsg({ type: 'success', text: `Removed ${invalid.length} invalid entry(ies).` });
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Remove this student?')) return;
    const { error } = await supabase.from('students').delete().eq('id', studentId);
    if (error) {
      setSaveMsg({ type: 'error', text: extractErrorMessage(error, 'Failed to delete student') });
      return;
    }
    setStudents(students.filter((s) => s.id !== studentId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-700">No groups assigned</p>
        <p className="text-sm mt-1">Contact an administrator to be assigned to a group.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Teacher Workspace</h1>
        <p className="text-slate-500 text-sm mt-1">Log session reports and evaluate student performance</p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Select Group</label>
        <div className="relative max-w-xs">
          <select
            value={selectedGroupId}
            onChange={(e) => {
              setSelectedGroupId(e.target.value);
              setSelectedReport(null);
            }}
            className="w-full appearance-none px-4 py-2.5 pr-10 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          >
            <option value="">Choose a group...</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}{g.level ? ` — ${g.level}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {selectedGroupId && (
        <>
          {sessionReports.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <button
                onClick={handleNewReport}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  !selectedReport
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                + New Report
              </button>
              {sessionReports.map((sr) => (
                <button
                  key={sr.id}
                  onClick={() => setSelectedReport(sr)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    selectedReport?.id === sr.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {sr.report_date}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Session Report</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-slate-500 font-medium">Quiz max:</label>
                  <input
                    type="number"
                    min={1}
                    value={quizMaxScore}
                    onChange={(e) => setQuizMaxScore(Math.max(1, Number(e.target.value) || 100))}
                    className="w-16 text-center px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-slate-500 font-medium">Dictation max:</label>
                  <input
                    type="number"
                    min={1}
                    value={dictationMaxScore}
                    onChange={(e) => setDictationMaxScore(Math.max(1, Number(e.target.value) || 10))}
                    className="w-16 text-center px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div className="flex gap-1">
                  {PACE_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setReportPace(p.value)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        reportPace === p.value
                          ? p.color
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <textarea
              value={reportContent}
              onChange={(e) => setReportContent(e.target.value)}
              placeholder="Log today's covered material, topics discussed, and notes..."
              className="w-full min-h-[100px] px-4 py-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-y"
            />

            <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {saveMsg && (
                  <span
                    className={`text-sm flex items-center gap-1.5 ${
                      saveMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {saveMsg.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {saveMsg.text}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setWhatsappMsg(null);
                    setShowWhatsappSettings(true);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                  title="WhatsApp settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                {selectedReport && (
                  <>
                    <button
                      onClick={handleSendWhatsapp}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                      Send to WhatsApp
                    </button>
                    <button
                      onClick={handleDeleteReport}
                      disabled={deleting}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                      title="Delete session report"
                      aria-label="Delete session report"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </>
                )}
                <button
                  onClick={handleSaveReport}
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all disabled:opacity-60 flex items-center gap-2 shadow-sm"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Session
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Student Evaluations</h2>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleAddStudent}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Student
                </button>
                <button
                  onClick={handleCleanInvalidStudents}
                  className="px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1.5"
                  title="Remove empty or overly long (over 80 char) student entries"
                >
                  <Eraser className="w-4 h-4" /> Clean Invalid Entries
                </button>
                <button
                  onClick={() => setShowAddColumn(true)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Custom Column
                </button>
              </div>
            </div>

            {students.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No students in this group yet. Click "Add Student" to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 min-w-[140px]">
                        Student
                      </th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[110px]">
                        <div className="flex flex-col items-center gap-1">
                          <div>
                            Quiz<span className="text-slate-400 font-normal">/{quizMaxScore}</span>
                          </div>
                          <ShareToggleButton
                            active={shareToggles.quiz}
                            onToggle={() => toggleBuiltinShare('quiz')}
                            label="Quiz"
                          />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[110px]">
                        <div className="flex flex-col items-center gap-1">
                          <div>
                            Dictation<span className="text-slate-400 font-normal">/{dictationMaxScore}</span>
                          </div>
                          <ShareToggleButton
                            active={shareToggles.dictation}
                            onToggle={() => toggleBuiltinShare('dictation')}
                            label="Dictation"
                          />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[140px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>Reading</span>
                          <ShareToggleButton
                            active={shareToggles.reading}
                            onToggle={() => toggleBuiltinShare('reading')}
                            label="Reading"
                          />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>Homework</span>
                          <ShareToggleButton
                            active={shareToggles.homework}
                            onToggle={() => toggleBuiltinShare('homework')}
                            label="Homework"
                          />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>Behavior</span>
                          <ShareToggleButton
                            active={shareToggles.behavior}
                            onToggle={() => toggleBuiltinShare('behavior')}
                            label="Behavior"
                          />
                        </div>
                      </th>
                      {customColumns.map((col) => (
                        <th
                          key={col.id}
                          className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[125px]"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center justify-center gap-1">
                              <span>{col.name}</span>
                              <button
                                onClick={() => handleDeleteCustomColumn(col.id)}
                                className="text-slate-300 hover:text-red-500"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <ShareToggleButton
                              active={shareToggles.custom[col.id] ?? true}
                              onToggle={() => toggleCustomShare(col.id)}
                              label={col.name}
                            />
                          </div>
                        </th>
                      ))}
                      <th className="px-2 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const evalRow = getOrCreateEval(student.id);
                      return (
                        <tr
                          key={student.id}
                          className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-slate-800 sticky left-0 bg-white z-10">
                            {student.name}
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={quizMaxScore}
                                value={evalRow.quiz_score ?? ''}
                                onChange={(e) =>
                                  updateEval(
                                    student.id,
                                    'quiz_score',
                                    e.target.value === '' ? null : Number(e.target.value)
                                  )
                                }
                                className="w-16 text-center px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                placeholder="—"
                              />
                              {evalRow.quiz_score !== null && (
                                <span className="text-[10px] text-slate-400">
                                  {Math.round((Number(evalRow.quiz_score) / quizMaxScore) * 100)}%
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={dictationMaxScore}
                                value={evalRow.dictation ?? ''}
                                onChange={(e) =>
                                  updateEval(
                                    student.id,
                                    'dictation',
                                    e.target.value === '' ? null : Number(e.target.value)
                                  )
                                }
                                className="w-16 text-center px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                placeholder="—"
                              />
                              {evalRow.dictation !== null && (
                                <span className="text-[10px] text-slate-400">
                                  {Math.round((Number(evalRow.dictation) / dictationMaxScore) * 100)}%
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <select
                              value={evalRow.reading ?? ''}
                              onChange={(e) =>
                                updateEval(student.id, 'reading', e.target.value || null)
                              }
                              className="px-2.5 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:border-blue-500 outline-none"
                            >
                              <option value="">—</option>
                              {READING_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <select
                              value={evalRow.homework ?? ''}
                              onChange={(e) =>
                                updateEval(student.id, 'homework', e.target.value || null)
                              }
                              className="px-2.5 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:border-blue-500 outline-none"
                            >
                              <option value="">—</option>
                              {HOMEWORK_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <select
                              value={evalRow.behavior ?? 'Committed'}
                              onChange={(e) => updateEval(student.id, 'behavior', e.target.value)}
                              className="px-2.5 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:border-blue-500 outline-none"
                            >
                              {BEHAVIOR_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>

                          {customColumns.map((col) => {
                            const val = evalRow.custom_data?.[col.id] ?? '';
                            if (col.column_type === 'dropdown') {
                              return (
                                <td key={col.id} className="px-3 py-3 text-center">
                                  <select
                                    value={String(val)}
                                    onChange={(e) =>
                                      updateCustomField(student.id, col.id, e.target.value || null)
                                    }
                                    className="px-2.5 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:border-blue-500 outline-none"
                                  >
                                    <option value="">—</option>
                                    {(col.options || []).map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }
                            return (
                              <td key={col.id} className="px-3 py-3 text-center">
                                <input
                                  type={col.column_type === 'number' ? 'number' : 'text'}
                                  value={String(val)}
                                  onChange={(e) =>
                                    updateCustomField(
                                      student.id,
                                      col.id,
                                      col.column_type === 'number'
                                        ? e.target.value === ''
                                          ? null
                                          : Number(e.target.value)
                                        : e.target.value
                                    )
                                  }
                                  className="w-24 text-center px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:border-blue-500 outline-none"
                                  placeholder="—"
                                />
                              </td>
                            );
                          })}

                          <td className="px-2 py-3 text-center">
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="p-1 text-slate-300 hover:text-red-600 rounded transition-colors"
                              title="Remove student"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showAddColumn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-lg border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Add Custom Column</h3>
              <button onClick={() => setShowAddColumn(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Column Name</label>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="e.g., Participation"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as CustomColumn['column_type'])}
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
                    placeholder="Excellent, Good, Needs Help"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddColumn(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomColumn}
                  className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWhatsappSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-lg border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">WhatsApp Number Settings</h3>
              <button
                onClick={() => setShowWhatsappSettings(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Phone number with country code (e.g., 2010xxxxxxxx)
                </label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="201012345678"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              {whatsappMsg && (
                <p
                  className={`text-xs ${
                    whatsappMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {whatsappMsg.text}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowWhatsappSettings(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveWhatsappNumber}
                  disabled={whatsappSaving}
                  className="px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
                >
                  {whatsappSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Number
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
