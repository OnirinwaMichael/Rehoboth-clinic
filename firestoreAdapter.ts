import { supabase } from './supabase';

export const serverTimestamp = () => new Date().toISOString();

const camelToSnake = (key: string) => key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
const snakeToCamel = (key: string) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const TABLE_MAP: Record<string, string> = {
  users: 'users', patients: 'patients', medicalRecords: 'medical_records', labTests: 'lab_tests',
  financials: 'financials', inventory: 'inventory', auditLogs: 'audit_logs', visits: 'visits',
  appointments: 'appointments', expenses: 'expenses', counters: 'counters', health_checks: 'health_checks'
};

const tableFor = (path: string) => TABLE_MAP[path.split('/')[0]] || path.split('/')[0];
const idColumnFor = (table: string) => table === 'patients' ? 'card_id' : 'id';

const normalizePayload = (table: string, payload: any, explicitId?: string) => {
  const out = { ...payload };
  if (table === 'users' && out.uid) { out.id = out.uid; delete out.uid; }
  if (table === 'patients' && out.cardId) { out.card_id = out.cardId; delete out.cardId; }
  if (explicitId) out[idColumnFor(table)] = explicitId;
  return out;
};

const encode = (value: any): any => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [camelToSnake(k), encode(v)]));
  return value;
};
const decode = (value: any): any => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [snakeToCamel(k), decode(v)]));
  return value;
};

export const db = {};

export type DocRef = { table: string; id: string; path: string };
export type CollectionRef = { table: string; path: string; nestedPatientId?: string };
export type QueryConstraint = { kind: 'where'|'orderBy'|'limit'; field?: string; op?: string; value?: any; direction?: 'asc'|'desc'; count?: number };
export type QueryRef = CollectionRef & { constraints: QueryConstraint[] };

export const doc = (_db: any, ...segments: string[]): DocRef => {
  const path = segments.join('/');
  const parts = path.split('/');
  const table = tableFor(path);
  return { table, id: parts[parts.length - 1], path };
};

export const collection = (_db: any, path: string): CollectionRef => {
  const parts = path.split('/');
  if (parts.length >= 3 && parts[0] === 'patients' && parts[2] === 'visits') {
    return { table: 'visits', path, nestedPatientId: parts[1] };
  }
  return { table: tableFor(path), path };
};

export const collectionGroup = (_db: any, name: string): CollectionRef => ({ table: tableFor(name), path: name });
export const where = (field: string, op: string, value: any): QueryConstraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, direction: 'asc'|'desc' = 'asc'): QueryConstraint => ({ kind: 'orderBy', field, direction });
export const limit = (count: number): QueryConstraint => ({ kind: 'limit', count });
export const query = (ref: CollectionRef, ...constraints: QueryConstraint[]): QueryRef => ({ ...ref, constraints });

const applyConstraints = (builder: any, constraints: QueryConstraint[], table: string) => {
  let q = builder;
  for (const c of constraints) {
    if (c.kind === 'where') {
      const field = camelToSnake(c.field!);
      if (c.op === '==') q = q.eq(field, c.value);
      else if (c.op === '!=') q = q.neq(field, c.value);
      else if (c.op === '>') q = q.gt(field, c.value);
      else if (c.op === '>=') q = q.gte(field, c.value);
      else if (c.op === '<') q = q.lt(field, c.value);
      else if (c.op === '<=') q = q.lte(field, c.value);
      else q = q.eq(field, c.value);
    } else if (c.kind === 'orderBy') {
      q = q.order(camelToSnake(c.field!), { ascending: c.direction !== 'desc' });
    } else if (c.kind === 'limit') {
      q = q.limit(c.count!);
    }
  }
  return q;
};

const buildQuery = (ref: CollectionRef, constraints: QueryConstraint[] = []) => {
  let q = supabase.from(ref.table).select('*');
  if (ref.nestedPatientId) q = q.eq('patient_id', ref.nestedPatientId);
  return applyConstraints(q, constraints, ref.table);
};

const makeSnapshot = (rows: any[], ref: CollectionRef) => ({
  docs: rows.map(row => {
    const id = ref.table === 'patients' ? row.card_id : row.id;
    return {
      id,
      data: () => { const value = decode(row); if (ref.table === 'users') value.uid = row.id; return value; },
      ref: { table: ref.table, id, path: ref.nestedPatientId ? `patients/${ref.nestedPatientId}/visits/${id}` : `${ref.path}/${id}` }
    };
  }),
  empty: rows.length === 0,
  size: rows.length,
  forEach: (cb: any) => rows.forEach(row => cb({ id: ref.table === 'patients' ? row.card_id : row.id, data: () => decode(row) }))
});

export const getDocs = async (ref: QueryRef | CollectionRef) => {
  const queryRef = 'constraints' in ref ? ref : ({ ...ref, constraints: [] } as QueryRef);
  const { data, error } = await buildQuery(queryRef, queryRef.constraints);
  if (error) throw error;
  return makeSnapshot(data || [], queryRef);
};

export const onSnapshot = (ref: QueryRef | CollectionRef, next: any, error?: any) => {
  const queryRef = 'constraints' in ref ? ref : ({ ...ref, constraints: [] } as QueryRef);
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = async () => {
    if (stopped) return;
    try { next(await getDocs(queryRef)); } catch (e) { error?.(e); }
  };
  run();
  // Re-run after Realtime changes; polling is a safe fallback for deployments where Realtime is not enabled.
  const channel = supabase.channel(`clinic-${queryRef.table}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: queryRef.table }, run)
    .subscribe();
  timer = setInterval(run, 15000);
  return () => { stopped = true; if (timer) clearInterval(timer); supabase.removeChannel(channel); };
};

export const getDoc = async (ref: DocRef) => {
  const { data, error } = await supabase.from(ref.table).select('*').eq(idColumnFor(ref.table), ref.id).maybeSingle();
  if (error) throw error;
  return { exists: () => !!data, id: ref.id, data: () => { if (!data) return undefined; const value = decode(data); if (ref.table === 'users') value.uid = data.id; return value; }, ref };
};

export const getDocFromServer = getDoc;

export const setDoc = async (ref: DocRef, value: any) => {
  const payload = normalizePayload(ref.table, encode(value), ref.id);
  const idColumn = idColumnFor(ref.table);
  const { error } = await supabase.from(ref.table).upsert(payload);
  if (error) throw error;
};

export const addDoc = async (ref: CollectionRef, value: any) => {
  const payload = normalizePayload(ref.table, encode(value));
  if (ref.nestedPatientId) payload.patient_id = ref.nestedPatientId;
  const { data, error } = await supabase.from(ref.table).insert(payload).select().single();
  if (error) throw error;
  const id = ref.table === 'patients' ? data.card_id : data.id;
  return { id, table: ref.table, path: `${ref.path}/${id}` } as DocRef;
};

export const updateDoc = async (ref: DocRef, value: any) => {
  const payload = normalizePayload(ref.table, encode(value));
  const { error } = await supabase.from(ref.table).update(payload).eq(idColumnFor(ref.table), ref.id);
  if (error) throw error;
};

export const deleteDoc = async (ref: DocRef) => {
  const { error } = await supabase.from(ref.table).delete().eq(idColumnFor(ref.table), ref.id);
  if (error) throw error;
};

export const runTransaction = async (_db: any, callback: any) => {
  // Supabase/Postgres transaction boundary is implemented by the RPC used for patient IDs.
  // For compatibility with the existing UI, the adapter exposes a small transactional facade.
  const operations: any[] = [];
  const transaction = {
    get: async (ref: DocRef) => getDoc(ref),
    set: (ref: DocRef, value: any) => operations.push(() => setDoc(ref, value)),
    update: (ref: DocRef, value: any) => operations.push(() => updateDoc(ref, value)),
  };
  const result = await callback(transaction);
  for (const op of operations) await op();
  return result;
};

export const enableIndexedDbPersistence = async () => undefined;
export const terminate = async () => undefined;
