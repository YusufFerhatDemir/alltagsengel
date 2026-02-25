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

-- PROFILES policies
create policy "Herkes profilleri okuyabilir" on public.profiles
  for select using (true);

create policy "Kullanıcı kendi profilini güncelleyebilir" on public.profiles
  for update using (auth.uid() = id);

create policy "Kullanıcı kendi profilini oluşturabilir" on public.profiles
  for insert with check (auth.uid() = id);

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
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin engelleri yönetebilir" on public.angels
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin bookingleri yönetebilir" on public.bookings
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================
-- AUTH TRIGGER: Yeni kayıtta otomatik profil oluştur
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'kunde'),
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
