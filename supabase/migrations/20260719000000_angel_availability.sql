-- ═══════════════════════════════════════════════════════════════════
-- Verfügbarkeitskalender für Engel
--
-- Bisher war die Verfügbarkeit nur `angels.availability text[]` mit
-- Wochentagskürzeln ("Mo","Di",…). Damit lässt sich nicht prüfen, ob
-- ein Engel um 14:00 für 3 Stunden Zeit hat — der Kunde bucht ins
-- Blaue und der Engel muss reihenweise absagen.
--
-- Diese Tabelle hält konkrete wöchentlich wiederkehrende Zeitfenster
-- ("Montag 09:00–14:00"). `angels.availability` bleibt bestehen und
-- dient als Fallback für Engel, die noch keine Zeitfenster gepflegt
-- haben (siehe lib/availability.ts) — kein Bruch für Bestandsdaten.
--
-- Idempotent — kann gefahrlos mehrfach eingespielt werden.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.angel_availability (
  id uuid primary key default gen_random_uuid(),
  angel_id uuid not null references public.profiles(id) on delete cascade,
  -- ISO-8601-Wochentag: 1 = Montag … 7 = Sonntag
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint angel_availability_zeitfenster_gueltig check (end_time > start_time),
  constraint angel_availability_eindeutig unique (angel_id, weekday, start_time, end_time)
);

comment on table public.angel_availability is
  'Wöchentlich wiederkehrende Zeitfenster, in denen ein Engel Einsätze annimmt.';
comment on column public.angel_availability.weekday is
  'ISO-Wochentag: 1 = Montag … 7 = Sonntag.';

create index if not exists angel_availability_angel_idx
  on public.angel_availability (angel_id, weekday);

-- ─── RLS ───
-- Lesen: jeder angemeldete Nutzer (der Kunde muss vor der Buchung
-- sehen, wann der Engel kann). Zeitfenster sind keine PII.
-- Schreiben: ausschließlich der Engel selbst, plus Admins.
alter table public.angel_availability enable row level security;

drop policy if exists angel_availability_select on public.angel_availability;
create policy angel_availability_select on public.angel_availability
  for select to authenticated
  using (true);

drop policy if exists angel_availability_insert on public.angel_availability;
create policy angel_availability_insert on public.angel_availability
  for insert to authenticated
  with check (
    angel_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'superadmin')
    )
  );

drop policy if exists angel_availability_update on public.angel_availability;
create policy angel_availability_update on public.angel_availability
  for update to authenticated
  using (
    angel_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'superadmin')
    )
  )
  with check (
    angel_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'superadmin')
    )
  );

drop policy if exists angel_availability_delete on public.angel_availability;
create policy angel_availability_delete on public.angel_availability
  for delete to authenticated
  using (
    angel_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'superadmin')
    )
  );
