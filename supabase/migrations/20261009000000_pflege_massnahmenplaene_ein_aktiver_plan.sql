-- ============================================================================
-- pflege_massnahmenplaene: hoechstens ein aktiver Plan je Klient
-- ============================================================================
--
-- BEFUND
--   freigebenPlan() (lib/pflege/massnahmenplaene.ts) loest den bisher aktiven
--   Plan und aktiviert den neuen in ZWEI getrennten UPDATE-Statements ohne
--   Transaktions-/Sperrschutz. Bei zwei gleichzeitigen Freigaben fuer
--   denselben Klienten (zwei Browser-Tabs, Doppelklick) kann die Ablöse
--   beider Aufrufe laufen, BEVOR einer der beiden Aktivierungs-Schritte
--   greift — Ergebnis: zwei gleichzeitig aktive Plaene fuer denselben
--   Klienten. Welcher Plan "der" gueltige Versorgungsplan ist, wird damit
--   uneindeutig.
--
-- REGEL
--   Je Klient darf hoechstens EIN Plan im Status 'aktiv' stehen.
--
-- WIRKUNG
--   Der Verlierer eines Wettlaufs bekommt eine Verletzung des Eindeutigkeits-
--   Index statt eines zweiten, parallel aktiven Plans. lib/pflege/
--   massnahmenplaene.ts:freigebenPlan() bildet den Fehlercode 23505 bereits
--   auf eine deutschsprachige Meldung ab ("Für diesen Kunden wurde in der
--   Zwischenzeit bereits ein anderer Plan freigegeben.").
--
-- VORPRUEFUNG
--   Legt der Index sich nicht an, gibt es bereits mehrere aktive Plaene:
--
--     SELECT client_id, count(*)
--       FROM public.pflege_massnahmenplaene
--      WHERE status = 'aktiv'
--      GROUP BY client_id HAVING count(*) > 1;
--
--   Solche Faelle sind fachlich zu klaeren (welcher Plan gilt?), nicht blind
--   einen davon umzuschalten.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_pflege_massnahmenplaene_ein_aktiver_plan
  ON public.pflege_massnahmenplaene (organization_id, client_id)
  WHERE status = 'aktiv';

COMMENT ON INDEX public.uq_pflege_massnahmenplaene_ein_aktiver_plan IS
  'Je Klient hoechstens ein aktiver Massnahmenplan. Verhindert die Race '
  'Condition in freigebenPlan() (zwei getrennte UPDATE-Statements ohne '
  'Transaktionsschutz).';
