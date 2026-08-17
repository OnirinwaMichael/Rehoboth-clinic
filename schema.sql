-- Rehoboth Clinic HMS — Supabase/PostgreSQL foundation
-- Security baseline inspired by WHO digital-health assessment domains:
-- privacy/security, patient safety, interoperability readiness, auditability and maintainability.

create extension if not exists pgcrypto;

create type public.user_role as enum ('CMD','Doctor','Nurse','Lab','Accountant','Receptionist','Pharmacy');
create type public.user_status as enum ('active','inactive','invited');

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.user_role not null,
  name text not null,
  status public.user_status not null default 'invited',
  photo_url text,
  phone text,
  last_updated timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  card_id text primary key,
  name text not null,
  gender text not null check (gender in ('male','female')),
  dob date not null,
  state_of_origin text,
  age integer check (age >= 0 and age <= 150),
  occupation text,
  address text,
  phone text,
  next_of_kin text,
  relationship text,
  nok_address text,
  nok_phone text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete restrict,
  staff_id uuid references public.users(id) on delete restrict,
  blood_pressure text,
  temperature text,
  sugar_level text,
  diagnosis text,
  prescriptions jsonb not null default '[]'::jsonb,
  recommended_tests jsonb not null default '[]'::jsonb,
  admission_recommended boolean default false,
  c_section_recommended boolean default false,
  payment_fee numeric(12,2),
  payment_status text check (payment_status in ('pending','paid')),
  dispensed boolean default false,
  dispensed_at timestamptz,
  dispensed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete restrict,
  timestamp timestamptz not null default now(),
  diagnosis text,
  lab_results text,
  structured_lab_note text,
  prescription text,
  prescription_note text,
  billing_amount numeric(12,2) default 0,
  payment_status text check (payment_status in ('pending','paid')),
  staff_id uuid references public.users(id) on delete restrict
);

create table if not exists public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete restrict,
  record_id uuid references public.medical_records(id) on delete set null,
  test_type text not null,
  price numeric(12,2),
  result text,
  structured_results jsonb,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  created_at timestamptz not null default now()
);

create table if not exists public.financials (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete restrict,
  total_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  pending_amount numeric(12,2) not null default 0,
  payment_status text not null check (payment_status in ('fully paid','partially paid')),
  payment_method text not null check (payment_method in ('cash','bank transfer')),
  reconciled boolean default false,
  reconciled_at timestamptz,
  reconciled_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null default 0,
  stock integer not null default 0 check (stock >= 0),
  category text,
  last_updated timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete restrict,
  patient_name text not null,
  doctor_id uuid references public.users(id),
  doctor_name text,
  date date not null,
  time time not null,
  reason text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','rescheduled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null check (category in ('salaries','utilities','supplies','maintenance','others')),
  staff_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.users(id),
  action text not null,
  details text not null,
  timestamp timestamptz not null default now(),
  ip_hash text,
  user_agent text
);

create table if not exists public.counters (
  id text primary key,
  current bigint not null default 0
);

create table if not exists public.health_checks (
  id text primary key,
  status text not null default 'ok',
  checked_at timestamptz not null default now()
);

create or replace function public.next_patient_card_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare next_id bigint;
begin
  if not public.is_staff() or public.current_staff_role() not in ('CMD','Receptionist') then
    raise exception 'Not authorized';
  end if;
  insert into public.counters(id,current) values ('patientCardId',0)
  on conflict (id) do nothing;
  update public.counters set current = current + 1 where id='patientCardId' returning current into next_id;
  return lpad(next_id::text,6,'0');
end;
$$;

revoke all on function public.next_patient_card_id() from public, anon;
grant execute on function public.next_patient_card_id() to authenticated;

insert into public.health_checks(id,status) values ('system','ok') on conflict (id) do nothing;

-- Patient safety / governance foundations.
create table if not exists public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  allergen text not null,
  reaction text,
  severity text,
  recorded_by uuid references public.users(id),
  recorded_at timestamptz not null default now()
);

create table if not exists public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  consent_type text not null,
  status text not null check (status in ('granted','withdrawn','pending')),
  recorded_by uuid references public.users(id),
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

-- Interoperability-ready identifiers and FHIR-style resource metadata.
create table if not exists public.fhir_resource_links (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  local_id text not null,
  fhir_id text not null,
  version integer not null default 1,
  last_updated timestamptz not null default now(),
  unique(resource_type, local_id),
  unique(resource_type, fhir_id)
);

-- Prevent accidental audit tampering: audit rows are append-only.
create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Audit logs are immutable';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update or delete on public.audit_logs
for each row execute function public.prevent_audit_mutation();

-- Updated-at helper.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists patients_updated_at on public.patients;
create trigger patients_updated_at before update on public.patients for each row execute function public.set_updated_at();

drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();

-- Helper for role-aware policies. Authorization lives in a table, not user-editable metadata.
create or replace function public.current_staff_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users where id = auth.uid() and status = 'active');
$$;

create or replace function public.has_role(required_role public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_staff_role() = required_role;
$$;

-- Security hardening: role helper functions are callable only by authenticated users.
-- They are SECURITY DEFINER functions and must not remain executable by anon/public.
revoke all on function public.current_staff_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.has_role(public.user_role) from public, anon;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.has_role(public.user_role) to authenticated;

-- RLS everywhere exposed to the client.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename in
    ('users','patients','medical_records','visits','lab_tests','financials','inventory','appointments','expenses','audit_logs','counters','health_checks','patient_allergies','patient_consents','fhir_resource_links')
  loop execute format('alter table public.%I enable row level security', r.tablename); end loop;
end $$;

-- Drop old policies if this script is re-run.
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in
    ('users','patients','medical_records','visits','lab_tests','financials','inventory','appointments','expenses','audit_logs','counters','health_checks','patient_allergies','patient_consents','fhir_resource_links')
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

-- Staff directory: authenticated active staff can read; only CMD manages accounts.
create policy users_select_staff on public.users for select to authenticated using (public.is_staff());
create policy users_insert_cmd on public.users for insert to authenticated with check (public.has_role('CMD'));
create policy users_update_cmd_or_self on public.users for update to authenticated
using (public.has_role('CMD') or id = auth.uid())
with check (public.has_role('CMD') or id = auth.uid());
create policy users_delete_cmd on public.users for delete to authenticated using (public.has_role('CMD') and id <> auth.uid());

-- Patient demographics are operationally needed across departments, but mutations are restricted.
create policy patients_select_staff on public.patients for select to authenticated using (public.is_staff());
create policy patients_insert_frontdesk on public.patients for insert to authenticated with check (public.current_staff_role() in ('CMD','Receptionist'));
create policy patients_update_frontdesk on public.patients for update to authenticated using (public.current_staff_role() in ('CMD','Receptionist')) with check (public.current_staff_role() in ('CMD','Receptionist'));
create policy patients_delete_cmd on public.patients for delete to authenticated using (public.has_role('CMD'));

-- Clinical records: clinical roles have full access; pharmacy sees medication-related records; finance sees billing fields through the app's scoped queries.
create policy medical_records_select on public.medical_records for select to authenticated using (public.current_staff_role() in ('CMD','Doctor','Nurse','Pharmacy','Accountant'));
create policy medical_records_insert_clinical on public.medical_records for insert to authenticated with check (public.current_staff_role() in ('CMD','Doctor','Nurse'));
create policy medical_records_update_clinical on public.medical_records for update to authenticated using (public.current_staff_role() in ('CMD','Doctor','Nurse','Pharmacy','Accountant')) with check (public.current_staff_role() in ('CMD','Doctor','Nurse','Pharmacy','Accountant'));
create policy medical_records_delete_cmd on public.medical_records for delete to authenticated using (public.has_role('CMD'));

create policy visits_select_staff on public.visits for select to authenticated using (public.is_staff());
create policy visits_insert_clinical on public.visits for insert to authenticated with check (public.current_staff_role() in ('CMD','Doctor','Nurse'));
create policy visits_update_clinical on public.visits for update to authenticated using (public.current_staff_role() in ('CMD','Doctor','Nurse','Pharmacy','Accountant')) with check (public.current_staff_role() in ('CMD','Doctor','Nurse','Pharmacy','Accountant'));
create policy visits_delete_cmd on public.visits for delete to authenticated using (public.has_role('CMD'));

create policy lab_select_lab_or_clinical on public.lab_tests for select to authenticated using (public.current_staff_role() in ('CMD','Lab','Doctor','Nurse','Accountant','Pharmacy'));
create policy lab_insert_lab_or_clinical on public.lab_tests for insert to authenticated with check (public.current_staff_role() in ('CMD','Lab','Doctor','Nurse'));
create policy lab_update_lab_or_finance on public.lab_tests for update to authenticated using (public.current_staff_role() in ('CMD','Lab','Accountant')) with check (public.current_staff_role() in ('CMD','Lab','Accountant'));
create policy lab_delete_cmd on public.lab_tests for delete to authenticated using (public.has_role('CMD'));

create policy financials_select_finance on public.financials for select to authenticated using (public.current_staff_role() in ('CMD','Accountant'));
create policy financials_insert_finance on public.financials for insert to authenticated with check (public.current_staff_role() in ('CMD','Accountant'));
create policy financials_update_finance on public.financials for update to authenticated using (public.current_staff_role() in ('CMD','Accountant')) with check (public.current_staff_role() in ('CMD','Accountant'));
create policy financials_delete_cmd on public.financials for delete to authenticated using (public.has_role('CMD'));

create policy inventory_select_pharmacy on public.inventory for select to authenticated using (public.current_staff_role() in ('CMD','Pharmacy','Accountant'));
create policy inventory_write_pharmacy on public.inventory for insert to authenticated with check (public.current_staff_role() in ('CMD','Pharmacy'));
create policy inventory_update_pharmacy on public.inventory for update to authenticated using (public.current_staff_role() in ('CMD','Pharmacy')) with check (public.current_staff_role() in ('CMD','Pharmacy'));
create policy inventory_delete_cmd on public.inventory for delete to authenticated using (public.has_role('CMD'));

create policy appointments_select_staff on public.appointments for select to authenticated using (public.is_staff());
create policy appointments_insert_frontdesk on public.appointments for insert to authenticated with check (public.current_staff_role() in ('CMD','Receptionist'));
create policy appointments_update_frontdesk_or_clinical on public.appointments for update to authenticated using (public.current_staff_role() in ('CMD','Receptionist','Doctor','Nurse')) with check (public.current_staff_role() in ('CMD','Receptionist','Doctor','Nurse'));
create policy appointments_delete_cmd on public.appointments for delete to authenticated using (public.has_role('CMD'));

create policy expenses_select_finance on public.expenses for select to authenticated using (public.current_staff_role() in ('CMD','Accountant'));
create policy expenses_insert_finance on public.expenses for insert to authenticated with check (public.current_staff_role() in ('CMD','Accountant'));
create policy expenses_delete_finance on public.expenses for delete to authenticated using (public.current_staff_role() in ('CMD','Accountant'));

-- Audit logs: staff may append through the app; nobody can update/delete.
create policy audit_insert_staff on public.audit_logs for insert to authenticated with check (public.is_staff() and (staff_id = auth.uid() or staff_id is null));
create policy audit_select_cmd on public.audit_logs for select to authenticated using (public.has_role('CMD'));

create policy counters_select_staff on public.counters for select to authenticated using (public.is_staff());
create policy counters_write_cmd on public.counters for insert to authenticated with check (public.has_role('CMD'));
create policy health_check_select_staff on public.health_checks for select to authenticated using (public.is_staff());

create policy counters_update_cmd on public.counters for update to authenticated using (public.has_role('CMD')) with check (public.has_role('CMD'));

create policy allergy_select_clinical on public.patient_allergies for select to authenticated using (public.current_staff_role() in ('CMD','Doctor','Nurse','Pharmacy'));
create policy allergy_insert_clinical on public.patient_allergies for insert to authenticated with check (public.current_staff_role() in ('CMD','Doctor','Nurse'));
create policy consent_select_staff on public.patient_consents for select to authenticated using (public.is_staff());
create policy consent_insert_staff on public.patient_consents for insert to authenticated with check (public.is_staff());
create policy consent_update_cmd on public.patient_consents for update to authenticated using (public.has_role('CMD')) with check (public.has_role('CMD'));

create policy fhir_links_select_cmd on public.fhir_resource_links for select to authenticated using (public.has_role('CMD'));

-- Indexes for RLS/query performance.
create index if not exists idx_users_role_status on public.users(role,status);
create index if not exists idx_patients_created_at on public.patients(created_at desc);
create index if not exists idx_medical_records_patient on public.medical_records(patient_id,created_at desc);
create index if not exists idx_medical_records_staff on public.medical_records(staff_id,created_at desc);
create index if not exists idx_visits_patient on public.visits(patient_id,timestamp desc);
create index if not exists idx_lab_tests_patient on public.lab_tests(patient_id,created_at desc);
create index if not exists idx_financials_patient on public.financials(patient_id,created_at desc);
create index if not exists idx_appointments_date_time on public.appointments(date,time);
create index if not exists idx_audit_logs_timestamp on public.audit_logs(timestamp desc);
create index if not exists idx_inventory_name on public.inventory(name);

-- Health-system audit protection and interoperability metadata are intentionally append-only from the client.
revoke update, delete on public.audit_logs from authenticated;
