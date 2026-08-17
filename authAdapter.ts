import { supabase } from './supabase';

export interface SupabaseUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId?: string | null;
  providerData: Array<{ providerId: string; displayName: string | null; email: string | null; photoUrl: string | null }>;
}

const mapUser = (user: any): SupabaseUser | null => user ? ({
  uid: user.id,
  email: user.email ?? null,
  displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
  photoURL: user.user_metadata?.avatar_url ?? null,
  emailVerified: !!user.email_confirmed_at,
  isAnonymous: false,
  tenantId: null,
  providerData: (user.identities || []).map((i: any) => ({
    providerId: i.provider || 'email',
    displayName: user.user_metadata?.full_name ?? null,
    email: user.email ?? null,
    photoUrl: user.user_metadata?.avatar_url ?? null,
  })),
}) : null;

export const auth = {};
export type User = SupabaseUser;

export const onAuthStateChanged = (_auth: typeof auth, callback: (user: SupabaseUser | null) => void) => {
  let active = true;
  supabase.auth.getSession().then(({ data }) => {
    if (active) callback(mapUser(data.session?.user));
  });
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    if (active) callback(mapUser(session?.user));
  });
  return () => { active = false; listener.subscription.unsubscribe(); };
};

export const signInWithEmailAndPassword = async (_auth: typeof auth, email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw Object.assign(error, { code: error.code || 'auth/error' });
  return { user: mapUser(data.user)! };
};

export const signOut = async (_auth: typeof auth) => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const updatePassword = async (_user: SupabaseUser, newPassword: string) => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

export class EmailAuthProvider {
  static credential(email: string, password: string) { return { email, password }; }
}

export const reauthenticateWithCredential = async (_user: SupabaseUser, credential: { email: string; password: string }) => {
  const { error } = await supabase.auth.signInWithPassword(credential);
  if (error) throw Object.assign(error, { code: 'auth/wrong-password' });
};

export const createUserWithEmailAndPassword = async (_auth: typeof auth, email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Unable to create user');
  return { user: mapUser(data.user)! };
};
