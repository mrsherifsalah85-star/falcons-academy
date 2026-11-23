export type Role = 'super_admin' | 'sub_admin' | 'teacher';

export interface PermissionKey {
  key: string;
  label: string;
  description: string;
}

export const ALL_PERMISSIONS: PermissionKey[] = [
  { key: 'view_dashboard', label: 'View Dashboard', description: 'Access the admin dashboard with analytics' },
  { key: 'view_all_groups', label: 'View All Groups', description: 'See all groups, not just assigned ones' },
  { key: 'view_teacher_workspace', label: 'View Teacher Workspace', description: 'Access the teacher workspace' },
  { key: 'manage_groups', label: 'Manage Groups', description: 'Create, edit, and delete groups' },
  { key: 'manage_students', label: 'Manage Students', description: 'Add, edit, and remove students' },
  { key: 'manage_staff', label: 'Manage Staff', description: 'Create sub-admin accounts and configure permissions' },
  { key: 'manage_exams', label: 'Manage Exams', description: 'Schedule and manage exams' },
];

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  permissions: Record<string, boolean>;
  whatsapp_number: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuthorizedUser {
  email: string;
  name: string;
  role: 'super_admin' | 'teacher';
  is_active: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  level: string;
  intelligence: 'strong' | 'weak' | 'unclassified';
  teacher_id: string | null;
  created_at: string;
  teacher?: Profile | null;
}

export interface Student {
  id: string;
  name: string;
  group_id: string;
  enrollment_date: string;
  created_at: string;
}

export interface SessionReport {
  id: string;
  group_id: string;
  teacher_id: string;
  report_date: string;
  content: string;
  pace: 'on_time' | 'delayed' | 'faster';
  quiz_max_score: number;
  dictation_max_score: number;
  created_at: string;
}

export interface Evaluation {
  id: string;
  session_report_id: string;
  student_id: string;
  quiz_score: number | null;
  dictation: number | null;
  reading: string | null;
  homework: string | null;
  behavior: string;
  custom_data: Record<string, string | number | null>;
  created_at: string;
}

export interface CustomColumn {
  id: string;
  group_id: string;
  name: string;
  column_type: 'text' | 'number' | 'dropdown';
  options: string[];
  created_at: string;
}

export interface Exam {
  id: string;
  group_id: string;
  title: string;
  exam_date: string;
  max_score: number;
  created_at: string;
}
