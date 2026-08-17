import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await caller.auth.getUser();
    if (error || !user || !user.email) throw new Error('Not authorized to bootstrap CMD');
    const { data: allowlisted } = await admin.from('portfolio_admin_allowlist').select('email').eq('email', user.email.toLowerCase()).maybeSingle();
    if (!allowlisted) throw new Error('Not authorized to bootstrap CMD');
    const { data: existing } = await admin.from('users').select('*').eq('id', user.id).maybeSingle();
    if (existing) return new Response(JSON.stringify(existing), { headers: { ...cors, 'Content-Type': 'application/json' } });
    const profile = { id: user.id, email: user.email.toLowerCase(), role: 'CMD', name: user.user_metadata?.full_name || user.user_metadata?.name || 'Clinic CMD', status: 'active' };
    const { data: created, error: insertError } = await admin.from('users').insert(profile).select().single();
    if (insertError) throw insertError;
    return new Response(JSON.stringify(created), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
