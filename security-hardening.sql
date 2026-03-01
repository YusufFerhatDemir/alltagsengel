begin;

-- Helper: Admin-Rolle sicher prüfen
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles: öffentliche Lesbarkeit einschränken
drop policy if exists "Herkes profilleri okuyabilir" on public.profiles;
drop policy if exists "Kullanıcı gerekli profilleri okuyabilir" on public.profiles;
create policy "Kullanıcı gerekli profilleri okuyabilir" on public.profiles
  for select using (
    auth.uid() = id
    or exists (select 1 from public.angels a where a.id = id)
    or exists (
      select 1
      from public.bookings b
      where (b.customer_id = id and b.angel_id = auth.uid())
         or (b.angel_id = id and b.customer_id = auth.uid())
    )
    or public.is_admin()
  );

drop policy if exists "Kullanıcı kendi profilini oluşturabilir" on public.profiles;
create policy "Kullanıcı kendi profilini oluşturabilir" on public.profiles
  for insert with check (
    auth.uid() = id
    and role in ('kunde', 'engel')
  );

-- Profiles: role değişimini engelle
create or replace function public.prevent_profile_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'role change not allowed';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists prevent_profile_role_change on public.profiles;
create trigger prevent_profile_role_change
  before update on public.profiles
  for each row execute procedure public.prevent_profile_role_change();

-- Auth trigger: sadece kunde/engel role kabul et
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, first_name, last_name, email)
  values (
    new.id,
    case
      when lower(coalesce(new.raw_user_meta_data->>'role', 'kunde')) in ('kunde', 'engel')
        then lower(coalesce(new.raw_user_meta_data->>'role', 'kunde'))
      else 'kunde'
    end,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Documents: public URL yerine storage_path kullan, bucket private olsun
alter table public.documents add column if not exists storage_path text;

update public.documents
set storage_path = regexp_replace(file_url, '^.*?/storage/v1/object/public/documents/', '')
where storage_path is null
  and file_url is not null
  and file_url like '%/storage/v1/object/public/documents/%';

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

-- Messages: booking tarafı dışı mesaj gönderimini engelle
delete from public.messages
where booking_id is null or sender_id is null or receiver_id is null;

alter table public.messages alter column booking_id set not null;
alter table public.messages alter column sender_id set not null;
alter table public.messages alter column receiver_id set not null;

alter table public.messages
  drop constraint if exists messages_sender_id_fkey,
  add constraint messages_sender_id_fkey
    foreign key (sender_id) references public.profiles(id) on delete cascade;

alter table public.messages
  drop constraint if exists messages_receiver_id_fkey,
  add constraint messages_receiver_id_fkey
    foreign key (receiver_id) references public.profiles(id) on delete cascade;

drop policy if exists "Kullanıcı kendi mesajlarını okuyabilir" on public.messages;
create policy "Kullanıcı kendi mesajlarını okuyabilir" on public.messages
  for select using (
    (auth.uid() = sender_id or auth.uid() = receiver_id)
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or b.angel_id = auth.uid())
    )
  );

drop policy if exists "Kullanıcı mesaj gönderebilir" on public.messages;
create policy "Kullanıcı mesaj gönderebilir" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          (b.customer_id = sender_id and b.angel_id = receiver_id)
          or
          (b.angel_id = sender_id and b.customer_id = receiver_id)
        )
    )
  );

drop policy if exists "Kullanıcı kendi mesajlarını güncelleyebilir" on public.messages;
create policy "Kullanıcı kendi mesajlarını güncelleyebilir" on public.messages
  for update using (
    auth.uid() = receiver_id
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or b.angel_id = auth.uid())
    )
  )
  with check (
    auth.uid() = receiver_id
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or b.angel_id = auth.uid())
    )
  );

commit;
