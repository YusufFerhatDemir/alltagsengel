-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261016000000_loeschkette_bookings_angel_fk.sql
-- ════════════════════════════════════════════════════════════════════
--
-- Stellt den Zustand von vor der Migration wieder her: der
-- Fremdschlüssel bookings.angel_id ohne ON-DELETE-Regel (NO ACTION).
--
-- ACHTUNG, damit kehrt der Befund zurück: ein Engel-Konto mit auch nur
-- einer Buchung lässt sich dann wieder nicht endgültig löschen. Der Lauf
-- meldet es als `blockiert` (lib/dsgvo/loeschung.ts) — er bricht ab,
-- bevor etwas gelöscht ist, es entsteht also kein halber Zustand.
--
-- Die NOT-NULL-Eigenschaft der Spalte wird NICHT zurückgenommen: sind in
-- der Zwischenzeit Zeilen mit angel_id = NULL entstanden (genau das ist
-- der Zweck von SET NULL), würde ein SET NOT NULL scheitern und den
-- Rollback mitreißen.
--
-- STATUS: NICHT ANGEWENDET. Nur eingecheckt.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_angel_id_fkey;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_angel_id_fkey
  FOREIGN KEY (angel_id) REFERENCES public.profiles(id);

COMMIT;
