-- ═══════════════════════════════════════════════════════════════════════
-- Signaturintegritaet: das Siegel entsteht auch beim EINFUEGEN
--
-- NICHT ANGEWENDET (Stand 31.08.2026). Rollback: 20261023000001.
-- Anwenden im Supabase-SQL-Editor als `postgres` — ueber den
-- Dienstschluessel scheitert jedes DDL am Eigentuemer (42501).
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND U11 (P1) — unterschrieben, aber ohne Siegel
-- ─────────────────────────────────────────────────────────────────────
-- `trg_compute_signature_hash` steht live als
--
--     CREATE TRIGGER trg_compute_signature_hash
--       BEFORE UPDATE ON public.service_records
--
-- also ausdruecklich NUR fuer UPDATE. Das passt zu dem Weg, den die
-- Anwendung geht: `/api/leistungsnachweis/crud` legt mit
-- proof_status='ENTWURF' an und setzt die Unterschrift danach per UPDATE.
--
-- Eine Zeile, die GLEICH als unterschrieben eingefuegt wird, laeuft an
-- dem Trigger vorbei. Gemessen am 31.08.2026 gegen Produktion
-- (`npm run verify:unterschrift`, Pruefung U11): ein INSERT mit
-- proof_status='UNTERSCHRIEBEN', client_signed_at und client_signature
-- ergibt eine Zeile mit
--
--     signature_hash = NULL   und   is_locked = false
--
-- die `sync_service_record_status` sofort auf status='signed' hebt — also
-- abrechenbar ist. `trg_a_unterschrift_beleg` greift dabei sehr wohl (es
-- ist BEFORE INSERT OR UPDATE) und verlangt einen Beleg; es entsteht also
-- keine beleglose Zeile. Was fehlt, ist das SIEGEL: der Hash, an dem sich
-- spaeter nachweisen laesst, dass Betrag, Zeitraum und Klient noch die
-- sind, die unterschrieben wurden.
--
-- Der Fall ist nicht theoretisch. Per INSERT schreiben: Nacherfassungen,
-- Importe aus einem Vorsystem, Datenmigrationen und jeder kuenftige
-- Schreibweg mit Dienstschluessel. Live traegt heute KEINE der 30 Zeilen
-- einen Hash und KEINE ist gesperrt.
--
-- ─────────────────────────────────────────────────────────────────────
-- WAS DIESE MIGRATION AENDERT — und was ausdruecklich NICHT
-- ─────────────────────────────────────────────────────────────────────
--  1. Der Trigger feuert zusaetzlich BEFORE INSERT. Die Bedingung bleibt
--     woertlich dieselbe: proof_status='UNTERSCHRIEBEN' UND
--     client_signed_at IS NOT NULL. Es wird also nichts versiegelt, was
--     vorher nicht schon als unterschrieben galt.
--
--  2. Ein beim EINFUEGEN mitgelieferter `signature_hash` wird verworfen,
--     wenn die Bedingung nicht zutrifft. Begruendung: ein Hash, den der
--     Aufrufer selbst mitbringt, ist kein Siegel, sondern eine
--     Behauptung — niemand hat ihn nachgerechnet. Er stuende danach in
--     der Spalte, die als Faelschungsnachweis gilt.
--
--  3. NICHT geaendert wird das Verhalten bei UPDATE. Der bestehende Pfad
--     bleibt Zeichen fuer Zeichen erhalten, damit diese Migration keine
--     zweite Wirkung hat, die man beim Lesen uebersieht.
--
--  4. NICHT geaendert wird `is_locked` fuer Zeilen ohne Unterschrift.
--     Ein INSERT, das is_locked=true ohne Unterschrift mitbringt, bleibt
--     moeglich — das ist der Weg, auf dem der Altbestand und die
--     Aufraeumlaeufe der Pruefskripte arbeiten. Die Sperre allein ist
--     kein Unterschriftsbeleg, das entscheidet `unterschriftBelegt()`
--     in lib/leistungsnachweis/nachweis-regeln.ts.
--
-- ─────────────────────────────────────────────────────────────────────
-- WIRKUNG AUF DEN BESTAND
-- ─────────────────────────────────────────────────────────────────────
-- KEINE. Ein Trigger wirkt nur auf kuenftige Schreibvorgaenge. Die 30
-- Bestandszeilen ohne Hash bleiben ohne Hash — ein Nachziehen waere eine
-- Faelschung, weil der Hash den Unterschriftszeitpunkt mit abbildet und
-- der bei diesen Zeilen unbekannt ist. Siehe
-- docs/UNTERSCHRIFT_ALTBESTAND_2026-08-31.md.
--
-- NACHWEIS NACH DEM ANWENDEN
--     npm run verify:unterschrift     → U11 muss von OFFEN auf OK springen
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_signature_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proof_status = 'UNTERSCHRIEBEN' AND NEW.client_signed_at IS NOT NULL THEN
    NEW.signature_hash := encode(
      extensions.digest(
        COALESCE(NEW.id::text, '') || '|' ||
        COALESCE(NEW.client_id::text, '') || '|' ||
        COALESCE(NEW.date::text, '') || '|' ||
        COALESCE(NEW.start_time::text, '') || '|' ||
        COALESCE(NEW.end_time::text, '') || '|' ||
        COALESCE(NEW.amount::text, '') || '|' ||
        COALESCE(NEW.client_signed_at::text, ''),
        'sha256'
      ),
      'hex'
    );
    NEW.is_locked := true;

  ELSIF TG_OP = 'INSERT' AND NEW.signature_hash IS NOT NULL THEN
    -- Punkt 2 aus dem Kopf: ein selbst mitgebrachter Hash ist kein Siegel.
    -- Bewusst nur beim INSERT — beim UPDATE traegt die Zeile den Hash aus
    -- einer frueheren Unterschrift, und der darf nicht verschwinden.
    NEW.signature_hash := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;

-- Der Name bleibt: die Reihenfolge der BEFORE-Trigger ist alphabetisch,
-- und `trg_compute_signature_hash` muss weiterhin VOR
-- `trg_sync_record_status` laufen (das den Status auf 'signed' hebt) und
-- NACH `trg_a_unterschrift_beleg` (das den Beleg verlangt).
CREATE TRIGGER trg_compute_signature_hash
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_signature_hash();

COMMENT ON FUNCTION public.compute_signature_hash() IS
  'Versiegelt einen unterschriebenen Leistungsnachweis (Hash ueber id, Klient, '
  'Datum, Zeitraum, Betrag, Unterschriftszeitpunkt) und sperrt ihn. Seit '
  '20261023000000 auch beim EINFUEGEN — vorher lief jede direkt als '
  'unterschrieben eingefuegte Zeile ohne Siegel durch (Befund U11).';
