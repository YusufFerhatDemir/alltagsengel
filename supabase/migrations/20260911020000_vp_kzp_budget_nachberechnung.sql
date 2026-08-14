-- ═══════════════════════════════════════════════════════════════════════════
-- H-2: VP/KZP-Anspruch (§ 42a SGB XI) fehlt bei Bestandskunden ab PG 2
-- Datum:  2026-08-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEFUND (live 14.08.2026)
--   Beide Klienten mit Pflegegrad 2 führen combined_annual_amount = 0 statt
--   3.539 €. Der gemeinsame Jahresbetrag für Verhinderungs- und Kurzzeitpflege
--   (§ 42a SGB XI, seit 01.07.2025 EIN flexibles Budget) fehlt vollständig:
--
--     AE-TEST-0001  PG2   §45b 1.572 €   §42a     0 €   ← fehlt
--     AE-TEST-0002  PG3   §45b 1.572 €   §42a 3.539 €
--     AE-TEST-0003  PG2   §45b 1.572 €   §42a     0 €   ← fehlt
--     TEST-2026-001 PG3   §45b 1.572 €   §42a 3.539 €
--
-- URSACHE
--   lib/budget/auto-budget.ts → erstelleInitialBudgets() berechnet den
--   §42a-Anspruch korrekt (Zeile: vpAnspruch = pflegegrad >= minPflegegradVpKzp
--   ? vpKzpKombiniert : 0), wird aber nur an zwei Stellen gerufen:
--     • app/api/admin/clients/route.ts             (Kundenanlage)
--     • app/api/admin/clients/[id]/pflegegrad/route.ts (PG-Änderung)
--   Wer die Budgetzeile bekam, bevor ein Pflegegrad hinterlegt war, behält
--   combined_annual_amount = 0. Der Backfill 20260907000000 hat danach zwar
--   clients.pflegegrad an care_level angeglichen, aber KEINE Budgets
--   nachbewertet — es gibt keinen Pfad, der bestehende Budgetzeilen erneut
--   gegen den aktuellen Pflegegrad prüft.
--
--   Sichtbar wird das erst bei der ersten Verhinderungspflege: die
--   Budgetprüfung findet 0 € Anspruch und lehnt eine berechtigte Leistung ab.
--
-- LÖSUNG — reine Datenkorrektur, kein DDL
--   Für jede bestehende Budgetzeile eines Klienten mit Pflegegrad ≥ 2 wird
--   combined_annual_amount auf den gesetzlichen Jahresbetrag gesetzt, SOFERN
--   dort bisher nichts (NULL oder 0) steht. Ein bereits gepflegter Wert wird
--   NIEMALS überschrieben — auch kein abweichender (z. B. manuell gekürzter
--   Anspruch nach Teilinanspruchnahme bei einem anderen Leistungserbringer).
--
--   Beträge sind die gesetzlichen Werte aus lib/config/budget-constants.ts,
--   NICHT geschätzt und nicht erfunden:
--     ab 2025:  3.539 €  (§ 42a, PUEG +4,5 %, gemeinsamer Jahresbetrag)
--        2024:  3.386 €  (Vorgängerwert; nur vollständigkeitshalber)
--   Für Jahre ohne hinterlegten gesetzlichen Wert (< 2024) wird bewusst
--   NICHTS gesetzt — dieselbe Fail-Closed-Regel wie budgetVersionFuerJahr().
--
--   Pflegegrad-Quelle: COALESCE(care_level, pflegegrad). care_level ist die
--   führende Spalte (siehe lib/clients/pflegegrad.ts / pflegegradVon), bei
--   Bestandskunden ist pflegegrad teilweise NULL geblieben.
--
--   Mindest-Pflegegrad 2 = version.minPflegegradVpKzp. PG-1-Klienten haben
--   keinen §42a-Anspruch und bleiben unangetastet.
--
-- KEINE KÜNSTLICHEN TESTDATEN
--   Die Migration legt keine Budgetzeile an und keinen Klienten. Sie
--   korrigiert ausschliesslich Zeilen, die bereits existieren. Klienten ohne
--   Budgetzeile bleiben ohne Budgetzeile — die legt weiterhin
--   erstelleInitialBudgets() bzw. scripts/budget-nachziehen.ts an.
--
-- ── ANALYSE FÜR M-3 (Trigger care_level/pflegegrad — separater Fix) ────────
--   Die naheliegende Antwort „Trigger, der pflegegrad auf care_level spiegelt"
--   löst dieses Problem NICHT. Die Spalten waren hier nicht das Problem:
--   care_level war bei beiden PG-2-Klienten korrekt gesetzt, die Budgetzeile
--   war trotzdem leer. Das Reparaturbedürfnis liegt eine Ebene höher.
--
--   Was tatsächlich fehlt, ist ein Nachbewertungs-Pfad: „Pflegegrad steigt
--   von 1 auf 2 ⇒ §42a-Anspruch entsteht ab sofort". Heute gibt es ihn nur
--   im Anwendungscode (PATCH …/pflegegrad ruft erstelleInitialBudgets), also
--   nicht für Schreibwege daneben (SQL-Editor, Import, Backfill).
--
--   Empfehlung für M-3, in dieser Reihenfolge:
--     1. AFTER UPDATE OF care_level, pflegegrad ON public.clients:
--        Spaltenspiegelung (care_level → pflegegrad), damit die VIEW
--        pflege_uebersicht und der FHIR-/EDIFACT-Mapper nicht weiter NULL
--        sehen. Achtung: 20260907000000 hat einen solchen Trigger bewusst
--        abgelehnt („zweite Wahrheit"). Der Einwand gilt weiter, SOLANGE
--        beide Schreibwege beide Spalten setzen — der Trigger ist nur als
--        Netz für Schreibwege ausserhalb der App zu rechtfertigen.
--     2. Getrennt davon: Nachbewertung der Budgetzeile des laufenden Jahres
--        beim Anheben des Pflegegrads auf ≥ 2 (nur ergänzen, nie kürzen —
--        eine Rückstufung darf einen bereits verbrauchten Anspruch nicht
--        rückwirkend entziehen).
--     3. Beträge dürfen dabei NICHT im Trigger hartkodiert werden. Sie
--        gehören in eine Tabelle mit gueltig_ab/gueltig_bis analog
--        BUDGET_VERSIONEN, sonst entsteht eine dritte Preisquelle neben
--        billing_tariffs und leistungspreise.
--   Punkt 2 und 3 zusammen sind ein eigener, getesteter Schritt und
--   ausdrücklich NICHT Teil dieser Migration.
--
-- IDEMPOTENT: die WHERE-Klausel trifft beim zweiten Lauf 0 Zeilen.
-- ROLLBACK:   20260911020001_rollback_vp_kzp_budget_nachberechnung.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.client_budgets cb
   SET combined_annual_amount = CASE
         WHEN cb.year >= 2025 THEN 3539.0
         WHEN cb.year  = 2024 THEN 3386.0
       END,
       updated_at = now()
  FROM public.clients c
 WHERE c.id = cb.client_id
   AND cb.year >= 2024
   AND COALESCE(c.care_level, c.pflegegrad) >= 2
   AND COALESCE(cb.combined_annual_amount, 0) = 0;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply manuell ausführen)
--
--   -- Erwartung: keine Zeile mehr mit PG >= 2 und leerem §42a-Anspruch
--   SELECT c.customer_number,
--          COALESCE(c.care_level, c.pflegegrad) AS pg,
--          cb.year,
--          cb.annual_amount           AS entlastung_45b,
--          cb.combined_annual_amount  AS vp_kzp_42a
--     FROM public.client_budgets cb
--     JOIN public.clients c ON c.id = cb.client_id
--    WHERE COALESCE(c.care_level, c.pflegegrad) >= 2
--      AND COALESCE(cb.combined_annual_amount, 0) = 0;
--   -- erwartet: 0 Zeilen
--
--   -- Gegenprobe: PG-1-Klienten haben weiterhin KEINEN §42a-Anspruch
--   SELECT count(*) FROM public.client_budgets cb
--     JOIN public.clients c ON c.id = cb.client_id
--    WHERE COALESCE(c.care_level, c.pflegegrad) = 1
--      AND COALESCE(cb.combined_annual_amount, 0) > 0;
--   -- erwartet: 0
--
--   -- Klienten OHNE Budgetzeile bleiben offen (diese Migration legt keine an):
--   --   npx tsx scripts/budget-nachziehen.ts
-- ═══════════════════════════════════════════════════════════════════════════
