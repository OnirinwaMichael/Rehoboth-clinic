import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) throw new Error('Unauthenticated');

    const { data: callerProfile } = await admin.from('users').select('role,status').eq('id', caller.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'CMD' || callerProfile.status !== 'active') throw new Error('CMD authorization required');

    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || 'Doctor');
    const photoURL = body.photoURL ? String(body.photoURL) : null;
    const allowedRoles = ['CMD','Doctor','Nurse','Lab','Accountant','Receptionist','Pharmacy'];
    if (!name || !email || !allowedRoles.includes(role)) throw new Error('Invalid staff data');

    const { data: existing } = await admin.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) throw new Error('A staff member with this email already exists.');

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name, clinic_role: role }
    });
    if (inviteError || !invited.user) throw inviteError || new Error('Invitation failed');

    const { error: profileError } = await admin.from('users').insert({
      id: invited.user.id,
      email,
      role,
      name,
      status: 'invited',
      photo_url: photoURL,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({ user: { id: invited.user.id, email } }), {
      headers: { ...cors, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...cors, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});
