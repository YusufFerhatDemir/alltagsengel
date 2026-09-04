-- ═══════════════════════════════════════════════════════════════════════
-- lead_inquiries: Anfragen aus dem Kundenablauf aufnehmen
-- ═══════════════════════════════════════════════════════════════════════
--
-- 20261027000000 hat `bewerbung_daten` fuer den Bewerberablauf angelegt.
-- Der Kundenablauf braucht dasselbe: die Antworten seiner zehn Schritte,
-- eingefroren zum Zeitpunkt des Absendens.
--
-- ── WARUM EINE ZWEITE SPALTE UND NICHT DIESELBE ────────────────────────
-- `bewerbung_daten` fuer eine Kundenanfrage zu benutzen waere sparsamer
-- und genau deshalb falsch: in einer Tabelle, die beide Vorgangsarten
-- fuehrt, ist ein irrefuehrender Spaltenname eine Falle fuer jede spaetere
-- Abfrage. Wer `WHERE bewerbung_daten IS NOT NULL` schreibt, um Bewerbungen
-- zu zaehlen, bekaeme die Anfragen mit dazu — und wuerde es nicht merken.
--
-- Zwei nullable Spalten, je Zeile ist genau eine gefuellt. Die Frage
-- „welche Art?" beantwortet ohnehin `art`, nicht die Anwesenheit einer
-- Spalte.
--
-- ── WAS BEREITS PASST ──────────────────────────────────────────────────
-- `art`, `email`, `onboarding_progress_id` und `eingereicht_am` gelten
-- fuer beide Ablaeufe unveraendert. Auch der Teil-Unique-Index
-- uq_lead_inquiries_bewerbung_je_ablauf traegt beide: er haengt an
-- onboarding_progress_id und laesst je Ablauf genau eine Zeile zu — bei
-- einer Anfrage genauso wie bei einer Bewerbung. Der Name nennt nur den
-- Anlass seiner Entstehung; umbenannt wird er nicht, weil ein
-- Index-Rename in einer laufenden Tabelle mehr Risiko traegt als der
-- ungenaue Name.
--
-- Rollback: 20261028000001_rollback_lead_inquiries_anfrage_daten.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS anfrage_daten jsonb;

COMMENT ON COLUMN public.lead_inquiries.anfrage_daten IS
  'Antworten der zehn Schritte des Kundenablaufs, zum Zeitpunkt des Absendens '
  'eingefroren. Gegenstueck zu bewerbung_daten; je Zeile ist hoechstens eine '
  'der beiden Spalten gefuellt (welche, sagt `art`).';

COMMIT;
