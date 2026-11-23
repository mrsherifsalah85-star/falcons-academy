import { useAuth } from '@/context/AuthContext';
import { Login } from '@/components/Login';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Dashboard } from '@/pages/Dashboard';
import { TeacherWorkspace } from '@/pages/TeacherWorkspace';
import { ManageGroups } from '@/pages/ManageGroups';
import { ManageStaff } from '@/pages/ManageStaff';
import { StudentProgress } from '@/pages/StudentProgress';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

function App() {
  const { profile, loading } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'teacher') {
      setActiveView('workspace');
    } else if (profile.role === 'super_admin') {
      setActiveView('dashboard');
    } else {
      // sub_admin — pick first accessible view
      if (profile.permissions['view_dashboard']) {
        setActiveView('dashboard');
      } else if (profile.permissions['view_teacher_workspace']) {
        setActiveView('workspace');
      } else if (profile.permissions['manage_groups']) {
        setActiveView('groups');
      } else if (profile.permissions['manage_staff']) {
        setActiveView('staff');
      }
    }
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <Login />;
  }

  const isTeacher = profile.role === 'teacher';
  const isSuperAdmin = profile.role === 'super_admin';

  const canAccess = (view: string): boolean => {
    if (isSuperAdmin) return true;
    if (isTeacher) return view === 'workspace';
    const permMap: Record<string, string> = {
      dashboard: 'view_dashboard',
      workspace: 'view_teacher_workspace',
      progress: 'view_teacher_workspace',
      groups: 'manage_groups',
      staff: 'manage_staff',
    };
    return !!profile.permissions[permMap[view]];
  };

  const renderView = () => {
    if (!canAccess(activeView)) {
      return (
        <div className="p-8 text-center text-slate-500">
          You do not have access to this section.
        </div>
      );
    }
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'workspace':
        return <TeacherWorkspace />;
      case 'groups':
        return <ManageGroups />;
      case 'progress':
        return <StudentProgress />;
      case 'staff':
        return <ManageStaff />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <DashboardLayout activeView={activeView} onNavigate={setActiveView}>
      {renderView()}
    </DashboardLayout>
  );
}

export default App;
