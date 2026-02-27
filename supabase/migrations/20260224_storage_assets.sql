-- Supabase Storage setup for author studio assets
-- Stores media files under: projects/{project_uuid}/{asset_id}-{file_name}

create or replace function public.storage_project_uuid(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');

  if array_length(parts, 1) < 2 then
    return null;
  end if;

  if parts[1] <> 'projects' then
    return null;
  end if;

  if parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return parts[2]::uuid;
  end if;

  return null;
end;
$$;

grant execute on function public.storage_project_uuid(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('author-assets', 'author-assets', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists author_assets_select on storage.objects;
drop policy if exists author_assets_insert on storage.objects;
drop policy if exists author_assets_update on storage.objects;
drop policy if exists author_assets_delete on storage.objects;

create policy author_assets_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write', 'read']::text[]
    )
  )
);

create policy author_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
);

create policy author_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
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
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
);

create policy author_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'author-assets'
  and public.storage_project_uuid(name) is not null
  and (
    public.project_owner_matches_auth(public.storage_project_uuid(name))
    or public.project_access_matches_auth(
      public.storage_project_uuid(name),
      array['owner', 'write']::text[]
    )
  )
);
