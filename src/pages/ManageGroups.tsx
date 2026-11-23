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

export function ManageGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [studentsByGroup, setStudentsByGroup] = useState<Record<string, Student[]>>({});
  const [examsByGroup, setExamsByGroup] = useState<Record<string, Exam[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [examGroup, setExamGroup] = useState<Group | null>(null);
  const [transferStudent, setTransferStudent] = useState<Student | null>(null);
  const [transferFromGroup, setTransferFromGroup] = useState<string>('');
  const [transferToGroup, setTransferToGroup] = useState<string>('');
  const [importGroup, setImportGroup] = useState<Group | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupLevel, setGroupLevel] = useState('');
  const [groupTeacher, setGroupTeacher] = useState('');
  const [groupIntelligence, setGroupIntelligence] = useState<Group['intelligence']>('unclassified');
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
      if (data) setGroups(groups.map((g) => (g.id === editingGroup.id ? data as Group : g)));
    } else {
      const { data } = await supabase.from('groups').insert(payload).select().single();
      if (data) setGroups([...groups, data as Group].sort((a, b) => a.name.localeCompare(b.name)));
    }
    resetGroupModal();
  };

  const resetGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
    setGroupName('');
    setGroupLevel('');
    setGroupTeacher('');
    setGroupIntelligence('unclassified');
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupLevel(group.level);
    setGroupTeacher(group.teacher_id ?? '');
    setGroupIntelligence(group.intelligence);
    setShowGroupModal(true);
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
    // Remove from old group list
    setStudentsByGroup((prev) => ({
      ...prev,
      [transferFromGroup]: (prev[transferFromGroup] || []).filter((s) => s.id !== transferStudent.id),
    }));
    // Add to new group list if it's loaded
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
          onClick={() => setShowGroupModal(true)}
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

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={resetGroupModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingGroup ? 'Edit Group' : 'New Group'}
            </h3>
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
                onClick={resetGroupModal}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGroup}
                disabled={!groupName.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {editingGroup ? 'Save' : 'Create'}
              </button>
            </div>
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
              All historical session reports, grades, and analytics remain linked to this student.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Transfer to</label>
              <select
                value={transferToGroup}
                onChange={(e) => setTransferToGroup(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                <option value="">Select a group...</option>
                {groups.filter((g) => g.id !== transferFromGroup).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}{g.level ? ` — ${g.level}` : ''}</option>
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

      {/* Import Modal */}
      {showImportModal && importGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Import Students from CSV
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Bulk import student names into <span className="font-medium text-slate-700">{importGroup.name}</span>.
              Duplicates are automatically skipped.
            </p>

            <button
              onClick={downloadTemplate}
              className="w-full mb-4 px-4 py-2.5 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              Download Sample Template
            </button>

            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Upload CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium file:cursor-pointer hover:file:bg-blue-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Or paste names here</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'Name,Enrollment Date\nJohn Doe,2026-01-15\nJane Smith,2026-02-01'}
                className="w-full min-h-[120px] px-3 py-2.5 rounded-lg border border-slate-300 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-y"
              />
              <p className="text-xs text-slate-400 mt-1">Format: Name, Enrollment Date (optional). One per line.</p>
            </div>

            {importMsg && (
              <div className={`mt-3 text-sm rounded-lg p-3 border ${
                importMsg.type === 'success'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-red-600 bg-red-50 border-red-200'
              }`}>
                {importMsg.text}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
