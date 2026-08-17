import { supabase } from './lib/supabase';
import { auth } from './lib/authAdapter';
import { db, getDoc, doc } from './lib/firestoreAdapter';

export { auth, db };

export enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: { userId?: string; email?: string | null; emailVerified?: boolean; isAnonymous?: boolean; tenantId?: string | null; providerInfo: any[] };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { providerInfo: [] }, operationType, path
  };
  console.error('Supabase data error:', JSON.stringify(errInfo));
  throw error instanceof Error ? error : new Error(String(error));
}

export const checkSystemHealth = async () => {
  const status = { auth: false, firestore: false, online: navigator.onLine };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    status.auth = !!session;
    const health = await getDoc(doc(db, 'health_checks', 'system'));
    status.firestore = health.exists();
  } catch (error) {
    console.error('Supabase health check failed:', error);
  }
  return status;
};
