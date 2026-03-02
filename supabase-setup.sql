-- ============================================
-- ALLTAGSENGEL - Supabase Database Setup
-- ============================================
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın
-- ============================================

-- 1. PROFILES tablosu
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'kunde' check (role in ('kunde', 'engel', 'admin')),
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  location text,
  latitude numeric,
  longitude numeric,
  avatar_color text,
  created_at timestamptz not null default now()
);

-- 2. ANGELS tablosu
create table if not exists public.angels (
  id uuid references public.profiles on delete cascade primary key,
  hourly_rate numeric not null default 30,
  services text[] default '{}',
  availability text[] default '{}',
  bio text,
  qualification text,
  is_certified boolean not null default false,
  is_45b_capable boolean not null default false,
  is_online boolean not null default false,
  total_jobs integer not null default 0,
  rating numeric not null default 5.0,
  satisfaction_pct numeric not null default 100,
  created_at timestamptz not null default now()
);

-- 3. BOOKINGS tablosu
create table if not exists public.bookings (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references public.profiles(id) on delete set null,
  angel_id uuid references public.angels(id) on delete set null,
  service text not null,
  date date not null,
  time time,
  duration_hours numeric not null default 1,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  payment_method text default 'selbstzahler',
  insurance_type text,
  insurance_provider text,
  total_amount numeric not null default 0,
  platform_fee numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- 4. REVIEWS tablosu
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  angel_id uuid references public.angels(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- RLS aktifleştir
alter table public.profiles enable row level security;
alter table public.angels enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;

-- Admin kontrolü (RLS recursion riskini azaltmak için helper)
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

-- PROFILES policies
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

create policy "Kullanıcı kendi profilini güncelleyebilir" on public.profiles
  for update using (auth.uid() = id);

create policy "Kullanıcı kendi profilini oluşturabilir" on public.profiles
  for insert with check (
    auth.uid() = id
    and role in ('kunde', 'engel')
  );

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

-- ANGELS policies
create policy "Herkes engelleri okuyabilir" on public.angels
  for select using (true);

create policy "Engel kendi profilini güncelleyebilir" on public.angels
  for update using (auth.uid() = id);

create policy "Engel kendi profilini oluşturabilir" on public.angels
  for insert with check (auth.uid() = id);

-- BOOKINGS policies
create policy "Kullanıcı kendi bookinglerini okuyabilir" on public.bookings
  for select using (auth.uid() = customer_id or auth.uid() = angel_id);

create policy "Müşteri booking oluşturabilir" on public.bookings
  for insert with check (auth.uid() = customer_id);

create policy "İlgili kişi bookingi güncelleyebilir" on public.bookings
  for update using (auth.uid() = customer_id or auth.uid() = angel_id);

-- REVIEWS policies
create policy "Herkes reviewleri okuyabilir" on public.reviews
  for select using (true);

create policy "Müşteri review yazabilir" on public.reviews
  for insert with check (auth.uid() = reviewer_id);

-- ============================================
-- ADMIN: Tüm tablolara tam erişim
-- ============================================
create policy "Admin profilleri yönetebilir" on public.profiles
  for all using (public.is_admin());

create policy "Admin engelleri yönetebilir" on public.angels
  for all using (public.is_admin());

create policy "Admin bookingleri yönetebilir" on public.bookings
  for all using (public.is_admin());

-- ============================================
-- AUTH TRIGGER: Yeni kayıtta otomatik profil oluştur
-- ============================================
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

-- Trigger: auth.users'a yeni kayıt olunca profiles'a da ekle
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- DEMO VERİLERİ (opsiyonel)
-- ============================================
-- NOT: Demo kullanıcıları Supabase Auth > Users'dan
-- manuel oluşturup aşağıdaki ID'leri güncelleyebilirsiniz


-- ============================================
-- 5. MESSAGES tablosu (Chat)
-- ============================================
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

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

-- ============================================
-- 6. DOCUMENTS tablosu (Belge Yükleme)
-- ============================================
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('ausweis','fuehrungszeugnis','zertifikat','versicherung','sonstiges')),
  file_name text not null,
  storage_path text,
  file_url text, -- Legacy: nur für Rückwärtskompatibilität
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  note text,
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz
);

-- Documents bucket private olmalı
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

alter table storage.objects enable row level security;

create policy "Kullanıcı kendi documents dosyalarını yükleyebilir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Kullanıcı kendi documents dosyalarını güncelleyebilir" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Kullanıcı kendi documents dosyalarını silebilir" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Admin documents dosyalarını yönetebilir" on storage.objects
  for all using (public.is_admin())
  with check (public.is_admin());

alter table public.documents enable row level security;

create policy "Kullanıcı kendi belgelerini okuyabilir" on public.documents
  for select using (auth.uid() = user_id);

create policy "Kullanıcı belge yükleyebilir" on public.documents
  for insert with check (auth.uid() = user_id);

create policy "Admin belgeleri yönetebilir" on public.documents
  for all using (public.is_admin());

-- ============================================
-- 7. PAYMENTS tablosu (Ödeme)
-- ============================================
create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  amount numeric(10,2) not null,
  platform_fee numeric(10,2) default 0,
  payment_method text not null default 'card' check (payment_method in ('card','sepa','45b','paypal')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','refunded')),
  stripe_payment_id text,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Kullanıcı kendi ödemelerini okuyabilir" on public.payments
  for select using (auth.uid() = user_id);

create policy "Admin ödemeleri yönetebilir" on public.payments
  for all using (public.is_admin());

-- ============================================
-- 8. NOTIFICATIONS tablosu (Bildirimler)
-- ============================================
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('booking_new','booking_accepted','booking_declined','booking_completed','message','payment','system')),
  title text not null,
  body text,
  read boolean not null default false,
  data jsonb,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Kullanıcı kendi bildirimlerini okuyabilir" on public.notifications
  for select using (auth.uid() = user_id);

create policy "Kullanıcı bildirimlerini güncelleyebilir" on public.notifications
  for update using (auth.uid() = user_id);

create policy "Admin bildirimleri yönetebilir" on public.notifications
  for all using (public.is_admin());

-- ============================================
-- 9. CARE ELIGIBILITY (Pflegegrad & Anspruch)
-- ============================================
create table if not exists public.care_eligibility (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  pflegegrad integer not null default 0 check (pflegegrad >= 0 and pflegegrad <= 5),
  home_care boolean not null default true,
  insurance_type text not null default 'unknown' check (insurance_type in ('public', 'private', 'unknown')),
  krankenkasse text not null default '',
  pflegehilfsmittel_interest boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.care_eligibility enable row level security;

create policy "Kullanıcı kendi eligibility okuyabilir" on public.care_eligibility
  for select using (auth.uid() = user_id);

create policy "Kullanıcı kendi eligibility oluşturabilir" on public.care_eligibility
  for insert with check (auth.uid() = user_id);

create policy "Kullanıcı kendi eligibility güncelleyebilir" on public.care_eligibility
  for update using (auth.uid() = user_id);

create policy "Admin eligibility yönetebilir" on public.care_eligibility
  for all using (public.is_admin());

-- ============================================
-- 10. CAREBOX CATALOG (Pflegehilfsmittel Katalog)
-- ============================================
create table if not exists public.carebox_catalog_items (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  category text not null default 'hygiene',
  description text,
  unit_type text not null default 'Stück',
  default_price_estimate numeric(10,2),
  max_qty integer not null default 1,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.carebox_catalog_items enable row level security;

create policy "Jeder kann Katalog lesen" on public.carebox_catalog_items
  for select using (true);

create policy "Admin Katalog yönetebilir" on public.carebox_catalog_items
  for all using (public.is_admin());

-- Default Katalog-Einträge
insert into public.carebox_catalog_items (name, category, description, unit_type, default_price_estimate, max_qty, sort_order) values
  ('Einmalhandschuhe (Nitril)', 'hygiene', '100 Stück, puderfrei, latexfrei', 'Box', 8.50, 2, 1),
  ('Händedesinfektionsmittel', 'desinfektion', '500 ml Flasche', 'Flasche', 5.90, 2, 2),
  ('Flächendesinfektionstücher', 'desinfektion', '80 Tücher pro Packung', 'Packung', 6.50, 2, 3),
  ('Mundschutz (OP-Masken)', 'hygiene', '50 Stück, 3-lagig', 'Box', 4.90, 2, 4),
  ('Schutzschürzen (Einweg)', 'hygiene', '100 Stück, PE-Folie', 'Box', 7.90, 1, 5),
  ('Bettschutzeinlagen (Einweg)', 'hygiene', '25 Stück, 60×90 cm, saugstark', 'Packung', 9.90, 2, 6),
  ('Fingerlinge', 'hygiene', '100 Stück, Latex', 'Box', 3.50, 1, 7),
  ('FFP2-Masken', 'hygiene', '10 Stück, einzelverpackt', 'Box', 6.90, 1, 8);

-- ============================================
-- 11. CAREBOX CART (Warenkorb)
-- ============================================
create table if not exists public.carebox_cart (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  month text not null default to_char(now(), 'YYYY-MM'),
  items jsonb not null default '[]',
  estimated_total numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carebox_cart enable row level security;

create policy "Kullanıcı kendi cart okuyabilir" on public.carebox_cart
  for select using (auth.uid() = user_id);

create policy "Kullanıcı kendi cart oluşturabilir" on public.carebox_cart
  for insert with check (auth.uid() = user_id);

create policy "Kullanıcı kendi cart güncelleyebilir" on public.carebox_cart
  for update using (auth.uid() = user_id);

create policy "Admin cart yönetebilir" on public.carebox_cart
  for all using (public.is_admin());

-- ============================================
-- 12. CAREBOX ORDER REQUESTS (Bestellungen)
-- ============================================
create table if not exists public.carebox_order_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  cart_id uuid references public.carebox_cart(id) on delete set null,
  delivery_name text not null,
  delivery_address text not null,
  delivery_phone text,
  consent_share_data boolean not null default false,
  partner_id text,
  status text not null default 'draft' check (status in ('draft','submitted','sent','accepted','rejected','shipped','delivered','cancelled')),
  partner_reference text,
  audit_log jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carebox_order_requests enable row level security;

create policy "Kullanıcı kendi order okuyabilir" on public.carebox_order_requests
  for select using (auth.uid() = user_id);

create policy "Kullanıcı order oluşturabilir" on public.carebox_order_requests
  for insert with check (auth.uid() = user_id);

create policy "Kullanıcı kendi order güncelleyebilir" on public.carebox_order_requests
  for update using (auth.uid() = user_id);

create policy "Admin order yönetebilir" on public.carebox_order_requests
  for all using (public.is_admin());
