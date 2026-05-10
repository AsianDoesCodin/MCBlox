-- McBlox Storage policies for creator-uploaded game assets.
-- Run this in the Supabase SQL Editor.

-- The site stores publish/dashboard game assets under:
--   MCBlox/<creator auth uid>/<game id>/thumbnail.jpg
--   MCBlox/<creator auth uid>/<game id>/screenshot_*.jpg

insert into storage.buckets (id, name, public)
values ('MCBlox', 'MCBlox', true)
on conflict (id) do update
set public = true;

drop policy if exists "Public can read McBlox assets" on storage.objects;
create policy "Public can read McBlox assets"
  on storage.objects for select
  using (bucket_id = 'MCBlox');

drop policy if exists "Creators can upload own game assets" on storage.objects;
create policy "Creators can upload own game assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'MCBlox'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can update own game assets" on storage.objects;
create policy "Creators can update own game assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'MCBlox'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'MCBlox'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can delete own game assets" on storage.objects;
create policy "Creators can delete own game assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'MCBlox'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
