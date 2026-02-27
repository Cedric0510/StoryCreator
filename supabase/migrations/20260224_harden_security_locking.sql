-- Security hardening + scalable cloud locking
-- Apply after:
-- - 20260224_author_studio.sql
-- - 20260224_fix_rls_stack_depth.sql

create unique index if not exists author_profiles_email_lower_uidx
  on public.author_profiles ((lower(email)))
  where email is not null;

create index if not exists author_projects_owner_updated_idx
  on public.author_projects (owner_id, updated_at desc);

create index if not exists author_projects_updated_idx
  on public.author_projects (updated_at desc);

create index if not exists author_projects_lock_idx
  on public.author_projects (editing_lock_user_id)
  where editing_lock_user_id is not null;

create or replace function public.project_member_profiles(project_uuid uuid)
returns table (
  user_id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select (
      public.project_owner_matches_auth(project_uuid)
      or public.project_access_matches_auth(
        project_uuid,
        array['owner', 'write', 'read']::text[]
      )
    ) as ok
  ),
  member_ids as (
    select p.owner_id as user_id
    from public.author_projects p
    where p.id = project_uuid
    union
    select a.user_id
    from public.author_project_access a
    where a.project_id = project_uuid
  )
  select ap.user_id, ap.email, ap.display_name
  from public.author_profiles ap
  join member_ids m on m.user_id = ap.user_id
  cross join allowed
  where allowed.ok;
$$;

grant execute on function public.project_member_profiles(uuid) to authenticated;

create or replace function public.project_resolve_user_by_email(
  project_uuid uuid,
  target_email text
)
returns table (
  user_id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select public.project_owner_matches_auth(project_uuid) as ok
  ),
  normalized as (
    select nullif(lower(trim(target_email)), '') as email
  )
  select ap.user_id, ap.email, ap.display_name
  from public.author_profiles ap
  cross join allowed
  cross join normalized
  where allowed.ok
    and normalized.email is not null
    and ap.email is not null
    and lower(ap.email) = normalized.email
  limit 1;
$$;

grant execute on function public.project_resolve_user_by_email(uuid, text) to authenticated;

create or replace function public.acquire_project_lock(
  project_uuid uuid,
  force_takeover boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  current_owner uuid;
  current_lock uuid;
  can_write boolean;
begin
  if requester is null then
    return false;
  end if;

  select p.owner_id, p.editing_lock_user_id
  into current_owner, current_lock
  from public.author_projects p
  where p.id = project_uuid
  for update;

  if not found then
    return false;
  end if;

  can_write := (
    requester = current_owner
    or public.project_access_matches_auth(project_uuid, array['owner', 'write']::text[])
  );

  if not can_write then
    return false;
  end if;

  if current_lock is null or current_lock = requester then
    update public.author_projects
    set editing_lock_user_id = requester
    where id = project_uuid;
    return true;
  end if;

  if force_takeover and requester = current_owner then
    update public.author_projects
    set editing_lock_user_id = requester
    where id = project_uuid;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.acquire_project_lock(uuid, boolean) to authenticated;

create or replace function public.release_project_lock(
  project_uuid uuid,
  force_release boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  current_owner uuid;
  current_lock uuid;
begin
  if requester is null then
    return false;
  end if;

  select p.owner_id, p.editing_lock_user_id
  into current_owner, current_lock
  from public.author_projects p
  where p.id = project_uuid
  for update;

  if not found then
    return false;
  end if;

  if current_lock is null then
    return true;
  end if;

  if current_lock = requester then
    update public.author_projects
    set editing_lock_user_id = null
    where id = project_uuid;
    return true;
  end if;

  if force_release and requester = current_owner then
    update public.author_projects
    set editing_lock_user_id = null
    where id = project_uuid;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.release_project_lock(uuid, boolean) to authenticated;

drop policy if exists author_profiles_select on public.author_profiles;
create policy author_profiles_select
on public.author_profiles
for select
to authenticated
using (auth.uid() = user_id);
