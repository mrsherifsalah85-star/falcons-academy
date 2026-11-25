import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Group, Student, Profile, Exam } from '@/types';
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Users,
  Loader2,
  Calendar,
  Brain,
  Upload,
  Download,
  ArrowRightLeft,
  FileSpreadsheet,
  Eraser,
} from 'lucide-react';

interface ParsedGroupRow {
  name: string;
  level: string;
  teacher_id: string | null;
  teacherLabel: string;
  intelligence: Group['intelligence'];
}

function normalizeIntelligence(raw: string): Group['intelligence'] {
  const val = raw.trim().toLowerCase();
  if (val === 'strong') return 'strong';
  if (val === 'weak') return 'weak';
  return 'unclassified';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function ManageGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [studentsByGroup, setStudentsByGroup] = useState<Record<string, Student[]>>({});
  const [examsByGroup, setExamsByGroup] = useState<Record<string, Exam[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Group modal & CSV tab state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupModalTab, setGroupModalTab] = useState<'single' | 'import'>('single');
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupLevel, setGroupLevel] = useState('');
  const [groupTeacher, setGroupTeacher] = useState('');
  const [groupIntelligence, setGroupIntelligence] = useState<Group['intelligence']>('unclassified');

  // Bulk groups CSV state
  const groupCsvInputRef = useRef<HTMLInputElement>(null);
  const [groupCsvFileName, setGroupCsvFileName] = useState('');
  const [parsedGroups, setParsedGroups] = useState<ParsedGroupRow[]>([]);
  const [groupImportError, setGroupImportError] = useState('');
  const [groupImportSummary, setGroupImportSummary] = useState('');
  const [importingGroups, setImportingGroups] = useState(false);

  // Students / Exams / Transfer / Student CSV Import state
  const [showExamModal, setShowExamModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [examGroup, setExamGroup] = useState<Group | null>(null);
  const [transferStudent, setTransferStudent] = useState<Student | null>(null);
  const [transferFromGroup, setTransferFromGroup] = useState<string>('');
  const [transferToGroup, setTransferToGroup] = useState<string>('');
  const [importGroup, setImportGroup] = useState<Group | null>(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEnrollmentDate, setNewStudentEnrollmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [examTitle, setExamTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examMaxScore, setExamMaxScore] = useState(100);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [groupsRes, teachersRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'teacher').order('display_name'),
    ]);
    setGroups((groupsRes.data as Group[]) || []);
    setTeachers((teachersRes.data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadStudents = async (groupId: string) => {
    const { data } = await supabase.from('students').select('*').eq('group_id', groupId).order('name');
    setStudentsByGroup((prev) => ({ ...prev, [groupId]: (data as Student[]) || [] }));
  };

  const loadExams = async (groupId: string) => {
    const { data } = await supabase.from('exams').select('*').eq('group_id', groupId).order('exam_date');
    setExamsByGroup((prev) => ({ ...prev, [groupId]: (data as Exam[]) || [] }));
  };

  const handleExpand = (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(groupId);
    if (!studentsByGroup[groupId]) loadStudents(groupId);
    if (!examsByGroup[groupId]) loadExams(groupId);
  };

  const resetGroupModal = () => {
    setShowGroupModal(false);
    setGroupModalTab('single');
    setEditingGroup(null);
    setGroupName('');
    setGroupLevel('');
    setGroupTeacher('');
    setGroupIntelligence('unclassified');
    setGroupCsvFileName('');
    setParsedGroups([]);
    setGroupImportError('');
    setGroupImportSummary('');
    if (groupCsvInputRef.current) groupCsvInputRef.current.value = '';
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) return;
    const payload = {
      name: groupName.trim(),
      level: groupLevel.trim(),
      teacher_id: groupTeacher || null,
      intelligence: groupIntelligence,
    };
    if (editingGroup) {
      const { data } = await supabase.from('groups').update(payload).eq('id', editingGroup.id).select().single();
      if (data) setGroups(groups.map((g) => (g.id === editingGroup.id ? (data as Group) : g)));
    } else {
      const { data } = await supabase.from('groups').insert(payload).select().single();
      if (data) setGroups([...groups, data as Group].sort((a, b) => a.name.localeCompare(b.name)));
    }
    resetGroupModal();
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupModalTab('single');
    setGroupName(group.name);
    setGroupLevel(group.level);
    setGroupTeacher(group.teacher_id ?? '');
    setGroupIntelligence(group.intelligence);
    setShowGroupModal(true);
  };

  const resolveTeacherId = (rawTeacher: string): { id: string | null; label: string } => {
    const query = rawTeacher.trim().toLowerCase();
    if (!query) return { id: null, label: 'No teacher' };

    const matched = teachers.find(
      (t) =>
        t.display_name.trim().toLowerCase() === query ||
        t.display_name.trim().toLowerCase().includes(query) ||
        t.email.trim().toLowerCase() === query
    );

    if (matched) {
      return { id: matched.id, label: matched.display_name };
    }
    return { id: null, label: `${rawTeacher.trim()} (unmatched)` };
  };

  const parseGroupsCsvText = (csvText: string): ParsedGroupRow[] => {
    const lines = csvText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (!lines.length) return [];

    const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
    const matrix = lines.map((line) => splitCsvLine(line, delimiter));

    const firstRow = matrix[0].map((c) => c.toLowerCase());
    const hasHeader = firstRow.some(
      (h) => h.includes('name') || h.includes('group') || h.includes('level') || h.includes('teacher') || h.includes('intel')
    );

    let nameIdx = 0;
    let levelIdx = 1;
    let teacherIdx = 2;
    let intelIdx = 3;

    if (hasHeader) {
      const n = firstRow.findIndex((h) => h.includes('name') || h.includes('group'));
      const l = firstRow.findIndex((h) => h.includes('level'));
      const t = firstRow.findIndex((h) => h.includes('teacher') || h.includes('instructor'));
      const i = firstRow.findIndex((h) => h.includes('intel') || h.includes('strength'));
      nameIdx = n >= 0 ? n : 0;
      levelIdx = l >= 0 ? l : 1;
      teacherIdx = t >= 0 ? t : 2;
      intelIdx = i >= 0 ? i : 3;
    }

    const dataRows = hasHeader ? matrix.slice(1) : matrix;
    const seenNames = new Set<string>();
    const result: ParsedGroupRow[] = [];

    for (const row of dataRows) {
      const name = (row[nameIdx] ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      const level = (row[levelIdx] ?? '').trim();
      const teacherInfo = resolveTeacherId(row[teacherIdx] ?? '');
      const intelligence = normalizeIntelligence(row[intelIdx] ?? '');

      result.push({
        name,
        level,
        teacher_id: teacherInfo.id,
        teacherLabel: teacherInfo.label,
        intelligence,
      });
    }

    return result;
  };

  const handleGroupCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setGroupImportError('');
    setGroupImportSummary('');
    if (!file) {
      setGroupCsvFileName('');
      setParsedGroups([]);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParsedGroups([]);
      setGroupImportError('Please upload a .csv file.');
      return;
    }

    setGroupCsvFileName(file.name);
    const text = await file.text();
    const rows = parseGroupsCsvText(text);
    if (rows.length === 0) {
      setParsedGroups([]);
      setGroupImportError('No valid group rows found in the CSV file.');
      return;
    }
    setParsedGroups(rows);
  };

  const handleDownloadGroupsTemplate = () => {
    const sample = [
      'name,level,teacher,intelligence',
      'Intermediate A,B1 Intermediate,Ms Eman Khedr,strong',
      'Foundation 1,A1 Beginner,Ms Mona Arafa,unclassified',
      'Advanced B,B2 Upper-Intermediate,,weak',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'falcons-groups-template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportGroups = async () => {
    if (parsedGroups.length === 0) return;
    setImportingGroups(true);
    setGroupImportError('');
    setGroupImportSummary('');

    try {
      const existingNames = new Set(groups.map((g) => g.name.trim().toLowerCase()));
      const newRows = parsedGroups.filter((r) => !existingNames.has(r.name.toLowerCase()));
      const skipped = parsedGroups.length - newRows.length;

      if (newRows.length === 0) {
        setGroupImportError('All groups in this CSV already exist.');
        setImportingGroups(false);
        return;
      }

      const payload = newRows.map((r) => ({
        name: r.name,
        level: r.level,
        teacher_id: r.teacher_id,
        intelligence: r.intelligence,
      }));

      const { data, error } = await supabase.from('groups').insert(payload).select();
      if (error) throw error;

      const inserted = (data as Group[]) || [];
      setGroups((prev) => [...prev, ...inserted].sort((a, b) => a.name.localeCompare(b.name)));
      setGroupImportSummary(
        `Created ${inserted.length} group(s)${skipped > 0 ? ` (${skipped} duplicate name(s) skipped)` : ''}.`
      );
      setTimeout(() => {
        resetGroupModal();
      }, 1200);
    } catch (err) {
      setGroupImportError(err instanceof Error ? err.message : 'Failed to import groups');
    } finally {
      setImportingGroups(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Delete this group and all its students and reports?')) return;
    await supabase.from('groups').delete().eq('id', groupId);
    setGroups(groups.filter((g) => g.id !== groupId));
  };

  const handleAddStudent = async (groupId: string) => {
    const name = newStudentName.trim();
    if (!name) return;
    if (name.length > 80) {
      alert('Student name must be 80 characters or fewer.');
      return;
    }
    const { data } = await supabase
      .from('students')
      .insert({ name, group_id: groupId, enrollment_date: newStudentEnrollmentDate })
      .select()
      .single();
    if (data) {
      const updated = [...(studentsByGroup[groupId] || []), data as Student].sort((a, b) => a.name.localeCompare(b.name));
      setStudentsByGroup({ ...studentsByGroup, [groupId]: updated });
      setNewStudentName('');
      setNewStudentEnrollmentDate(new Date().toISOString().split('T')[0]);
    }
  };

  const handleCleanInvalidStudents = async (groupId: string) => {
    const list = studentsByGroup[groupId] || [];
    const invalid = list.filter((s) => s.name.trim().length === 0 || s.name.length > 80);
    if (invalid.length === 0) {
      alert('No invalid student entries found in this group.');
      return;
    }
    if (!confirm(`Remove ${invalid.length} invalid/corrupted student entry(ies) from this group?`)) return;
    const ids = invalid.map((s) => s.id);
    const { error } = await supabase.from('students').delete().in('id', ids);
    if (error) {
      alert(error.message);
      return;
    }
    setStudentsByGroup({
      ...studentsByGroup,
      [groupId]: list.filter((s) => !ids.includes(s.id)),
    });
  };

  const handleDeleteStudent = async (groupId: string, studentId: string) => {
    await supabase.from('students').delete().eq('id', studentId);
    setStudentsByGroup({
      ...studentsByGroup,
      [groupId]: (studentsByGroup[groupId] || []).filter((s) => s.id !== studentId),
    });
  };

  const handleTransferStudent = async () => {
    if (!transferStudent || !transferToGroup) return;
    const { error } = await supabase
      .from('students')
      .update({ group_id: transferToGroup })
      .eq('id', transferStudent.id);
    if (error) return;
    setStudentsByGroup((prev) => ({
      ...prev,
      [transferFromGroup]: (prev[transferFromGroup] || []).filter((s) => s.id !== transferStudent.id),
    }));
    setStudentsByGroup((prev) => {
      const newList = [...(prev[transferToGroup] || []), { ...transferStudent, group_id: transferToGroup }]
        .sort((a, b) => a.name.localeCompare(b.name));
      return { ...prev, [transferToGroup]: newList };
    });
    setShowTransferModal(false);
    setTransferStudent(null);
    setTransferToGroup('');
  };

  const openTransferModal = (student: Student, fromGroupId: string) => {
    setTransferStudent(student);
    setTransferFromGroup(fromGroupId);
    setTransferToGroup('');
    setShowTransferModal(true);
  };

  const downloadTemplate = () => {
    const csv = 'Name,Enrollment Date\nJohn Doe,2026-01-15\nJane Smith,2026-02-01\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImportText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importGroup || !importText.trim()) return;
    setImporting(true);
    setImportMsg(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const lines = importText.split(/\r?\n/);
      const headerKeywords = new Set(['name', 'student name', 'enrollment date', 'date']);
      const firstColumn = lines[0]?.split(',')[0]?.trim().toLowerCase() || '';
      const dataLines = headerKeywords.has(firstColumn) ? lines.slice(1) : lines;
      const isValidDate = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
      };

      const existingNames = new Set(
        (studentsByGroup[importGroup.id] || []).map((s) => s.name.trim().toLowerCase())
      );

      const rows: { name: string; enrollment_date: string }[] = [];
      let skipped = 0;
      let ignored = 0;

      for (const line of dataLines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (trimmedLine.length > 80) {
          ignored++;
          continue;
        }
        const [rawName, rawDate] = trimmedLine.split(',', 2);
        const name = rawName?.trim() || '';
        if (!name) {
          ignored++;
          continue;
        }
        const enrollmentDate = rawDate?.trim() && isValidDate(rawDate.trim()) ? rawDate.trim() : today;
        if (existingNames.has(name.toLowerCase())) {
          skipped++;
          continue;
        }
        existingNames.add(name.toLowerCase());
        rows.push({ name, enrollment_date: enrollmentDate });
      }

      if (rows.length === 0) {
        const parts = [`No new students to import.`];
        if (skipped > 0) parts.push(`${skipped} duplicate(s) skipped.`);
        if (ignored > 0) parts.push(`${ignored} invalid line(s) ignored (over 80 chars or empty).`);
        setImportMsg({ type: 'error', text: parts.join(' ') });
        setImporting(false);
        return;
      }

      const insertRows = rows.map((r) => ({
        name: r.name,
        group_id: importGroup.id,
        enrollment_date: r.enrollment_date,
      }));

      const { data, error } = await supabase.from('students').insert(insertRows).select();
      if (error) throw error;

      const updated = [...(studentsByGroup[importGroup.id] || []), ...(data as Student[])].sort((a, b) => a.name.localeCompare(b.name));
      setStudentsByGroup({ ...studentsByGroup, [importGroup.id]: updated });

      setImportMsg({
        type: 'success',
        text: `Imported ${rows.length} student(s)${skipped > 0 ? `, ${skipped} duplicate(s) skipped` : ''}${ignored > 0 ? `, ${ignored} invalid line(s) ignored` : ''}.`,
      });
      setImportText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setImportMsg({ type: 'error', text: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleAddExam = async () => {
    if (!examGroup || !examTitle.trim() || !examDate) return;
    const { data } = await supabase
      .from('exams')
      .insert({ group_id: examGroup.id, title: examTitle.trim(), exam_date: examDate, max_score: examMaxScore })
      .select()
      .single();
    if (data) {
      const updated = [...(examsByGroup[examGroup.id] || []), data as Exam].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
      setExamsByGroup({ ...examsByGroup, [examGroup.id]: updated });
      setExamTitle('');
      setExamDate('');
      setExamMaxScore(100);
      setShowExamModal(false);
    }
  };

  const handleDeleteExam = async (groupId: string, examId: string) => {
    await supabase.from('exams').delete().eq('id', examId);
    setExamsByGroup({
      ...examsByGroup,
      [groupId]: (examsByGroup[groupId] || []).filter((e) => e.id !== examId),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Groups & Students</h1>
          <p className="text-slate-500 text-sm mt-1">Manage groups, assign teachers, and add students</p>
        </div>
        <button
          onClick={() => {
            setEditingGroup(null);
            setGroupModalTab('single');
            setShowGroupModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-700">No groups yet</p>
          <p className="text-sm text-slate-400 mt-1">Create your first group to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const teacher = teachers.find((t) => t.id === group.teacher_id);
            const isExpanded = expandedGroup === group.id;
            return (
              <div key={group.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleExpand(group.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      group.intelligence === 'strong' ? 'bg-emerald-100 text-emerald-600'
                      : group.intelligence === 'weak' ? 'bg-red-100 text-red-600'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{group.name}</p>
                      <p className="text-xs text-slate-400">
                        {group.level || 'No level'} · {teacher?.display_name ?? 'No teacher assigned'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      group.intelligence === 'strong' ? 'bg-emerald-100 text-emerald-700'
                      : group.intelligence === 'weak' ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      {group.intelligence === 'strong' ? 'Strong' : group.intelligence === 'weak' ? 'Weak' : 'Unclassified'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                    {/* Students */}
                    <div className="mb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                        <h4 className="text-sm font-semibold text-slate-700">Students</h4>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => { setImportGroup(group); setShowImportModal(true); setImportMsg(null); setImportText(''); }}
                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 flex items-center gap-1.5 transition-all"
                          >
                            <Upload className="w-3.5 h-3.5" /> Import CSV
                          </button>
                          <button
                            onClick={() => handleCleanInvalidStudents(group.id)}
                            className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5 transition-all"
                            title="Remove empty or overly long (over 80 char) student entries"
                          >
                            <Eraser className="w-3.5 h-3.5" /> Clean Invalid
                          </button>
                          <input
                            type="text"
                            value={newStudentName}
                            onChange={(e) => setNewStudentName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddStudent(group.id)}
                            placeholder="Student name..."
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm w-36 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          />
                          <input
                            type="date"
                            value={newStudentEnrollmentDate}
                            onChange={(e) => setNewStudentEnrollmentDate(e.target.value)}
                            className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          />
                          <button
                            onClick={() => handleAddStudent(group.id)}
                            className="px-2.5 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {(studentsByGroup[group.id] || []).length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">No students yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {(studentsByGroup[group.id] || []).map((student) => (
                            <div key={student.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{student.name}</p>
                                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Enrolled {new Date(student.enrollment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => openTransferModal(student, group.id)}
                                  className="text-slate-400 hover:text-blue-600 p-1"
                                  title="Transfer to another group"
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStudent(group.id, student.id)}
                                  className="text-slate-300 hover:text-red-500 p-1"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Exams */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" /> Scheduled Exams
                        </h4>
                        <button
                          onClick={() => { setExamGroup(group); setShowExamModal(true); }}
                          className="px-2.5 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Exam
                        </button>
                      </div>
                      {(examsByGroup[group.id] || []).length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">No exams scheduled.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(examsByGroup[group.id] || []).map((exam) => (
                            <div key={exam.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                <span className="text-sm text-slate-700">{exam.title}</span>
                                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                  /{exam.max_score}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  {new Date(exam.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <button
                                  onClick={() => handleDeleteExam(group.id, exam.id)}
                                  className="text-slate-300 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Group Modal (Single Group + Import CSV) */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={resetGroupModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingGroup ? 'Edit Group' : 'New Group'}
              </h3>
              <button onClick={resetGroupModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingGroup && (
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setGroupModalTab('single');
                    setGroupImportError('');
                    setGroupImportSummary('');
                  }}
                  className={`py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    groupModalTab === 'single'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Single Group
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGroupModalTab('import');
                    setGroupImportError('');
                    setGroupImportSummary('');
                  }}
                  className={`py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    groupModalTab === 'import'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Import CSV
                </button>
              </div>
            )}

            {!editingGroup && groupModalTab === 'import' ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Upload Groups CSV (.csv)</span>
                    <button
                      type="button"
                      onClick={handleDownloadGroupsTemplate}
                      className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Sample CSV
                    </button>
                  </div>
                  <p className="text-blue-800/90">
                    Columns: <span className="font-mono">name</span>, <span className="font-mono">level</span>, <span className="font-mono">teacher</span> (name or email), <span className="font-mono">intelligence</span> (<span className="font-mono">strong</span>, <span className="font-mono">weak</span>, or <span className="font-mono">unclassified</span>).
                  </p>
                </div>

                <div>
                  <input
                    ref={groupCsvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleGroupCsvFileChange}
                    className="hidden"
                    id="groups-csv-upload"
                  />
                  <label
                    htmlFor="groups-csv-upload"
                    className="w-full border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-slate-50/60"
                  >
                    <Upload className="w-6 h-6 text-blue-600" />
                    <span className="text-sm font-medium text-slate-700">
                      {groupCsvFileName || 'Choose CSV file'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Click to select .csv file with group rows
                    </span>
                  </label>
                </div>

                {parsedGroups.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 border-b border-slate-200 flex items-center justify-between">
                      <span>Ready to create: {parsedGroups.length} group(s)</span>
                      <span className="text-slate-400">Preview</span>
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {parsedGroups.map((row) => (
                        <div key={row.name} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{row.name}</p>
                            <p className="text-slate-400 truncate">
                              {row.level || 'No level'} · {row.teacherLabel}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium shrink-0">
                            {row.intelligence}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {groupImportSummary && (
                  <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                    {groupImportSummary}
                  </div>
                )}

                {groupImportError && (
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 border border-red-200">
                    {groupImportError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetGroupModal}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImportGroups}
                    disabled={importingGroups || parsedGroups.length === 0}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {importingGroups && <Loader2 className="w-4 h-4 animate-spin" />}
                    Import ({parsedGroups.length})
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="e.g. Intermediate A"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Level</label>
                    <input
                      type="text"
                      value={groupLevel}
                      onChange={(e) => setGroupLevel(e.target.value)}
                      placeholder="e.g. B1 Intermediate"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Teacher</label>
                    <select
                      value={groupTeacher}
                      onChange={(e) => setGroupTeacher(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      <option value="">No teacher</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Group Intelligence</label>
                    <div className="flex gap-2">
                      {(['unclassified', 'strong', 'weak'] as const).map((intel) => (
                        <button
                          key={intel}
                          type="button"
                          onClick={() => setGroupIntelligence(intel)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-1.5 ${
                            groupIntelligence === intel
                              ? intel === 'strong'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : intel === 'weak'
                                ? 'bg-red-50 border-red-300 text-red-700'
                                : 'bg-slate-100 border-slate-300 text-slate-700'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <Brain className="w-3.5 h-3.5" />
                          {intel === 'strong' ? 'Strong' : intel === 'weak' ? 'Weak' : 'N/A'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={resetGroupModal}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveGroup}
                    disabled={!groupName.trim()}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    {editingGroup ? 'Save' : 'Create'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Exam Modal */}
      {showExamModal && examGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowExamModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Schedule Exam</h3>
            <p className="text-sm text-slate-400 mb-4">{examGroup.name}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exam Title</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="e.g. Mid-term Exam"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Exam Date</label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Score</label>
                  <input
                    type="number"
                    min={1}
                    value={examMaxScore}
                    onChange={(e) => setExamMaxScore(Math.max(1, Number(e.target.value) || 100))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowExamModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddExam}
                disabled={!examTitle.trim() || !examDate}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && transferStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTransferModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              Transfer Student
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Move <span className="font-medium text-slate-700">{transferStudent.name}</span> to another group.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Destination Group</label>
              <select
                value={transferToGroup}
                onChange={(e) => setTransferToGroup(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                <option value="">Select target group...</option>
                {groups
                  .filter((g) => g.id !== transferFromGroup)
                  .map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferStudent}
                disabled={!transferToGroup}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Students CSV Import Modal */}
      {showImportModal && importGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-slate-900">Import Students CSV</h3>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Template
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">{importGroup.name}</p>

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <textarea
                rows={5}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'Name,Enrollment Date\nAhmed Ali,2026-09-01'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              />

              {importMsg && (
                <div
                  className={`text-xs rounded-lg p-3 border ${
                    importMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-600 border-red-200'
                  }`}
                >
                  {importMsg.text}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                Import Students
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
