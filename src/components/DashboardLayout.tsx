import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Shield,
  LogOut,
  Menu,
  X,
  User as UserIcon,
  LineChart as LineChartIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface NavItem {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
  teacherCanSee?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { key: 'workspace', label: 'Teacher Workspace', icon: ClipboardList, teacherCanSee: true, permission: 'view_teacher_workspace' },
  { key: 'progress', label: 'Student Progress', icon: LineChartIcon, teacherCanSee: true, permission: 'view_teacher_workspace' },
  { key: 'groups', label: 'Groups & Students', icon: Users, permission: 'manage_groups' },
  { key: 'staff', label: 'Manage Staff', icon: Shield, permission: 'manage_staff' },
];

export function DashboardLayout({
  activeView,
  onNavigate,
  children,
}: {
  activeView: string;
  onNavigate: (view: string) => void;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!profile) return null;

  const isTeacher = profile.role === 'teacher';
  const isSuperAdmin = profile.role === 'super_admin';

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (isSuperAdmin) return true;
    if (isTeacher) return item.teacherCanSee;
    if (item.permission) {
      return !!profile.permissions[item.permission];
    }
    return false;
  });

  const roleLabel = isSuperAdmin ? 'Super Admin' : isTeacher ? 'Teacher' : 'Sub-Admin';
  const roleColor = isSuperAdmin ? 'bg-blue-100 text-blue-700' : isTeacher ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    try {
      // Clear any cached auth data held in browser storage.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {
      // storage unavailable — session cleared via signOut above
    }
    onNavigate('dashboard');
  };

  const handleNav = (key: string) => {
    onNavigate(key);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static w-64 bg-slate-900 text-slate-300 flex flex-col z-40 transition-transform duration-300 h-screen lg:h-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 overflow-hidden">
            <img src="/IMG-20261118-WA0043.jpg" alt="Falcons Academy logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Falcons Academy</p>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5 text-slate-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{profile.display_name}</p>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${roleColor}`}>
                {roleLabel}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/IMG-20261118-WA0043.jpg" alt="Falcons Academy logo" className="w-7 h-7 rounded-md object-cover" />
            <span className="font-semibold text-slate-800">Falcons Academy</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">Log Out</span>
          </button>
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end bg-white border-b border-slate-200 px-6 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {profile.display_name}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${roleColor}`}>{roleLabel}</span>
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
