-- Reader by default + security hardening for production beta
-- Apply after:
-- - 20260224_author_studio.sql
-- - 20260224_fix_rls_stack_depth.sql
-- - 20260224_storage_assets.sql
-- - 20260224_harden_security_locking.sql
-- - 20260225_platform_roles_admin.sql

alter table public.author_profiles
  alter column platform_role set default 'reader';

do $$
begin
  alter table public.author_profiles
    drop constraint if exists author_profiles_platform_role_check;

  alter table public.author_profiles
    add constraint author_profiles_platform_role_check
    check (platform_role in ('admin', 'author', 'reader'));
end;
$$;

update public.author_profiles
set platform_role = 'reader',
    updated_at = now()
where platform_role is null
   or platform_role not in ('admin', 'author', 'reader');

create or replace function public.can_use_author_tools(target_user uuid default auth.uid())
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
      and ap.platform_role in ('admin', 'author')
  );
$$;

grant execute on function public.can_use_author_tools(uuid) to authenticated;

drop policy if exists author_profiles_insert_self on public.author_profiles;
create policy author_profiles_insert_self
on public.author_profiles
for insert
to authenticated
with check (
  auth.uid() = user_id
  and platform_role = 'reader'
  and (
    email is null
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists author_profiles_update_self on public.author_profiles;
create policy author_profiles_update_self
on public.author_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.guard_author_profiles_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
begin
  -- system-triggered sync (auth.users trigger) can bypass this guard
  if requester is null then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'email is managed by auth.users';
  end if;

  if new.platform_role is distinct from old.platform_role
     and not public.is_platform_admin(requester) then
    raise exception 'platform_role update forbidden';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_author_profiles_sensitive_fields on public.author_profiles;
create trigger guard_author_profiles_sensitive_fields
before update on public.author_profiles
for each row execute function public.guard_author_profiles_sensitive_fields();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.guard_author_projects_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'project id is immutable';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'project owner is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_author_projects_immutable_fields on public.author_projects;
create trigger guard_author_projects_immutable_fields
before update on public.author_projects
for each row execute function public.guard_author_projects_immutable_fields();

drop policy if exists author_projects_insert on public.author_projects;
create policy author_projects_insert
on public.author_projects
for insert
to authenticated
with check (
  auth.uid() is not null
  and owner_id = auth.uid()
  and public.can_use_author_tools(auth.uid())
);

drop policy if exists author_projects_update on public.author_projects;
create policy author_projects_update
on public.author_projects
for update
to authenticated
using (
  public.can_use_author_tools(auth.uid())
  and (
    owner_id = auth.uid()
    or public.project_access_matches_auth(id, array['owner', 'write']::text[])
  )
)
with check (
  public.can_use_author_tools(auth.uid())
  and (
    owner_id = auth.uid()
    or public.project_access_matches_auth(id, array['owner', 'write']::text[])
  )
);

drop policy if exists author_project_access_insert on public.author_project_access;
create policy author_project_access_insert
on public.author_project_access
for insert
to authenticated
with check (
  public.can_use_author_tools(auth.uid())
  and public.project_owner_matches_auth(project_id)
  and access_level in ('owner', 'write', 'read')
);

drop policy if exists author_project_access_update on public.author_project_access;
create policy author_project_access_update
on public.author_project_access
for update
to authenticated
using (
  public.can_use_author_tools(auth.uid())
  and public.project_owner_matches_auth(project_id)
)
with check (
  public.can_use_author_tools(auth.uid())
  and public.project_owner_matches_auth(project_id)
);

drop policy if exists author_project_access_delete on public.author_project_access;
create policy author_project_access_delete
on public.author_project_access
for delete
to authenticated
using (
  public.can_use_author_tools(auth.uid())
  and public.project_owner_matches_auth(project_id)
);

drop policy if exists author_project_logs_insert on public.author_project_logs;
create policy author_project_logs_insert
on public.author_project_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and public.can_use_author_tools(auth.uid())
  and (
    public.project_owner_matches_auth(project_id)
    or public.project_access_matches_auth(project_id, array['owner', 'write']::text[])
  )
);

drop policy if exists author_assets_insert on storage.objects;
create policy author_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and public.can_use_author_tools(auth.uid())
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
);

drop policy if exists author_assets_update on storage.objects;
create policy author_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and public.can_use_author_tools(auth.uid())
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
)
with check (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and public.can_use_author_tools(auth.uid())
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
);

drop policy if exists author_assets_delete on storage.objects;
create policy author_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and public.can_use_author_tools(auth.uid())
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
);

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

  if not public.can_use_author_tools(requester) then
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

  if not public.can_use_author_tools(requester) then
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

  if next_role not in ('admin', 'author', 'reader') then
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

  if is_target_admin and next_role <> 'admin' then
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

create or replace function public.purge_old_project_logs(retention_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  safe_days integer := greatest(coalesce(retention_days, 180), 1);
  deleted_count integer := 0;
begin
  if requester is null or not public.is_platform_admin(requester) then
    return 0;
  end if;

  delete from public.author_project_logs l
  where l.created_at < now() - make_interval(days => safe_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.purge_old_project_logs(integer) to authenticated;
