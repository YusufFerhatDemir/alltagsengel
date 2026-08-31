-- ═══════════════════════════════════════════════════════════════════
-- assignments.booking_id — der Einsatz weiss, aus welcher Buchung er kam
-- ═══════════════════════════════════════════════════════════════════
--
-- BEFUND (31.08.2026, Storno-Kette /api/bookings/cancel)
-- Beim Annehmen einer Buchung erzeugt lib/bookings/einsatz-kette.ts einen
-- `assignment` und darauf einen `service_record`. Zurueck zur Buchung
-- fuehrte danach NICHTS ausser einer Notiz in freiem Text:
--
--     notes = 'Automatisch aus Buchung <uuid> erzeugt.'
--
-- Der Storno muss diesen Einsatz finden — sonst bleibt er auf der
-- Einsatzliste stehen und der Engel faehrt zu einem abgesagten Termin.
-- Er sucht deshalb heute mit `notes LIKE '%Buchung <uuid>%'`.
--
-- Falsch-TREFFER sind dabei ausgeschlossen (die Notiz traegt die UUID).
-- Falsch-NEGATIVE nicht: `notes` ist ein Feld, das die Einsatzliste
-- bearbeiten darf. Wer die Notiz ergaenzt oder ersetzt — „Kunde bittet um
-- Anruf vorher" —, kappt damit den einzigen Bezug zwischen Einsatz und
-- Buchung, ohne es zu merken. Ein Bezug, den die Fachanwendung
-- ueberschreiben kann, ist kein Bezug.
--
-- Die Route faengt den Fall heute mit einem Riegel ab (angenommene
-- Buchung ohne auffindbaren Einsatz → 409 und Hinweis auf den Support).
-- Das ist die richtige Antwort auf einen fehlenden Bezug, aber keine
-- Loesung dafuer, dass es ihn nicht gibt.
--
-- ── WAS DIESE MIGRATION TUT ──────────────────────────────────────
--   1. Spalte `booking_id uuid` auf `assignments`
--   2. Fremdschluessel auf `bookings(id)` mit ON DELETE SET NULL —
--      dieselbe Linie wie 20261016000000: der Einsatz bleibt als Beleg
--      (§ 147 AO) bestehen, der Bezug faellt weg.
--   3. Backfill aus den vorhandenen Notizen. Nur dort, wo die Notiz
--      exakt dem erzeugten Muster entspricht UND die Buchung wirklich
--      existiert — sonst schluege der Fremdschluessel fehl.
--   4. Index fuer die Suche „welcher Einsatz gehoert zu dieser Buchung".
--
-- ── WAS SIE BEWUSST NICHT TUT ────────────────────────────────────
-- Kein NOT NULL. Einsaetze entstehen auch OHNE Buchung — aus der
-- Dienstplanung, aus wiederkehrenden Touren, aus der Anlage von Hand.
-- Fuer die ist NULL die richtige Antwort und kein Mangel.
--
-- Kein UNIQUE. Ob eine Buchung jemals mehr als einen Einsatz erzeugen
-- darf (Folgetermin, Nachholtermin), ist eine fachliche Frage und hier
-- nicht zu entscheiden. Ein UNIQUE waere leicht nachzureichen, aber nur
-- schwer zurueckzunehmen, sobald Daten dagegenstehen.
--
-- Keine Aenderung an RLS. Eine zusaetzliche Spalte erweitert keine
-- Sichtbarkeit; die Policies auf `assignments` bleiben unberuehrt.
--
-- ── ABWAERTSKOMPATIBEL ───────────────────────────────────────────
-- Der Anwendungscode arbeitet MIT und OHNE diese Spalte
-- (lib/bookings/assignment-bezug.ts): er schreibt sie, wenn es sie gibt,
-- und faellt sonst auf den Notiz-Weg zurueck. Diese Migration darf also
-- vor dem Code stehen oder nach ihm — nur nicht dazwischen fehlen und
-- gleichzeitig erwartet werden.
--
-- Rollback: 20261025000001_rollback_assignments_booking_id.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Spalte ─────────────────────────────────────────────────────
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS booking_id uuid;

COMMENT ON COLUMN public.assignments.booking_id IS
  'Buchung, aus der dieser Einsatz entstanden ist (lib/bookings/einsatz-kette.ts). '
  'NULL bei Einsaetzen aus Dienstplanung, Tour oder Handanlage. Ersetzt den '
  'frueheren Bezug ueber notes LIKE ''%Buchung <uuid>%'', der von der '
  'Einsatzliste ueberschreibbar war.';

-- ── 2) Fremdschluessel ────────────────────────────────────────────
-- ON DELETE SET NULL, nicht CASCADE: eine geloeschte Buchung darf den
-- Einsatz nicht mitnehmen — er ist Beleg fuer erbrachte Leistung.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignments_booking_id_fkey'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3) Backfill aus den Notizen ───────────────────────────────────
-- Nur exakt das Muster, das einsatz-kette.ts schreibt, und nur, wenn die
-- Buchung noch existiert. Beides zusammen: kein Fremdschluessel-Fehler
-- und keine geratene Zuordnung.
UPDATE public.assignments a
   SET booking_id = sub.gefundene_id
  FROM (
    SELECT
      x.id,
      (substring(x.notes FROM 'Automatisch aus Buchung ([0-9a-fA-F-]{36}) erzeugt\.'))::uuid
        AS gefundene_id
    FROM public.assignments x
    WHERE x.booking_id IS NULL
      AND x.notes ~ 'Automatisch aus Buchung [0-9a-fA-F-]{36} erzeugt\.'
  ) sub
 WHERE a.id = sub.id
   AND sub.gefundene_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = sub.gefundene_id);

-- ── 4) Index ──────────────────────────────────────────────────────
-- Die Storno-Route fragt „welcher Einsatz gehoert zu dieser Buchung" —
-- ohne Index ein Seq-Scan ueber alle Einsaetze. Partiell, weil die grosse
-- Mehrheit der Einsaetze (Dienstplan, Touren) gar keine Buchung hat.
CREATE INDEX IF NOT EXISTS idx_assignments_booking_id
  ON public.assignments (booking_id)
  WHERE booking_id IS NOT NULL;

COMMIT;

-- ── Verifikation ──────────────────────────────────────────────────
-- Erwartet 3: Spalte + Fremdschluessel + Index.
--
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='assignments'
--         AND column_name='booking_id')
--   + (SELECT count(*) FROM pg_constraint
--       WHERE conname='assignments_booking_id_fkey')
--   + (SELECT count(*) FROM pg_indexes
--       WHERE indexname='idx_assignments_booking_id');
--
-- Wie viele Altbestaende der Backfill erreicht hat:
--
--   SELECT count(*) FILTER (WHERE booking_id IS NOT NULL) AS mit_bezug,
--          count(*) FILTER (WHERE booking_id IS NULL
--            AND notes ~ 'Automatisch aus Buchung') AS notiz_ohne_bezug
--     FROM public.assignments;
--
-- `notiz_ohne_bezug` > 0 heisst: die Notiz nennt eine Buchung, die es
-- nicht mehr gibt. Das ist kein Fehler der Migration, sondern der Beleg
-- dafuer, dass der Notiz-Weg allein nie verlaesslich war.
