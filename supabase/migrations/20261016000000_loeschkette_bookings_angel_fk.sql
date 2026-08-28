-- ════════════════════════════════════════════════════════════════════
-- Track 11 — bookings.angel_id blockiert die Löschung eines Engel-Kontos
-- ════════════════════════════════════════════════════════════════════
--
-- BEFUND (live gelesen mit `npm run verify:loeschkette`, Prüfung F):
--
--   bookings.customer_id -> profiles | SET NULL
--   bookings.angel_id    -> profiles | NO ACTION      ← blockiert
--
-- Die Migration 20260804400000_fix_profiles_fk_on_delete.sql hat für
-- `bookings` bereits entschieden: „Buchungsdaten — erhalten bleiben",
-- Personenbezug über ON DELETE SET NULL entfernen. Umgesetzt wurde das
-- damals aber nur für `customer_id`. `angel_id` blieb auf NO ACTION.
--
-- WIRKUNG: Ein Engel, der jemals eine Buchung hatte, lässt sich nicht
-- endgültig löschen — `auth.admin.deleteUser()` scheitert mit 23503, und
-- zwar erst NACH dem Löschen aller anderen Tabellen. Genau diesen halb
-- gelöschten Zustand verhindert seit Track 11 die Vorprüfung in
-- lib/dsgvo/loeschung.ts; sie meldet das Konto als `blockiert` und rührt
-- nichts an. Damit die Löschung tatsächlich durchlaufen kann, muss der
-- Fremdschlüssel dieselbe Regel tragen wie seine Schwesterspalte.
--
-- KEINE neue fachliche Entscheidung: die Buchung bleibt erhalten (§ 147
-- AO, abrechnungsrelevanter Beleg), nur der Personenbezug fällt weg —
-- exakt wie 2026-08-04 für die Kundenseite derselben Zeile beschlossen.
--
-- NICHT MIT ENTHALTEN, weil es eine echte Entscheidung braucht:
--   angehoerigen_audit_log.user_id  -> NO ACTION
--   signaturen.signatar_id          -> NO ACTION
-- Beide werden AUFBEWAHRT, um nachzuweisen, WER eingesehen bzw.
-- unterschrieben hat. Ein SET NULL löscht genau diese Aussage und damit
-- den Zweck der Aufbewahrung. Solange das nicht entschieden ist, bleiben
-- Konten mit solchen Zeilen als `blockiert` stehen — sichtbar im
-- Cron-Ergebnis und in mis_audit_log, nicht stillschweigend.
--
-- STATUS: NICHT ANGEWENDET. Nur eingecheckt.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name = 'angel_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN angel_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_angel_id_fkey;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_angel_id_fkey
  FOREIGN KEY (angel_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT bookings_angel_id_fkey ON public.bookings IS
  'ON DELETE SET NULL: die Buchung bleibt als Beleg (§ 147 AO), der '
  'Personenbezug faellt mit dem Konto weg. Gegenstueck zu '
  'bookings_customer_id_fkey (Migration 20260804400000).';

COMMIT;

-- ── Nach dem Apply ──────────────────────────────────────────────────
-- 1) `npm run verify:loeschkette` ausfuehren: Pruefung F muss
--    bookings.angel_id nicht mehr melden.
-- 2) In lib/dsgvo/loeschkatalog.ts die Marke `blockiert: true` beim
--    Eintrag bookings.angel_id entfernen — und dieselbe Zeile in
--    scripts/loeschkatalog-spalten.json. Der Zwei-Wege-Abgleich in
--    Pruefung F schlaegt sonst fehl, und zwar absichtlich: Katalog und
--    Schema muessen dasselbe sagen.
