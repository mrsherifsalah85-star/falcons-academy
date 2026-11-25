import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Profile, AuthorizedUser } from '@/types';
import { ALL_PERMISSIONS } from '@/types';
import {
  Shield,
  Plus,
  Trash2,
  Edit2,
  X,
  Loader2,
  Check,
  ChevronDown,
  User as UserIcon,
  UserPlus,
  UserX,
  UserCheck,
  Mail,
  Upload,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

type StaffRole = 'super_admin' | 'sub_admin' | 'teacher';

interface ParsedStaffRow {
  email: string;
  name: string;
  role: StaffRole;
  is_active: boolean;
}

function normalizeRole(raw: unknown): StaffRole {
  const val = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (val === 'super_admin' || val === 'superadmin') return 'super_admin';
  if (val === 'sub_admin' || val === 'subadmin') return 'sub_admin';
  return 'teacher';
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

function rowsToStaffList(matrix: unknown[][]): ParsedStaffRow[] {
  if (!matrix.length) return [];

  const nonEmptyRows = matrix.filter((r) =>
    Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== '')
  );
  if (!nonEmptyRows.length) return [];

  const firstRow = nonEmptyRows[0].map((c) => String(c ?? '').trim().toLowerCase());
  const hasHeader =
    firstRow.some((h) => h.includes('email') || h.includes('mail') || h.includes('البريد')) ||
    firstRow.some((h) => h === 'name' || h.includes('display') || h.includes('الاسم'));

  let emailIdx = 0;
  let nameIdx = 1;
  let roleIdx = 2;

  if (hasHeader) {
    const foundEmail = firstRow.findIndex((h) => h.includes('email') || h.includes('mail') || h.includes('البريد'));
    const foundName = firstRow.findIndex((h) => h === 'name' || h.includes('display') || h.includes('الاسم'));
    const foundRole = firstRow.findIndex((h) => h.includes('role') || h.includes('الدور') || h.includes('الصلاحية'));
    emailIdx = foundEmail >= 0 ? foundEmail : 0;
    nameIdx = foundName >= 0 ? foundName : 1;
    roleIdx = foundRole >= 0 ? foundRole : 2;
  }

  const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;
  const deduped = new Map<string, ParsedStaffRow>();

  for (const row of dataRows) {
    const rawEmail = String(row[emailIdx] ?? '').trim().toLowerCase();
    if (!rawEmail || !rawEmail.includes('@')) continue;

    const rawName = String(row[nameIdx] ?? '').trim();
    const parsedRole = normalizeRole(row[roleIdx]);

    deduped.set(rawEmail, {
      email: rawEmail,
      name: rawName || rawEmail.split('@')[0],
      role: parsedRole,
      is_active: true,
    });
  }

  return Array.from(deduped.values());
}

async function parseSpreadsheetFile(file: File): Promise<ParsedStaffRow[]> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    const text = await file.text();
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (!lines.length) return [];
    const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
    const matrix = lines.map((line) => splitCsvLine(line, delimiter));
    return rowsToStaffList(matrix);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
  return rowsToStaffList(matrix);
}

export function ManageStaff() {
  const { profile: currentUser } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<'single' | 'import'>('single');
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<StaffRole>('teacher');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  // Bulk file import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importedFileName, setImportedFileName] = useState('');
  const [importedRows, setImportedRows] = useState<ParsedStaffRow[]>([]);
  const [parsingFile, setParsingFile] = useState(false);
  const [importSummary, setImportSummary] = useState<string>('');

  const [authorized, setAuthorized] = useState<AuthorizedUser[]>([]);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<StaffRole>('teacher');
  const [authSaving, setAuthSaving] = useState(false);
  const [authError, setAuthError] = useState('');

  const loadStaff = useCallback(async () => {
    const [profilesRes, authorizedRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('authorized_users').select('*').order('created_at'),
    ]);
    setStaff((profilesRes.data as Profile[]) || []);
    setAuthorized((authorizedRes.data as AuthorizedUser[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const resetModal = () => {
    setShowModal(false);
    setModalTab('single');
    setEditingProfile(null);
    setEmail('');
    setDisplayName('');
    setRole('teacher');
    setPermissions({});
    setSaveError('');
    setImportedFileName('');
    setImportedRows([]);
    setImportSummary('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSaveError('');
    setImportSummary('');
    if (!file) {
      setImportedFileName('');
      setImportedRows([]);
      return;
    }

    setParsingFile(true);
    setImportedFileName(file.name);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.length === 0) {
        setImportedRows([]);
        setSaveError('No valid email rows found in the file. Make sure there is an email column.');
      } else {
        setImportedRows(parsed);
      }
    } catch (err) {
      setImportedRows([]);
      setSaveError(err instanceof Error ? err.message : 'Failed to read spreadsheet file');
    } finally {
      setParsingFile(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const sample = [
      'email,name,role',
      'ahmed.ali@falcons.com,Mr Ahmed Ali,teacher',
      'sara.hassan@falcons.com,Ms Sara Hassan,teacher',
      'karim.adel@falcons.com,Mr Karim Adel,sub_admin',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'falcons-staff-template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBulkImport = async () => {
    if (importedRows.length === 0) return;
    setSaving(true);
    setSaveError('');
    setImportSummary('');

    try {
      const existingEmails = new Set(authorized.map((u) => u.email.trim().toLowerCase()));
      const newRows = importedRows.filter((r) => !existingEmails.has(r.email));
      const skippedCount = importedRows.length - newRows.length;

      if (newRows.length === 0) {
        setSaveError('All emails in this file are already on the access list.');
        return;
      }

      const { error } = await supabase
        .from('authorized_users')
        .upsert(newRows, { onConflict: 'email', ignoreDuplicates: true });

      if (error) throw error;

      await loadStaff();
      setImportSummary(
        `Added ${newRows.length} staff member(s)${skippedCount > 0 ? ` (${skippedCount} already existed and were skipped)` : ''}.`
      );
      setTimeout(() => {
        resetModal();
      }, 1200);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to import staff list');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSaving(true);
    setSaveError('');
    try {
      const { error } = await supabase.from('authorized_users').insert({
        email: normalizedEmail,
        name: displayName.trim(),
        role,
        is_active: true,
      });
      if (error) {
        throw new Error(error.code === '23505'
          ? 'This email is already on the access list.'
          : error.message);
      }

      await loadStaff();
      resetModal();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to authorize staff member');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: Profile) => {
    setEditingProfile(p);
    setModalTab('single');
    setDisplayName(p.display_name);
    setRole(p.role === 'super_admin' ? 'super_admin' : p.role === 'sub_admin' ? 'sub_admin' : 'teacher');
    setPermissions({ ...p.permissions });
    setShowModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingProfile) return;
    setSaving(true);
    setSaveError('');
    try {
      const updates: Partial<Profile> = {
        display_name: displayName,
        permissions: role === 'sub_admin' ? permissions : {},
        role,
      };
      const { error } = await supabase.from('profiles').update(updates).eq('id', editingProfile.id);
      if (error) throw error;
      await loadStaff();
      resetModal();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (p: Profile, newRole: StaffRole) => {
    if (newRole === p.role) return;
    if (p.id === currentUser?.id && newRole !== 'super_admin') {
      alert('You cannot demote yourself. Ask another Super Admin to do it.');
      return;
    }
    const updates: Partial<Profile> = { role: newRole };
    if (newRole !== 'sub_admin') updates.permissions = {};
    const { error } = await supabase.from('profiles').update(updates).eq('id', p.id);
    if (error) {
      alert('Failed to update role: ' + error.message);
      return;
    }
    setStaff(staff.map((s) => (
      s.id === p.id
        ? { ...s, role: newRole, permissions: newRole !== 'sub_admin' ? {} : s.permissions }
        : s
    )));
  };

  const handleTogglePermission = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddAuthorized = async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email) return;
    setAuthSaving(true);
    setAuthError('');
    try {
      const { error } = await supabase.from('authorized_users').insert({
        email,
        name: authName.trim(),
        role: authRole,
        is_active: true,
      });
      if (error) {
        setAuthError(error.code === '23505'
          ? 'This email is already on the access list.'
          : error.message);
        return;
      }
      setAuthEmail('');
      setAuthName('');
      setAuthRole('teacher');
      await loadStaff();
    } finally {
      setAuthSaving(false);
    }
  };

  const handleToggleActive = async (user: AuthorizedUser) => {
    setAuthError('');
    const { error } = await supabase
      .from('authorized_users')
      .update({ is_active: !user.is_active })
      .eq('email', user.email);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthorized(authorized.map((u) =>
      u.email === user.email ? { ...u, is_active: !u.is_active } : u
    ));
  };

  const handleRemoveAuthorized = async (user: AuthorizedUser) => {
    setAuthError('');
    if (!confirm(`Remove ${user.email} from the access list? They will no longer be able to sign in or set up a password.`)) return;
    const { error } = await supabase
      .from('authorized_users')
      .delete()
      .eq('email', user.email);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthorized(authorized.filter((u) => u.email !== user.email));
  };

  const handleDelete = async (p: Profile) => {
    if (p.id === currentUser?.id) {
      alert('You cannot delete your own account.');
      return;
    }
    if (!confirm(`Remove ${p.display_name}? This will permanently delete their account and all associated data.`)) return;
    const { error } = await supabase.from('profiles').delete().eq('id', p.id);
    if (error) {
      alert('Could not delete: ' + error.message);
      return;
    }
    setStaff(staff.filter((s) => s.id !== p.id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  const isEditing = !!editingProfile;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manage Staff</h1>
          <p className="text-slate-500 text-sm mt-1">Authorize teachers and manage staff access</p>
        </div>
        <button
          onClick={() => {
            setEditingProfile(null);
            setModalTab('single');
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Authorize Staff
        </button>
      </div>

      {/* Staff & Teachers Access (allowlist) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-900">Staff &amp; Teachers Access</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Only emails on this list can sign in or set a first-time password. Deactivate an email to block access without deleting it.
        </p>

        {/* Add to allowlist */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="teacher@academy.com"
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
          />
          <input
            type="text"
            value={authName}
            onChange={(e) => setAuthName(e.target.value)}
            placeholder="Name"
            className="w-full sm:w-40 px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
          />
          <select
            value={authRole}
            onChange={(e) => setAuthRole(e.target.value as StaffRole)}
            className="w-full sm:w-40 px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
          >
            <option value="teacher">Teacher</option>
            <option value="sub_admin">Sub Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <button
            onClick={handleAddAuthorized}
            disabled={authSaving || !authEmail.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2 shrink-0"
          >
            {authSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>

        {authError && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 border border-red-200 mb-4">
            {authError}
          </div>
        )}

        {/* Allowlist rows */}
        <div className="space-y-2">
          {authorized.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No authorized emails yet. Add one above.</p>
          ) : (
            authorized.map((user) => {
              const hasAccount = staff.some((s) => s.email.toLowerCase() === user.email.toLowerCase());
              const roleBadgeClass =
                user.role === 'super_admin'
                  ? 'bg-blue-50 text-blue-700'
                  : user.role === 'sub_admin'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700';
              const roleLabel =
                user.role === 'super_admin'
                  ? 'Super Admin'
                  : user.role === 'sub_admin'
                  ? 'Sub Admin'
                  : 'Teacher';

              return (
                <div
                  key={user.email}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      user.role === 'super_admin'
                        ? 'bg-blue-100 text-blue-600'
                        : user.role === 'sub_admin'
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {user.name || user.email.split('@')[0]}
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeClass}`}>
                          {roleLabel}
                        </span>
                        {hasAccount && (
                          <span className="ml-1.5 text-xs text-slate-400">(account created)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        user.is_active
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={user.is_active ? 'Click to block access' : 'Click to restore access'}
                    >
                      {user.is_active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => handleRemoveAuthorized(user)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                      title="Remove from access list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <h2 className="text-lg font-semibold text-slate-900 mb-3">All Staff Accounts</h2>
      <div className="space-y-3">
        {staff.map((p) => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                p.role === 'super_admin' ? 'bg-blue-100 text-blue-600'
                : p.role === 'sub_admin' ? 'bg-amber-100 text-amber-600'
                : 'bg-emerald-100 text-emerald-600'
              }`}>
                <UserIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {p.display_name}
                  {p.id === currentUser?.id && <span className="text-xs text-slate-400 font-normal ml-1.5">(You)</span>}
                </p>
                <p className="text-xs text-slate-400 truncate">{p.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              <div className="relative">
                <select
                  value={p.role}
                  onChange={(e) => handleRoleChange(p, e.target.value as StaffRole)}
                  className={`appearance-none text-xs font-medium px-3 py-1.5 pr-8 rounded-full border cursor-pointer outline-none transition-all ${
                    p.role === 'super_admin' ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : p.role === 'sub_admin' ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="sub_admin">Sub Admin</option>
                  <option value="teacher">Teacher</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              {p.role === 'sub_admin' && Object.entries(p.permissions).filter(([, v]) => v).length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                  {Object.entries(p.permissions).filter(([, v]) => v).map(([key]) => (
                    <span key={key} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      {ALL_PERMISSIONS.find((perm) => perm.key === key)?.label ?? key}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(p)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                  title="Edit details & permissions"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {p.id !== currentUser?.id && (
                  <button
                    onClick={() => handleDelete(p)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                    title="Delete account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={resetModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  {isEditing ? 'Edit Staff Member' : 'Authorize Staff Member'}
                </h3>
                <button onClick={resetModal} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!isEditing && (
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setModalTab('single');
                      setSaveError('');
                      setImportSummary('');
                    }}
                    className={`py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                      modalTab === 'single'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Single Staff
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalTab('import');
                      setSaveError('');
                      setImportSummary('');
                    }}
                    className={`py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                      modalTab === 'import'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Import Excel / CSV
                  </button>
                </div>
              )}

              {!isEditing && modalTab === 'import' ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Upload CSV or Excel file (.csv, .xlsx, .xls)</span>
                      <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1 shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Sample CSV
                      </button>
                    </div>
                    <p className="text-blue-800/90">
                      Columns: <span className="font-mono">email</span>, <span className="font-mono">name</span>, <span className="font-mono">role</span> (<span className="font-mono">teacher</span>, <span className="font-mono">sub_admin</span>, <span className="font-mono">super_admin</span>). Role defaults to <span className="font-mono">teacher</span>.
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileChange}
                      className="hidden"
                      id="staff-file-upload"
                    />
                    <label
                      htmlFor="staff-file-upload"
                      className="w-full border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-slate-50/60"
                    >
                      {parsingFile ? (
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6 text-blue-600" />
                      )}
                      <span className="text-sm font-medium text-slate-700">
                        {importedFileName || 'Choose Excel or CSV file'}
                      </span>
                      <span className="text-xs text-slate-400">
                        Click to select file from your device
                      </span>
                    </label>
                  </div>

                  {importedRows.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 border-b border-slate-200 flex items-center justify-between">
                        <span>Ready to import: {importedRows.length} staff member(s)</span>
                        <span className="text-slate-400">Preview</span>
                      </div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                        {importedRows.map((row) => (
                          <div key={row.email} className="px-3 py-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">{row.name}</p>
                              <p className="text-slate-400 truncate">{row.email}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium shrink-0">
                              {row.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importSummary && (
                    <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      {importSummary}
                    </div>
                  )}

                  {saveError && (
                    <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 border border-red-200">
                      {saveError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={resetModal}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      disabled={saving || importedRows.length === 0}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Import ({importedRows.length})
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {!isEditing && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Email to authorize</label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                            placeholder="new.staff@academy.com"
                          />
                        </div>
                        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-sm text-blue-800">
                          The staff member will create their own password from the First-Time Setup option on the login screen.
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setRole('super_admin'); setPermissions({}); }}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                            role === 'super_admin'
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Super Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRole('sub_admin'); }}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                            role === 'sub_admin'
                              ? 'bg-amber-50 border-amber-300 text-amber-700'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Sub Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRole('teacher'); setPermissions({}); }}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                            role === 'teacher'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Teacher
                        </button>
                      </div>
                    </div>

                    {role === 'sub_admin' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
                        <div className="space-y-2">
                          {ALL_PERMISSIONS.map((perm) => (
                            <label
                              key={perm.key}
                              className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <button
                                type="button"
                                onClick={() => handleTogglePermission(perm.key)}
                                className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                  permissions[perm.key]
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {permissions[perm.key] && <Check className="w-3.5 h-3.5 text-white" />}
                              </button>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800">{perm.label}</p>
                                <p className="text-xs text-slate-400">{perm.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {saveError && (
                      <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 border border-red-200">
                        {saveError}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={resetModal}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={isEditing ? handleSaveEdit : handleCreate}
                      disabled={saving || (!isEditing && !email.trim())}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isEditing ? 'Save Changes' : 'Add to Access List'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
