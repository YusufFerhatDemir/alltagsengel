-- ═══════════════════════════════════════════════════════════════════
-- Buchungsanfrage-Workflow: Anfrage → Engel bestätigt/lehnt ab → Kunde
--
-- Vorher konnte JEDE an der Buchung beteiligte Partei jeden beliebigen
-- Status setzen (fix_rls_policies.sql: UPDATE USING customer_id OR
-- angel_id, ohne Spalten- oder Übergangs-Prüfung). Der Kunde hat sich
-- seine Buchung faktisch selbst bestätigt.
--
-- Diese Migration:
--   1. ergänzt responded_at + decline_reason
--   2. erzwingt gültige Status-Übergänge per BEFORE-UPDATE-Trigger
--
-- Idempotent — kann gefahrlos mehrfach eingespielt werden.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Antwort-Metadaten ───
alter table public.bookings add column if not exists responded_at timestamptz;
alter table public.bookings add column if not exists decline_reason text;

comment on column public.bookings.responded_at is
  'Zeitpunkt, zu dem der Engel die Anfrage angenommen oder abgelehnt hat.';
comment on column public.bookings.decline_reason is
  'Optionale Begründung des Engels bei Ablehnung (max. 500 Zeichen, wird dem Kunden angezeigt).';

-- ─── 2. Status-Übergangs-Guard ───
-- RLS-Policies können in WITH CHECK nicht auf OLD zugreifen, deshalb
-- als Trigger. Der Service-Role-Client (auth.uid() IS NULL) wird
-- durchgelassen — /api/bookings/respond prüft die Berechtigung selbst
-- und ist die einzige Stelle, die pending → accepted/declined schaltet.
create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
begin
  -- Status unverändert → keine Übergangs-Prüfung nötig
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Service-Role / interne Jobs (kein JWT) dürfen durch
  if uid is null then
    return new;
  end if;

  select exists (
    select 1 from public.profiles
    where id = uid and role in ('admin', 'superadmin')
  ) into is_admin;

  if is_admin then
    return new;
  end if;

  -- Kunde: darf ausschließlich stornieren, solange noch nichts läuft
  if uid = old.customer_id then
    if new.status = 'cancelled' and old.status in ('pending', 'accepted') then
      return new;
    end if;
    raise exception
      'Als Kunde koennen Sie eine Anfrage nur stornieren (% -> % nicht erlaubt)',
      old.status, new.status
      using errcode = '42501';
  end if;

  -- Engel: beantwortet Anfragen und schliesst Einsaetze ab
  if uid = old.angel_id then
    if old.status = 'pending' and new.status in ('accepted', 'declined') then
      return new;
    end if;
    if old.status = 'accepted' and new.status in ('completed', 'cancelled') then
      return new;
    end if;
    raise exception
      'Statuswechsel % -> % ist fuer den Engel nicht erlaubt',
      old.status, new.status
      using errcode = '42501';
  end if;

  raise exception 'Keine Berechtigung, den Buchungsstatus zu aendern'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_booking_status_transition on public.bookings;
create trigger trg_booking_status_transition
  before update of status on public.bookings
  for each row
  execute function public.enforce_booking_status_transition();
