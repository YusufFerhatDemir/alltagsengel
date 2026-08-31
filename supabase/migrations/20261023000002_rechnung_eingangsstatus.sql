-- ═══════════════════════════════════════════════════════════════════════
-- Die Statusmaschine der Rechnung bekommt einen EINGANG
--
-- NICHT ANGEWENDET (Stand 31.08.2026). Rollback: 20261023000003.
-- Anwenden im Supabase-SQL-Editor als `postgres` — ueber den
-- Dienstschluessel scheitert jedes DDL am Eigentuemer (42501).
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND R1 (P1) — jede Regel gilt fuer Uebergaenge, keine fuer den Anfang
-- ─────────────────────────────────────────────────────────────────────
-- Auf `invoices` stehen live drei Riegel, und ALLE DREI sind
-- `BEFORE UPDATE`:
--
--   trg_validate_invoice_status        validate_invoice_status_transition
--   trg_kassenrechnung_freigeschaltet  enforce_kassenrechnung_freigeschaltet
--   trg_invoices_no_finalized_edit     prevent_finalized_invoice_mutation
--
-- Das ist fuer sich genommen richtig: sie beschreiben, welche
-- STATUSWECHSEL erlaubt sind. Nur beschreibt keine von ihnen, in welchem
-- Status eine Rechnung ENTSTEHEN darf. Wer den Anfangszustand frei
-- waehlt, braucht keinen einzigen Uebergang.
--
-- Gemessen am 31.08.2026 gegen Produktion, mit dem Dienstschluessel
-- direkt auf die Tabelle, angelegt und sofort wieder geloescht:
--
--   INSERT … status='bezahlt'       → ANGELEGT
--   INSERT … status='freigegeben'   → ANGELEGT
--   INSERT … status='uebermittelt'  → ANGELEGT
--
-- Die Folgen, der Reihe nach:
--
--  1. `validate_invoice_status_transition` sieht diese Zeilen nie. Eine
--     Rechnung steht auf 'bezahlt', ohne je 'entwurf' → 'geprueft' →
--     'freigegeben' → 'uebermittelt' → 'quittiert' durchlaufen zu haben.
--  2. `enforce_kassenrechnung_freigeschaltet` sieht sie ebenfalls nie —
--     und kann sie auch spaeter nicht mehr sehen, weil der Status sich
--     nicht mehr aendert. Eine Kassenrechnung erreicht damit
--     'uebermittelt', ohne dass das Bundesland je freigeschaltet war.
--  3. Der Bestand wird unwahr: `sent_at` und der Status behaupten einen
--     Versand, den es nicht gab. Genau diese Verwechslung gab es hier
--     schon einmal (Demo-Zeilen, die einen Erstversand vortaeuschten);
--     die Antwort darauf war `frozen_at` als zweites Merkmal.
--
-- ─────────────────────────────────────────────────────────────────────
-- DIE ANTWORT: EIN EINGANGSRIEGEL, DER DIE ANDEREN DREI WIEDERHERSTELLT
-- ─────────────────────────────────────────────────────────────────────
-- Eine Rechnung darf nur als ENTWURF entstehen. Damit ist jeder weitere
-- Status zwingend das Ergebnis eines UPDATEs — und die drei bestehenden
-- Riegel greifen wieder auf ihrem ganzen Weg. Es braucht dafuer keine
-- vierte Regel, die dieselbe Fachlichkeit ein zweites Mal beschreibt.
--
-- ZWEI VOKABULARE, BEIDE ERLAUBT
-- `invoices_status_check` laesst ein deutsches und ein englisches
-- Vokabular zu. Der DEFAULT der Spalte ist 'draft', `create_invoice_-
-- draft_atomic` schreibt 'entwurf', und der Bestand steht live
-- ausschliesslich auf den englischen Werten (sent, disputed, paid).
-- Beide Entwurfsschreibweisen sind deshalb erlaubt; wer nur eine
-- zuliesse, braeche entweder den Spalten-DEFAULT oder die Anlage-RPC.
--
-- WAS AUSDRUECKLICH NICHT ERLAUBT IST
-- Kein 'storniert' beim Anlegen: eine Rechnung, die es nie gab, wird
-- nicht storniert, sondern gar nicht erst geschrieben. Und kein
-- Ausnahmeschalter — eine Umgehung, die niemand braucht, ist an einem
-- Geldweg nur ein zweiter Weg hinein. Wer echte Altrechnungen aus einem
-- Vorsystem uebernehmen muss, spielt dafuer bewusst das Rollback
-- (20261023000003) ein, importiert und setzt den Riegel wieder.
--
-- ─────────────────────────────────────────────────────────────────────
-- WIRKUNG AUF DEN BESTAND
-- ─────────────────────────────────────────────────────────────────────
-- KEINE. Ein Trigger wirkt nur auf kuenftige Schreibvorgaenge. Die drei
-- Bestandszeilen (sent, disputed, paid) bleiben unberuehrt.
--
-- Ein Aufrufer im Repo ist betroffen und wurde mitgeaendert:
-- `scripts/verify-opos-mahnwesen-kette.mjs` legte seine Pruefrechnung
-- direkt als 'uebermittelt' an. Sie laeuft jetzt ueber die
-- Statusmaschine — was die Pruefung ehrlicher macht: sie belegt
-- nebenbei, dass der Weg dorthin ueberhaupt begehbar ist.
--
-- NACHWEIS NACH DEM ANWENDEN
--     npm run verify:opos-mahnwesen   → muss weiterhin 17/17 melden,
--                                        zusaetzlich M17 (neu)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_invoice_eingangsstatus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('entwurf', 'draft') THEN
    RETURN NEW;
  END IF;

  -- ── NULL wird ABGEWIESEN, und das ist kein Versehen ──────────────────
  -- Ein weggelassener Status ist hier nie NULL: Spalten-DEFAULTs werden
  -- VOR den BEFORE-Triggern angewendet, `NEW.status` traegt dann bereits
  -- 'draft'. NULL kommt also nur an, wenn jemand ihn AUSDRUECKLICH
  -- schreibt — und `invoices.status` ist nullable, der CHECK laesst NULL
  -- durch (ein CHECK ist bei NULL erfuellt).
  --
  -- Eine Rechnung ohne Status waere schlimmer als eine mit einem
  -- falschen: sie faellt aus JEDEM Statusfilter heraus. Sie stuende in
  -- keiner Entwurfsliste, in keiner offenen Posten, in keinem Mahnlauf —
  -- und in keiner Auswertung, die nach 'storniert' sucht. Sie waere
  -- schlicht unsichtbar und trotzdem da.
  IF NEW.status IS NULL THEN
    RAISE EXCEPTION
      'RECHNUNG_EINGANGSSTATUS: Eine Rechnung ohne Status ist nicht zulaessig — sie faellt aus jedem Statusfilter heraus.'
      USING HINT = 'Feld weglassen (dann greift der Spalten-DEFAULT ''draft'') oder ausdruecklich ''entwurf'' setzen.';
  END IF;

  RAISE EXCEPTION
    'RECHNUNG_EINGANGSSTATUS: Eine Rechnung kann nur als Entwurf angelegt werden (status = ''entwurf'' oder ''draft''), nicht als ''%''.',
    NEW.status
    USING HINT = 'Jeder weitere Status entsteht durch ein UPDATE — nur dort greifen die Statusmaschine und das Kassen-Freischaltungs-Gate.';
END;
$$;

-- Beide Namen, damit ein zweiter Lauf sauber ist: waehrend der Entwurfs-
-- phase hiess der Trigger einmal ohne das `a_`.
DROP TRIGGER IF EXISTS trg_invoice_eingangsstatus ON public.invoices;
DROP TRIGGER IF EXISTS trg_a_invoice_eingangsstatus ON public.invoices;

-- Der Name beginnt mit `trg_a_`, damit dieser Riegel bei gleichrangigen
-- BEFORE-INSERT-Triggern zuerst laeuft: was gar nicht entstehen darf,
-- soll nicht vorher noch von anderen Triggern bearbeitet werden.
CREATE TRIGGER trg_a_invoice_eingangsstatus
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_eingangsstatus();

COMMENT ON FUNCTION public.enforce_invoice_eingangsstatus() IS
  'Laesst eine Rechnung nur als Entwurf entstehen. Ohne diesen Riegel ist '
  'jeder Endstatus direkt beim INSERT waehlbar, und die drei BEFORE-UPDATE-'
  'Riegel auf invoices sehen die Zeile nie (Befund R1, 31.08.2026).';
