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
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) throw new Error('Unauthenticated');
    const { data: profile } = await admin.from('users').select('role,status').eq('id', user.id).maybeSingle();
    if (!profile || profile.status !== 'active' || !['CMD','Doctor','Nurse'].includes(profile.role)) throw new Error('Clinical authorization required');
    const cardId = new URL(req.url).searchParams.get('cardId');
    if (!cardId) throw new Error('cardId is required');
    const { data: patient, error } = await admin.from('patients').select('*').eq('card_id', cardId).maybeSingle();
    if (error) throw error;
    if (!patient) return new Response(JSON.stringify({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found' }] }), { status: 404, headers: { ...cors, 'Content-Type': 'application/fhir+json' } });
    const fhirPatient = {
      resourceType: 'Patient', id: patient.card_id,
      meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Patient'], lastUpdated: patient.updated_at || patient.created_at },
      identifier: [{ system: 'urn:rehoboth-clinic:patient-card', value: patient.card_id }],
      name: [{ text: patient.name }], gender: patient.gender, birthDate: patient.dob,
      telecom: patient.phone ? [{ system: 'phone', value: patient.phone }] : [],
      address: patient.address ? [{ text: patient.address, state: patient.state_of_origin || undefined }] : [],
      contact: patient.next_of_kin ? [{ name: { text: patient.next_of_kin }, relationship: patient.relationship ? [{ text: patient.relationship }] : [] }] : []
    };
    await admin.from('fhir_resource_links').upsert({ resource_type: 'Patient', local_id: patient.card_id, fhir_id: patient.card_id, last_updated: new Date().toISOString() }, { onConflict: 'resource_type,local_id' });
    return new Response(JSON.stringify(fhirPatient), { status: 200, headers: { ...cors, 'Content-Type': 'application/fhir+json' } });
  } catch (error) {
    return new Response(JSON.stringify({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'forbidden', diagnostics: error instanceof Error ? error.message : String(error) }] }), { status: 403, headers: { ...cors, 'Content-Type': 'application/fhir+json' } });
  }
});
