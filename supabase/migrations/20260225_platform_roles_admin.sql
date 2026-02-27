-- Platform-wide roles (admin / author)
-- Admin can see and administrate all projects and users.

alter table public.author_profiles
  add column if not exists platform_role text not null default 'author';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'author_profiles_platform_role_check'
  ) then
    alter table public.author_profiles
      add constraint author_profiles_platform_role_check
      check (platform_role in ('admin', 'author'));
  end if;
end;
$$;

create index if not exists author_profiles_platform_role_idx
  on public.author_profiles (platform_role);

-- Seed one admin if none exists (oldest profile).
do $$
begin
  if not exists (
    select 1
    from public.author_profiles
    where platform_role = 'admin'
  ) then
    update public.author_profiles ap
    set platform_role = 'admin',
        updated_at = now()
    where ap.user_id = (
      select p.user_id
      from public.author_profiles p
      order by p.created_at asc
      limit 1
    );
  end if;
end;
$$;

create or replace function public.is_platform_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.author_profiles ap
    where ap.user_id = target_user
      and ap.platform_role = 'admin'
  );
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated;

create or replace function public.project_owner_matches_auth(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.author_projects p
      where p.id = project_uuid
        and p.owner_id = auth.uid()
    );
$$;

create or replace function public.project_access_matches_auth(
  project_uuid uuid,
  accepted_levels text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.author_project_access a
      where a.project_id = project_uuid
        and a.user_id = auth.uid()
        and a.access_level = any(accepted_levels)
    );
$$;

grant execute on function public.project_owner_matches_auth(uuid) to authenticated;
grant execute on function public.project_access_matches_auth(uuid, text[]) to authenticated;

drop policy if exists author_projects_delete on public.author_projects;
create policy author_projects_delete
on public.author_projects
for delete
to authenticated
using (
  owner_id = auth.uid()
  or public.is_platform_admin(auth.uid())
);

create or replace function public.platform_list_profiles()
returns table (
  user_id uuid,
  email text,
  display_name text,
  platform_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ap.user_id, ap.email, ap.display_name, ap.platform_role, ap.created_at
  from public.author_profiles ap
  where public.is_platform_admin(auth.uid())
  order by ap.created_at asc;
$$;

grant execute on function public.platform_list_profiles() to authenticated;

create or replace function public.platform_set_profile_role(target_user uuid, next_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  is_target_admin boolean := false;
  admins_count integer := 0;
begin
  if requester is null then
    return false;
  end if;

  if not public.is_platform_admin(requester) then
    return false;
  end if;

  if next_role not in ('admin', 'author') then
    return false;
  end if;

  if not exists (
    select 1
    from public.author_profiles ap
    where ap.user_id = target_user
  ) then
    return false;
  end if;

  select exists (
    select 1
    from public.author_profiles ap
    where ap.user_id = target_user
      and ap.platform_role = 'admin'
  )
  into is_target_admin;

  if is_target_admin and next_role = 'author' then
    select count(*)
    into admins_count
    from public.author_profiles ap
    where ap.platform_role = 'admin';

    if admins_count <= 1 then
      return false;
    end if;
  end if;

  update public.author_profiles ap
  set platform_role = next_role,
      updated_at = now()
  where ap.user_id = target_user;

  return found;
end;
$$;

grant execute on function public.platform_set_profile_role(uuid, text) to authenticated;
