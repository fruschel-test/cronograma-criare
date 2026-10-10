-- Cronograma Criare: esquema inicial.
-- Execute no SQL Editor do Supabase antes de habilitar o app.
-- Convide usuários pelo painel do Supabase; não habilite cadastro público.

create extension if not exists pgcrypto;

create type public.project_status as enum ('ativo', 'concluido', 'cancelado');
create type public.app_role as enum ('admin', 'editor', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  contract_number text,
  name text not null check (length(trim(name)) > 0),
  responsible_user_id uuid references public.profiles(id) on delete set null,
  status public.project_status not null default 'ativo',
  briefing_date date,
  presentation_date date,
  contract_signed_date date,
  measurement_date date,
  technical_book_due_date date,
  technical_book_revision_date date,
  technical_book_signed_date date,
  delivery_date date,
  assembly_date date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null check (action in ('insert', 'update', 'delete')),
  old_record jsonb,
  new_record jsonb,
  changed_at timestamptz not null default now()
);

create index projects_client_id_idx on public.projects(client_id);
create index projects_status_idx on public.projects(status);
create index projects_delivery_date_idx on public.projects(delivery_date);
create index project_history_project_id_idx on public.project_history(project_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Criar automaticamente um perfil quando uma conta convidada é criada.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'viewer'::public.app_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_app_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid())
  )
$$;

create or replace function public.can_edit_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'editor')
  )
$$;

create or replace function public.log_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.project_history(project_id, actor_user_id, action, new_record)
    values (new.id, auth.uid(), 'insert', to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.project_history(project_id, actor_user_id, action, old_record, new_record)
    values (new.id, auth.uid(), 'update', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.project_history(project_id, actor_user_id, action, old_record)
    values (old.id, auth.uid(), 'delete', to_jsonb(old));
    return old;
  end if;
end;
$$;

create trigger projects_log_change
after insert or update or delete on public.projects
for each row execute function public.log_project_change();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_history enable row level security;

-- Todos os dados são compartilhados entre membros autenticados autorizados.
create policy "members read profiles" on public.profiles
for select to authenticated using (public.is_app_member());

create policy "admins manage profiles" on public.profiles
for update to authenticated using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy "members read clients" on public.clients
for select to authenticated using (public.is_app_member());

create policy "editors manage clients" on public.clients
for insert to authenticated with check (public.can_edit_data());

create policy "editors update clients" on public.clients
for update to authenticated using (public.can_edit_data())
with check (public.can_edit_data());

create policy "admins delete clients" on public.clients
for delete to authenticated using (public.current_app_role() = 'admin');

create policy "members read projects" on public.projects
for select to authenticated using (public.is_app_member());

create policy "editors create projects" on public.projects
for insert to authenticated with check (public.can_edit_data());

create policy "editors update projects" on public.projects
for update to authenticated using (public.can_edit_data())
with check (public.can_edit_data());

create policy "admins delete projects" on public.projects
for delete to authenticated using (public.current_app_role() = 'admin');

create policy "members read project history" on public.project_history
for select to authenticated using (public.is_app_member());

-- Nenhuma policy de escrita para project_history: somente o trigger registra eventos.
-- Usuários sem perfil (não convidados/provisionados) não podem ler nem alterar dados.

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clients, public.projects to authenticated;
grant select on public.profiles, public.project_history to authenticated;
grant usage, select on sequence public.project_history_id_seq to authenticated;

-- IMPORTANTE: depois de convidar o primeiro usuário, promova-o a admin usando:
-- update public.profiles set role = 'admin' where id = 'UUID_DO_USUARIO';
-- Execute como administrador do banco no SQL Editor, substituindo o UUID.
