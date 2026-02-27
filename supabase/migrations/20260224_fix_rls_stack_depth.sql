-- Fix RLS recursion between author_projects and author_project_access
-- This patch removes policy cross-dependencies that trigger
-- "stack depth limit exceeded" when selecting project lists.

create or replace function public.project_owner_matches_auth(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  select exists (
    select 1
    from public.author_project_access a
    where a.project_id = project_uuid
      and a.user_id = auth.uid()
      and a.access_level = any(accepted_levels)
  );
$$;

grant execute on function public.project_owner_matches_auth(uuid) to authenticated;
grant execute on function public.project_access_matches_auth(uuid, text[]) to authenticated;

drop policy if exists author_projects_select on public.author_projects;
drop policy if exists author_projects_insert on public.author_projects;
drop policy if exists author_projects_update on public.author_projects;
drop policy if exists author_projects_delete on public.author_projects;

create policy author_projects_select
on public.author_projects
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.project_access_matches_auth(id, array['owner', 'write', 'read']::text[])
);

create policy author_projects_insert
on public.author_projects
for insert
to authenticated
with check (
  auth.uid() is not null
  and owner_id = auth.uid()
);

create policy author_projects_update
on public.author_projects
for update
to authenticated
using (
  owner_id = auth.uid()
  or public.project_access_matches_auth(id, array['owner', 'write']::text[])
)
with check (
  owner_id = auth.uid()
  or public.project_access_matches_auth(id, array['owner', 'write']::text[])
);

create policy author_projects_delete
on public.author_projects
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists author_project_access_select on public.author_project_access;
drop policy if exists author_project_access_insert on public.author_project_access;
drop policy if exists author_project_access_update on public.author_project_access;
drop policy if exists author_project_access_delete on public.author_project_access;

create policy author_project_access_select
on public.author_project_access
for select
to authenticated
using (
  user_id = auth.uid()
  or public.project_owner_matches_auth(project_id)
);

create policy author_project_access_insert
on public.author_project_access
for insert
to authenticated
with check (
  public.project_owner_matches_auth(project_id)
  and access_level in ('owner', 'write', 'read')
);

create policy author_project_access_update
on public.author_project_access
for update
to authenticated
using (public.project_owner_matches_auth(project_id))
with check (public.project_owner_matches_auth(project_id));

create policy author_project_access_delete
on public.author_project_access
for delete
to authenticated
using (public.project_owner_matches_auth(project_id));

drop policy if exists author_project_logs_select on public.author_project_logs;
drop policy if exists author_project_logs_insert on public.author_project_logs;

create policy author_project_logs_select
on public.author_project_logs
for select
to authenticated
using (
  public.project_owner_matches_auth(project_id)
  or public.project_access_matches_auth(project_id, array['owner', 'write', 'read']::text[])
);

create policy author_project_logs_insert
on public.author_project_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and (
    public.project_owner_matches_auth(project_id)
    or public.project_access_matches_auth(project_id, array['owner', 'write']::text[])
  )
);
