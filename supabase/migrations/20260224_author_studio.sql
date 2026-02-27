create extension if not exists pgcrypto;

create table if not exists public.author_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text not null default 'Auteur',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.author_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text not null,
  synopsis text not null default '',
  schema_version text not null default '1.0.0',
  payload jsonb not null,
  editing_lock_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.author_project_access (
  project_id uuid not null references public.author_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null check (access_level in ('read', 'write', 'owner')),
  granted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.author_project_logs (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.author_projects(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists author_project_access_user_idx
  on public.author_project_access(user_id);
create index if not exists author_project_logs_project_idx
  on public.author_project_logs(project_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_author_profiles_updated_at on public.author_profiles;
create trigger set_author_profiles_updated_at
before update on public.author_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_author_projects_updated_at on public.author_projects;
create trigger set_author_projects_updated_at
before update on public.author_projects
for each row execute function public.set_updated_at();

drop trigger if exists set_author_project_access_updated_at on public.author_project_access;
create trigger set_author_project_access_updated_at
before update on public.author_project_access
for each row execute function public.set_updated_at();

create or replace function public.is_project_owner(project_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.author_projects p
    where p.id = project_uuid and p.owner_id = auth.uid()
  );
$$;

create or replace function public.project_access_level(project_uuid uuid)
returns text
language sql
stable
as $$
  select case
    when exists(
      select 1 from public.author_projects p
      where p.id = project_uuid and p.owner_id = auth.uid()
    ) then 'owner'
    else coalesce(
      (
        select a.access_level
        from public.author_project_access a
        where a.project_id = project_uuid and a.user_id = auth.uid()
        limit 1
      ),
      'none'
    )
  end;
$$;

create or replace function public.can_read_project(project_uuid uuid)
returns boolean
language sql
stable
as $$
  select public.project_access_level(project_uuid) in ('owner', 'write', 'read');
$$;

create or replace function public.can_write_project(project_uuid uuid)
returns boolean
language sql
stable
as $$
  select public.project_access_level(project_uuid) in ('owner', 'write');
$$;

create or replace function public.bootstrap_project_owner_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.author_project_access (
    project_id,
    user_id,
    access_level,
    granted_by
  ) values (
    new.id,
    new.owner_id,
    'owner',
    new.owner_id
  )
  on conflict (project_id, user_id)
  do update set
    access_level = 'owner',
    granted_by = excluded.granted_by,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists set_project_owner_access on public.author_projects;
create trigger set_project_owner_access
after insert on public.author_projects
for each row execute function public.bootstrap_project_owner_access();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.author_profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Auteur'
    )
  )
  on conflict (user_id)
  do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.author_profiles enable row level security;
alter table public.author_projects enable row level security;
alter table public.author_project_access enable row level security;
alter table public.author_project_logs enable row level security;

drop policy if exists author_profiles_select on public.author_profiles;
create policy author_profiles_select
on public.author_profiles
for select
to authenticated
using (true);

drop policy if exists author_profiles_insert_self on public.author_profiles;
create policy author_profiles_insert_self
on public.author_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists author_profiles_update_self on public.author_profiles;
create policy author_profiles_update_self
on public.author_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists author_projects_select on public.author_projects;
create policy author_projects_select
on public.author_projects
for select
to authenticated
using (public.can_read_project(id));

drop policy if exists author_projects_insert on public.author_projects;
create policy author_projects_insert
on public.author_projects
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists author_projects_update on public.author_projects;
create policy author_projects_update
on public.author_projects
for update
to authenticated
using (public.can_write_project(id))
with check (public.can_write_project(id));

drop policy if exists author_projects_delete on public.author_projects;
create policy author_projects_delete
on public.author_projects
for delete
to authenticated
using (public.is_project_owner(id));

drop policy if exists author_project_access_select on public.author_project_access;
create policy author_project_access_select
on public.author_project_access
for select
to authenticated
using (public.can_read_project(project_id));

drop policy if exists author_project_access_insert on public.author_project_access;
create policy author_project_access_insert
on public.author_project_access
for insert
to authenticated
with check (
  public.is_project_owner(project_id)
  and granted_by = auth.uid()
  and access_level in ('read', 'write', 'owner')
);

drop policy if exists author_project_access_update on public.author_project_access;
create policy author_project_access_update
on public.author_project_access
for update
to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists author_project_access_delete on public.author_project_access;
create policy author_project_access_delete
on public.author_project_access
for delete
to authenticated
using (public.is_project_owner(project_id));

drop policy if exists author_project_logs_select on public.author_project_logs;
create policy author_project_logs_select
on public.author_project_logs
for select
to authenticated
using (public.can_read_project(project_id));

drop policy if exists author_project_logs_insert on public.author_project_logs;
create policy author_project_logs_insert
on public.author_project_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and public.can_write_project(project_id)
);
