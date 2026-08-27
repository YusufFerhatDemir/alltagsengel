-- ============================================================================
-- SEPA-Sammelauftrag: dieselbe Rechnung darf nicht zweimal offen im Einzug sein
-- ============================================================================
--
-- BEFUND
--   sepa_batch_items (Migration 20260812120000) hat keinen Eindeutigkeits-
--   Index auf invoice_id. Die Sperre gegen den doppelten Einzug lebte
--   ausschliesslich in TypeScript (createSepaBatch, Befund B-4) und ist dort
--   ein Lesen-dann-Schreiben: zwei gleichzeitige Laeufe mit derselben
--   Rechnung sehen beide eine leere Liste und legen beide einen Posten an.
--   Ergebnis ist eine zweite Abbuchung beim Kunden — eine unberechtigte
--   Lastschrift, die er bis zu 13 Monate zurueckholen kann.
--
-- REGEL
--   Je Rechnung darf hoechstens EIN Posten im Zustand 'offen' oder
--   'eingezogen' stehen. 'ruecklastschrift' und 'fehlerhaft' zaehlen bewusst
--   NICHT mit: dort ist der Posten erledigt, die Forderung lebt weiter und
--   darf erneut eingezogen werden. Dieselbe Abgrenzung trifft der
--   Anwendungscode.
--
-- WIRKUNG
--   Der Verlierer eines Wettlaufs bekommt eine Verletzung des Eindeutigkeits-
--   Index statt einer zweiten Abbuchung. Der CAS-Guard in createSepaBatch
--   bleibt daneben bestehen — er liefert die verstaendliche Meldung und nimmt
--   den halb angelegten Lauf zurueck; dieser Index ist die Grenze, die auch
--   dann haelt, wenn ein anderer Weg (Skript, SQL-Editor, kuenftiger Dienst)
--   an ihm vorbei schreibt.
--
-- VORPRUEFUNG
--   Legt der Index sich nicht an, gibt es bereits doppelte offene Posten.
--   Diese Abfrage zeigt sie:
--
--     SELECT invoice_id, count(*)
--       FROM public.sepa_batch_items
--      WHERE status IN ('offen','eingezogen')
--      GROUP BY invoice_id HAVING count(*) > 1;
--
--   Solche Faelle sind fachlich zu klaeren (welcher Einzug gilt?), nicht
--   blind zu loeschen — an jedem Posten haengt eine echte Abbuchung.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_sepa_batch_items_invoice_offen
  ON public.sepa_batch_items (invoice_id)
  WHERE status IN ('offen', 'eingezogen');

COMMENT ON INDEX public.uq_sepa_batch_items_invoice_offen IS
  'Je Rechnung hoechstens ein laufender Lastschriftposten (offen/eingezogen). '
  'Verhindert den doppelten Einzug bei parallelen Sammelauftraegen. '
  'ruecklastschrift/fehlerhaft sind ausgenommen — dort darf erneut eingezogen werden.';
