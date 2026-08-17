import React, { useState, useEffect, useMemo, memo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc, getDoc, deleteDoc, addDoc, limit } from '../lib/firestoreAdapter';
import { supabase } from '../lib/supabase';
import { db, handleFirestoreError, OperationType } from '../backend';
import { User, AuditLog, UserRole } from '../types';
import { toast } from 'sonner';
import { ShieldCheck, UserPlus, Trash2, Edit, Save, X, History, Activity, Eye, EyeOff, User as UserIcon, Mail, Shield, CheckCircle, Clock, Lock, AlertTriangle, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';

import { logAction } from '../App';

// --- Sub-components for Performance ---

const StaffRow = memo(({ member, onToggleStatus, onDelete }: { 
  member: User, 
  onToggleStatus: (uid: string, currentStatus: string) => void,
  onDelete: (uid: string) => void 
}) => (
  <tr className="hover:bg-slate-50 transition-colors">
    <td className="px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold overflow-hidden">
          {member.photoURL ? (
            <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            member.name.charAt(0)
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{member.name}</p>
          <p className="text-xs text-slate-400">{member.email}</p>
        </div>
      </div>
    </td>
    <td className="px-6 py-4">
      <span className={cn(
        "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
        member.role === 'CMD' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
      )}>
        {member.role}
      </span>
    </td>
    <td className="px-6 py-4">
      <button
        onClick={() => onToggleStatus(member.uid, member.status)}
        className={cn(
          "flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg transition-all",
          member.status === 'active' ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"
        )}
      >
        {member.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
        {member.status}
      </button>
    </td>
    <td className="px-6 py-4">
      <div className="flex gap-2">
        {member.email.toLowerCase() !== 'onirinwamichael@gmail.com' && (
          <button
            onClick={() => onDelete(member.uid)}
            className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
            title="Remove Staff"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </td>
  </tr>
));

const LogItem = memo(({ log }: { log: AuditLog }) => (
  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
    <div className="flex justify-between items-start">
      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{log.action}</span>
      <span className="text-[10px] text-slate-400">
        {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '...'}
      </span>
    </div>
    <p className="text-xs text-slate-700 font-medium">{log.details}</p>
    <p className="text-[10px] text-slate-400">Staff ID: {log.staffId}</p>
  </div>
));

export const CMDPortal = ({ showLogsOnly = false }: { showLogsOnly?: boolean }) => {
  const [staff, setStaff] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    role: 'Doctor' as UserRole,
    photoURL: '',
    devOverride: true // Permanently enabled as requested
  });

  // Staff authentication is provisioned server-side through a Supabase Edge Function.

  useEffect(() => {
    // Subscribe to staff
    const staffQ = query(collection(db, 'users'), orderBy('name', 'asc'));
    const unsubscribeStaff = onSnapshot(staffQ, (snapshot) => {
      try {
        setStaff(snapshot.docs.map(doc => ({ ...doc.data() } as User)));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Subscribe to audit logs
    const logsQ = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeLogs = onSnapshot(logsQ, (snapshot) => {
      try {
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'auditLogs');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'auditLogs');
    });

    return () => {
      unsubscribeStaff();
      unsubscribeLogs();
    };
  }, []);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const emailExists = staff.some(s => s.email.toLowerCase() === staffForm.email.toLowerCase());
      if (emailExists) {
        setAuthError('A staff member with this email already exists in the directory.');
        return;
      }
      if (staffForm.role === 'CMD') {
        const cmdCount = staff.filter(s => s.role === 'CMD').length;
        if (cmdCount >= 3) {
          setAuthError('Maximum number of CMDs (3) reached. Cannot assign more CMD roles.');
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke('create-staff', {
        body: {
          name: staffForm.name.trim(),
          email: staffForm.email.trim().toLowerCase(),
          role: staffForm.role,
          photoURL: staffForm.photoURL || null,
        }
      });
      if (error) throw error;
      if (!data?.user?.id) throw new Error('Staff account could not be provisioned.');

      await logAction(undefined, 'REGISTER_STAFF', `Registered new staff: ${staffForm.name} (${staffForm.role})`);
      toast.success('Staff member invited successfully. They must complete the secure account setup before access is granted.');
      setIsAddingStaff(false);
      setStaffForm({ name: '', email: '', role: 'Doctor', photoURL: '', devOverride: true });
    } catch (error: any) {
      console.error('Add staff error:', error);
      setAuthError(error?.message || 'Unable to register staff member.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedStaff.size === 0) return;

    setLoading(true);
    try {
      for (const uid of selectedStaff) {
        const member = staff.find(s => s.uid === uid);
        if (member && member.email.toLowerCase() !== 'onirinwamichael@gmail.com') {
          await deleteDoc(doc(db, 'users', uid));
        }
      }
      toast.success(`Successfully removed ${selectedStaff.size} staff members.`);
      setSelectedStaff(new Set());
      setBulkDeleteConfirm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkStatusChange = async (newStatus: 'active' | 'inactive') => {
    if (selectedStaff.size === 0) return;
    
    setLoading(true);
    try {
      for (const uid of selectedStaff) {
        await updateDoc(doc(db, 'users', uid), { status: newStatus });
      }
      toast.success(`Updated status for ${selectedStaff.size} staff members.`);
      setSelectedStaff(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectStaff = (uid: string) => {
    const newSelected = new Set(selectedStaff);
    if (newSelected.has(uid)) {
      newSelected.delete(uid);
    } else {
      newSelected.add(uid);
    }
    setSelectedStaff(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedStaff.size === staff.length) {
      setSelectedStaff(new Set());
    } else {
      setSelectedStaff(new Set(staff.map(s => s.uid)));
    }
  };

  const handleDeleteStaff = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast.success('Staff member removed.');
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Delete staff error:', error);
      toast.error('Failed to remove staff.');
    }
  };

  const toggleStaffStatus = async (uid: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: currentStatus === 'active' ? 'inactive' : 'active'
      });
      toast.success(`Staff status changed to ${currentStatus === 'active' ? 'inactive' : 'active'}`);
    } catch (error) {
      console.error('Update status error:', error);
      toast.error('Failed to update status.');
    }
  };

  // Memoized sections to prevent lag
  const staffTable = useMemo(() => (
    <div className="overflow-x-auto">
      {selectedStaff.size > 0 && (
        <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-blue-700">{selectedStaff.size} staff selected</span>
            <div className="h-4 w-px bg-blue-200" />
            <button 
              onClick={() => handleBulkStatusChange('active')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Activate All
            </button>
            <button 
              onClick={() => handleBulkStatusChange('inactive')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Deactivate All
            </button>
          </div>
          <button 
            onClick={() => setBulkDeleteConfirm(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove Selected
          </button>
        </div>
      )}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
            <th className="px-6 py-4 w-10">
              <input 
                type="checkbox" 
                checked={selectedStaff.size === staff.length && staff.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th className="px-6 py-4">Staff Member</th>
            <th className="px-6 py-4">Role</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {staff.map((member) => (
            <tr key={member.uid} className={cn("hover:bg-slate-50 transition-colors", selectedStaff.has(member.uid) && "bg-blue-50/30")}>
              <td className="px-6 py-4">
                <input 
                  type="checkbox" 
                  checked={selectedStaff.has(member.uid)}
                  onChange={() => toggleSelectStaff(member.uid)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold overflow-hidden">
                    {member.photoURL ? (
                      <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      member.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-400">{member.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                  member.role === 'CMD' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                )}>
                  {member.role}
                </span>
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => toggleStaffStatus(member.uid, member.status)}
                  className={cn(
                    "flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg transition-all",
                    member.status === 'active' ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"
                  )}
                >
                  {member.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {member.status}
                </button>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  {member.email.toLowerCase() !== 'onirinwamichael@gmail.com' && (
                    <button
                      onClick={() => setDeleteConfirm(member.uid)}
                      className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                      title="Remove Staff"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [staff, selectedStaff]);

  const auditLogList = useMemo(() => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {showLogs ? (
        logs.map((log) => (
          <LogItem key={log.id} log={log} />
        ))
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
          <EyeOff className="w-12 h-12 opacity-20" />
          <p className="font-medium">Audit logs are hidden</p>
        </div>
      )}
      {logs.length === 0 && showLogs && (
        <p className="text-center text-slate-400 text-sm py-20">No logs recorded yet.</p>
      )}
    </div>
  ), [logs, showLogs]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {!showLogsOnly && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">CMD Command Center</h2>
            <p className="text-slate-500">Full administrative control and hospital oversight.</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
                showLogs ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
              )}
            >
              {showLogs ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              {showLogs ? 'Logs Visible' : 'Logs Hidden'}
            </button>
            <button
              onClick={() => setIsAddingStaff(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <UserPlus className="w-5 h-5" />
              Add Staff
            </button>
          </div>
        </div>
      )}

      {showLogsOnly && (
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Audit Logs</h2>
          <p className="text-slate-500">Real-time tracking of all hospital activities.</p>
        </div>
      )}

      {/* Setup Help Card */}
      {!loading && (
        <div className="mb-8 p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top duration-500">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-900 mb-1">Staff Registration Setup</h3>
            <p className="text-xs text-blue-700 leading-relaxed max-w-2xl">
              To register new staff members, you must enable the <strong>Email/Password</strong> provider in your{' '}
              <a 
                href="https://supabase.com/dashboard/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="mx-1 underline font-bold hover:text-blue-900"
              >
                Firebase Console
              </a>.
              {' '}Go to <strong>Authentication</strong> and enable "Email/Password" in the <strong>Sign-in method</strong> tab.
              Without this, you will see an "operation-not-allowed" error.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Staff Management */}
        {!showLogsOnly && (
          <div className={cn(
            "space-y-6 transition-all duration-500",
            showLogs ? "lg:col-span-8" : "lg:col-span-12"
          )}>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" /> Staff Directory
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase">{staff.length} Members</span>
              </div>

              {staffTable}
            </div>
          </div>
        )}

        {/* Audit Logs */}
        {(showLogs || showLogsOnly) && (
          <div className={cn(
            "transition-all duration-500",
            showLogsOnly ? "lg:col-span-12" : "lg:col-span-4"
          )}>
            <div className={cn(
              "bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col",
              showLogsOnly ? "h-[calc(100vh-200px)]" : "h-[calc(100vh-250px)]"
            )}>
              <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <h3 className="font-bold flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-400" /> Audit Logs
                </h3>
                <Activity className="w-4 h-4 text-green-400 animate-pulse" />
              </div>
              
              {auditLogList}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Confirm Removal</h3>
                  <p className="text-slate-500 text-sm mt-1">
                    Are you sure you want to remove this staff member? This action cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteStaff(deleteConfirm)}
                    className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Staff Modal */}
      <AnimatePresence>
        {isAddingStaff && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-400" /> Register New Staff
                </h3>
                <button onClick={() => setIsAddingStaff(false)} className="p-1 hover:bg-white/10 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddStaff} className="p-8 space-y-6">
                {authError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold">
                    {authError}
                  </div>
                )}
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Profile Picture Upload */}
                  <div className="flex flex-col items-center gap-3 shrink-0">
                    <div className="relative group">
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                        {staffForm.photoURL ? (
                          <img src={staffForm.photoURL} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-8 h-8 text-slate-300" />
                        )}
                      </div>
                      <label className="absolute bottom-0 right-0 p-1.5 bg-blue-600 rounded-full text-white cursor-pointer shadow-lg hover:bg-blue-700 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                        <Camera className="w-4 h-4" />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 500000) {
                                toast.error('Image too large (max 500KB)');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setStaffForm({ ...staffForm, photoURL: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          }} 
                        />
                      </label>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Profile Picture (Optional)</p>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <UserIcon className="w-4 h-4" /> Full Name
                      </label>
                      <input
                        required
                        value={staffForm.name}
                        onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                        className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                        placeholder="Dr. Jane Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Mail className="w-4 h-4" /> Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={staffForm.email}
                        onChange={e => setStaffForm({ ...staffForm, email: e.target.value })}
                        className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                        placeholder="jane@rehoboth.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Assigned Role
                      </label>
                      <select
                        value={staffForm.role}
                        onChange={e => setStaffForm({ ...staffForm, role: e.target.value as UserRole })}
                        className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                      >
                        <option value="Doctor">Doctor</option>
                        <option value="Nurse">Nurse</option>
                        <option value="Lab">Lab Technician</option>
                        <option value="Accountant">Accountant</option>
                        <option value="Receptionist">Receptionist</option>
                        <option value="Pharmacy">Pharmacist</option>
                        <option value="CMD">CMD (Admin)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <Save className="w-5 h-5" />
                  Save Staff Member
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Remove Staff"
        message="Are you sure you want to remove this staff member? This action cannot be undone."
        confirmText="Remove"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          if (deleteConfirm) {
            try {
              await deleteDoc(doc(db, 'users', deleteConfirm));
              toast.success('Staff member removed.');
              setDeleteConfirm(null);
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, 'users');
            }
          }
        }}
      />

      <ConfirmModal
        isOpen={bulkDeleteConfirm}
        title="Remove Multiple Staff"
        message={`Are you sure you want to remove ${selectedStaff.size} staff members? This action cannot be undone.`}
        confirmText="Remove All"
        onCancel={() => setBulkDeleteConfirm(false)}
        onConfirm={() => {
          handleBulkDelete();
        }}
      />
    </div>
  );
};
