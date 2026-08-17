import React, { createContext, useContext, useEffect, useState, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User as AuthUser, signInWithEmailAndPassword } from './lib/authAdapter';
import { collection, onSnapshot, query, orderBy, limit, addDoc, updateDoc } from './lib/firestoreAdapter';
import { supabase } from './lib/supabase';
import { auth, db, handleFirestoreError, OperationType } from './backend';
import { User, UserRole } from './types';
import { Toaster, toast } from 'sonner';
import { LogIn, LogOut, LayoutDashboard, Users, UserPlus, ClipboardList, FlaskConical, Receipt, Pill, ShieldCheck, Activity, Search, Plus, Trash2, Edit, Save, X, ChevronRight, Menu, Bell, Settings, History, Mail, Lock, Camera, Eye, EyeOff, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { format } from 'date-fns';

import { ReceptionistPortal } from './components/ReceptionistPortal';
import { DoctorNursePortal } from './components/DoctorNursePortal';
import { LabPortal } from './components/LabPortal';
import { AccountantPortal } from './components/AccountantPortal';
import { PharmacyPortal } from './components/PharmacyPortal';
import { CMDPortal } from './components/CMDPortal';
import { ProfileSettings } from './components/ProfileSettings';
import { ClinicalBoard } from './components/ClinicalBoard';
import { PatientSearch } from './components/PatientSearch';
import { SystemClock } from './components/SystemClock';
import { ErrorBoundary } from './components/ErrorBoundary';
import { checkSystemHealth } from './backend';

// --- Helpers ---
export const logAction = async (staffId: string | undefined, action: string, details: string) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      staffId: staffId && staffId !== 'SYSTEM' ? staffId : null,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'auditLogs');
  }
};

// --- Context ---
interface AuthContextType {
  user: User | null;
  authUser: AuthUser | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

// --- Auth Provider ---
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadClinicProfile = async (fUser: AuthUser) => {
      setLoading(true);
      try {
        // Supabase Auth establishes identity; public.users establishes clinic authorization.
        // This must not read the legacy Firebase users collection.
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, email, role, name, status, photo_url, phone, last_updated, created_at')
          .eq('id', fUser.uid)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          console.error('Clinic profile lookup failed:', profileError);
          setUser(null);
          await signOut(auth);
          toast.error('Unable to verify your clinic authorization. Please contact the CMD.');
          return;
        }

        if (!profile) {
          setUser(null);
          await signOut(auth);
          toast.error('Unauthorized access. Your clinic account has not been provisioned.');
          return;
        }

        if (profile.status !== 'active') {
          setUser(null);
          await signOut(auth);
          toast.error('Your clinic account is inactive. Contact the CMD.');
          return;
        }

        setUser({
          uid: profile.id,
          email: profile.email,
          role: profile.role,
          name: profile.name,
          status: profile.status,
          photoUrl: profile.photo_url,
          phone: profile.phone,
          lastUpdated: profile.last_updated,
          createdAt: profile.created_at,
        } as User);
      } catch (error) {
        console.error('Clinic authorization error:', error);
        if (active) {
          setUser(null);
          await signOut(auth);
          toast.error('Unable to verify your clinic authorization. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (fUser) => {
      if (!active) return;
      setAuthUser(fUser);
      if (fUser) {
        void loadClinicProfile(fUser);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribeAuth();
    };
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (error: any) {
      console.error('Email Login error:', error);
      const message = String(error?.message || '').toLowerCase();
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        message.includes('invalid login credentials')
      ) {
        toast.error('Invalid email or password.');
      } else if (message.includes('email not confirmed')) {
        toast.error('Your CMD email is not confirmed in Supabase.');
      } else {
        toast.error(error?.message || 'Failed to sign in with email.');
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    toast.success('Logged out successfully.');
  };

  return (
    <AuthContext.Provider value={{ user, authUser, loading, loginWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Components ---

const ECGLogo = () => {
  return (
    <div className="flex flex-col items-center justify-center mb-12">
      <div className="relative w-64 h-24 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 flex items-center justify-center">
        {/* Grid background */}
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)`,
          backgroundSize: '10px 10px'
        }}></div>
        
        {/* ECG Line Animation */}
        <svg className="w-full h-full absolute inset-0" viewBox="0 0 400 100" preserveAspectRatio="none">
          <motion.path
            d="M 0 50 L 100 50 L 120 20 L 140 80 L 160 50 L 250 50 L 270 30 L 290 70 L 310 50 L 400 50"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ 
              pathLength: [0, 1, 1],
              opacity: [0, 1, 0],
              x: [0, -100]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              ease: "linear",
              times: [0, 0.8, 1]
            }}
            style={{ filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.8))' }}
          />
        </svg>

        {/* Beeping dot */}
        <motion.div
          className="absolute w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_4px_rgba(74,222,128,0.6)]"
          animate={{ 
            opacity: [1, 0.5, 1],
            scale: [1, 1.2, 1]
          }}
          transition={{ 
            duration: 1, 
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ right: '20px', top: '20px' }}
        />
      </div>
      <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-6">
        Rehoboth <span className="text-blue-600">Clinic</span>
      </h1>
      <p className="text-slate-500 font-medium mt-1">Hospital Management System</p>
    </div>
  );
};

const LoginPage = () => {
  const { loginWithEmail, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailLogin, setIsEmailLogin] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password.');
      return;
    }
    await loginWithEmail(email, password);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <ECGLogo />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8"
      >
        {/* Left Side: CMD Access */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8 border border-slate-100">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-blue-200">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">CMD Access</h2>
              <p className="text-sm text-slate-500">Authorized CMD email and password</p>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3 h-3" /> CMD Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="your-authorized-email@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-blue-600 hover:text-blue-700 text-[10px] font-bold flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your CMD password"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" />
              CMD Login
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center">
            CMD access is restricted to the authorized administrator account. Staff accounts are provisioned by the CMD.
          </p>
        </div>

        {/* Right Side: Staff Email Login */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8 border border-slate-100">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
              <Users className="w-10 h-10 text-slate-600" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Staff Access</h2>
              <p className="text-sm text-slate-500">Login with your credentials</p>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3 h-3" /> Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="staff@rehoboth.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Password
                </label>
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-blue-600 hover:text-blue-700 text-[10px] font-bold flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Staff Login
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center">
            Staff accounts must be registered by the CMD before login.
          </p>
        </div>
      </motion.div>

      <div className="mt-12 text-center space-y-2">
        <p className="text-sm text-slate-500 font-medium">
          The Rehoboth Clinic and Maternity
        </p>
        <p className="text-blue-600 font-medium italic text-xs">
          "By the Stripes of JESUS You Shall Be Made Whole"
        </p>
      </div>
    </div>
  );
};

const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentView, setCurrentView] = useState('Overview');

  if (!user) return <Navigate to="/" />;

  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy'] },
    { icon: Search, label: 'Patient Search', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy'] },
    { icon: Activity, label: 'Clinical Board', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy'] },
    { icon: Users, label: 'Receptionist Portal', role: ['CMD', 'Receptionist'] },
    { icon: ClipboardList, label: 'Doctor Portal', role: ['CMD', 'Doctor'] },
    { icon: Activity, label: 'Nurse Portal', role: ['CMD', 'Nurse'] },
    { icon: FlaskConical, label: 'Laboratory', role: ['CMD', 'Lab'] },
    { icon: Pill, label: 'Pharmacy', role: ['CMD', 'Pharmacy'] },
    { icon: Receipt, label: 'Accounts', role: ['CMD', 'Accountant'] },
    { icon: ShieldCheck, label: 'Staff Management', role: ['CMD'] },
    { icon: History, label: 'Audit Logs', role: ['CMD'] },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      {/* Sidebar */}
      <aside className={cn(
        "bg-slate-900 text-white transition-all duration-300 flex flex-col sticky top-0 h-screen z-40",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <Activity className="w-8 h-8 text-blue-400 shrink-0" />
          {isSidebarOpen && <span className="font-bold text-lg truncate">Rehoboth Clinic</span>}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.filter(item => item.role.includes(user.role)).map((item, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentView(item.label)}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all group",
                currentView === item.label 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className={cn(
                "w-6 h-6 shrink-0 transition-colors",
                currentView === item.label ? "text-white" : "group-hover:text-blue-400"
              )} />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={() => setIsProfileOpen(true)}
            className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <Settings className="w-6 h-6 shrink-0" />
            {isSidebarOpen && <span className="font-medium">Profile Settings</span>}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-900/20 text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-6 h-6 shrink-0" />
            {isSidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg">
            <Menu className="w-6 h-6 text-slate-600" />
          </button>

          <div className="hidden sm:block">
            <SystemClock />
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wider">{user.role}</p>
            </div>
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold overflow-hidden border-2 border-white shadow-sm hover:ring-2 hover:ring-blue-500 transition-all"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0)
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {React.cloneElement(children as React.ReactElement, { currentView })}
        </div>
      </main>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsProfileOpen(false);
            }}
          >
            <ProfileSettings user={user} onClose={() => setIsProfileOpen(false)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Role Specific Views ---

const MainDashboard = ({ currentView }: { currentView?: string }) => {
  const { user } = useAuth();
  if (!user) return null;

  const renderContent = () => {
    if (currentView === 'Clinical Board') return <ClinicalBoard />;
    if (currentView === 'Patient Search') return <PatientSearch />;
    if (currentView === 'Staff Management' && user.role === 'CMD') return <CMDPortal />;
    if (currentView === 'Receptionist Portal') return <ReceptionistPortal userId={user.uid} />;
    if (currentView === 'Doctor Portal') return <DoctorNursePortal role="Doctor" userId={user.uid} />;
    if (currentView === 'Nurse Portal') return <DoctorNursePortal role="Nurse" userId={user.uid} />;
    if (currentView === 'Laboratory') return <LabPortal userId={user.uid} />;
    if (currentView === 'Pharmacy') return <PharmacyPortal userId={user.uid} />;
    if (currentView === 'Accounts') return <AccountantPortal userId={user.uid} />;
    if (currentView === 'Audit Logs' && user.role === 'CMD') return <CMDPortal showLogsOnly={true} />;

    switch (user.role) {
      case 'CMD': return <CMDPortal />;
      case 'Receptionist': return <ReceptionistPortal userId={user.uid} />;
      case 'Doctor':
      case 'Nurse': return <DoctorNursePortal role={user.role} userId={user.uid} />;
      case 'Lab': return <LabPortal userId={user.uid} />;
      case 'Accountant': return <AccountantPortal userId={user.uid} />;
      case 'Pharmacy': return <PharmacyPortal userId={user.uid} />;
      default: return (
        <div className="text-center py-20">
          <Activity className="w-16 h-16 text-blue-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900">Welcome to the {user.role} Portal</h2>
          <p className="text-slate-500">Select an option from the sidebar to get started.</p>
        </div>
      );
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
            Welcome back, {user.name.split(' ')[0]}!
          </h1>
          <p className="text-sm sm:text-base text-slate-500 font-medium mt-1">
            {currentView || 'Overview'} - {user.role} Portal
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm self-start lg:self-auto">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">{format(new Date(), 'EEEE')}</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 whitespace-nowrap">{format(new Date(), 'MMMM do, yyyy')}</p>
          </div>
        </div>
      </div>
      {renderContent()}
    </div>
  );
};

// --- App ---
export default function App() {
  const [systemStatus, setSystemStatus] = useState<{ auth: boolean; firestore: boolean; online: boolean } | null>(null);

  useEffect(() => {
    checkSystemHealth().then(setSystemStatus);
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/dashboard" element={
              <DashboardLayout>
                <MainDashboard />
              </DashboardLayout>
            } />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
        <Toaster position="top-right" richColors />
        
        {/* System Status Indicator */}
        <div className="fixed bottom-4 right-4 z-50">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg backdrop-blur-md transition-all",
            systemStatus?.firestore ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              systemStatus?.firestore ? "bg-green-500" : "bg-red-500"
            )} />
            {systemStatus?.firestore ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
          </div>
        </div>
      </AuthProvider>
    </ErrorBoundary>
  );
}
