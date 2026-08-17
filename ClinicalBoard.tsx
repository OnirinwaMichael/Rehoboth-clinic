import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  FlaskConical, 
  User, 
  Calendar, 
  Search, 
  Filter,
  Thermometer,
  Heart,
  Wind,
  Droplets,
  FileText,
  Clock,
  ChevronRight
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  limit 
} from '../lib/firestoreAdapter';
import { db, handleFirestoreError, OperationType } from '../backend';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { MedicalRecord, LabTest } from '../types';

interface VitalsRecord {
  id: string;
  patientName: string;
  vitals: {
    temp: string;
    bp: string;
    pulse: string;
    resp: string;
    spo2: string;
    weight: string;
  };
  timestamp: any;
  recordedBy: string;
}

interface LabResult {
  id: string;
  patientName: string;
  testName: string;
  result: string;
  status: string;
  timestamp: any;
  technicianName: string;
}

export const ClinicalBoard: React.FC = () => {
  const [vitals, setVitals] = useState<VitalsRecord[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'vitals' | 'labs'>('vitals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const vitalsQuery = query(collection(db, 'medicalRecords'), orderBy('createdAt', 'desc'), limit(50));
    const labsQuery = query(collection(db, 'labTests'), orderBy('createdAt', 'desc'), limit(50));

    const unsubVitals = onSnapshot(vitalsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          patientName: d.patientId, // Using patientId as name for now, or we'd need to fetch patient doc
          vitals: {
            temp: d.vitals?.temperature || '-',
            bp: d.vitals?.bloodPressure || '-',
            pulse: d.vitals?.pulse || '-',
            resp: d.vitals?.respiratoryRate || '-',
            spo2: d.vitals?.spo2 || '-',
            weight: d.vitals?.weight || '-'
          },
          timestamp: d.createdAt ? { toDate: () => new Date(d.createdAt) } : null,
          recordedBy: d.staffId || 'System'
        };
      }) as VitalsRecord[];
      setVitals(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'medicalRecords');
    });

    const unsubLabs = onSnapshot(labsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          patientName: d.patientId,
          testName: d.testType,
          result: d.result,
          status: d.result ? 'completed' : 'pending',
          timestamp: d.createdAt ? { toDate: () => new Date(d.createdAt) } : null,
          technicianName: d.technicianName || 'Lab Tech'
        };
      }) as LabResult[];
      setLabResults(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'labTests');
    });

    return () => {
      unsubVitals();
      unsubLabs();
    };
  }, []);

  const filteredVitals = vitals.filter(v => 
    v.patientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLabs = labResults.filter(l => 
    l.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.testName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Header */}
      <div className="p-8 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Clinical Board</h1>
            <p className="text-slate-500 font-medium">Real-time patient vitals and lab results across the facility</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Search patient or test..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 pr-4 py-3 bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded-xl text-sm font-medium w-64 transition-all outline-none"
              />
            </div>
            <button className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto w-full px-8 mt-8">
        <div className="flex p-1.5 bg-slate-100 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab('vitals')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === 'vitals' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Activity className="w-4 h-4" />
            Patient Vitals
          </button>
          <button
            onClick={() => setActiveTab('labs')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === 'labs' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <FlaskConical className="w-4 h-4" />
            Lab Results
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'vitals' ? (
              <motion.div
                key="vitals"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                {filteredVitals.map((record) => (
                  <div key={record.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                          <User className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{record.patientName}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                            <Clock className="w-3 h-3" />
                            {record.timestamp?.toDate ? format(record.timestamp.toDate(), 'MMM d, h:mm a') : 'Just now'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recorded By</span>
                        <p className="text-xs font-bold text-slate-600">{record.recordedBy}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-red-50/50 rounded-xl border border-red-100/50">
                        <div className="flex items-center gap-2 text-red-600 mb-1">
                          <Thermometer className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Temp</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{record.vitals.temp}°C</p>
                      </div>
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                        <div className="flex items-center gap-2 text-blue-600 mb-1">
                          <Heart className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">BP</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{record.vitals.bp}</p>
                      </div>
                      <div className="p-3 bg-orange-50/50 rounded-xl border border-orange-100/50">
                        <div className="flex items-center gap-2 text-orange-600 mb-1">
                          <Activity className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Pulse</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{record.vitals.pulse} bpm</p>
                      </div>
                      <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100/50">
                        <div className="flex items-center gap-2 text-teal-600 mb-1">
                          <Wind className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Resp</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{record.vitals.resp}</p>
                      </div>
                      <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                        <div className="flex items-center gap-2 text-indigo-600 mb-1">
                          <Droplets className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">SpO2</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{record.vitals.spo2}%</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2 text-slate-600 mb-1">
                          <FileText className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Weight</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{record.vitals.weight}kg</p>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="labs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {filteredLabs.map((result) => (
                  <div key={result.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                        <FlaskConical className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-bold text-slate-900">{result.patientName}</h3>
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                            result.status === 'completed' ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                          )}>
                            {result.status}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-blue-600">{result.testName}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                            <Calendar className="w-3.5 h-3.5" />
                            {result.timestamp?.toDate ? format(result.timestamp.toDate(), 'MMM d, yyyy') : 'Today'}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                            <User className="w-3.5 h-3.5" />
                            {result.technicianName}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Result</span>
                        <p className="text-lg font-bold text-slate-900">{result.result || 'Pending...'}</p>
                      </div>
                      <button className="p-3 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {((activeTab === 'vitals' && filteredVitals.length === 0) || (activeTab === 'labs' && filteredLabs.length === 0)) && !loading && (
            <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No records found</h3>
              <p className="text-slate-500">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
