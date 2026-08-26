# ChairMatch Pricing — BUSINESS_INPUT_REQUIRED

Stand: 2026-08-26

## Status

Beide Preistabellen (`protect_pricing`, `compliance_plans`) im ChairMatch-Supabase-Projekt
(pwdbjqfpgumyfktbfswg) sind **strukturell vollstaendig und LEER**.

Die Schema-Migration `20260824_pricing_schema.sql` legt Spalten, Constraints und RLS an.
Die Gueltigkeitsmigration `20260826_pricing_gueltigkeit.sql` fuegt `effective_from/effective_to`
mit EXCLUDE-Constraint hinzu (verhindert ueberlappende Preiszeitraeume je Stufe/Plan).

## Seed-Templates (keine Preise enthalten)

| Datei | Wann verwenden |
|---|---|
| `supabase/seed/pricing.seed.template.sql` | VOR der Gueltigkeitsmigration (ueberschreibt per ON CONFLICT) |
| `supabase/seed/pricing.seed.versioniert.template.sql` | NACH der Gueltigkeitsmigration (schliesst alten Preis, legt neuen an) |

Beide enthalten `<<<PLATZHALTER>>>` — laeuft die Datei ungefuellt, bricht Postgres mit
Syntaxfehler ab. Keine Fantasiepreise moeglich.

## Offene Geschaeftsentscheidungen

| ID | Frage | Quelle | Schwere |
|---|---|---|---|
| C1 | Welche Betraege stehen in protect_pricing und compliance_plans? | Geschaeftsfuehrung | entscheidung |
| C2 | Wird Protect fuer alle vier Risikostufen verkauft oder nur HIGH/VERY_HIGH? | Geschaeftsfuehrung | entscheidung |
| C3 | Sind die Betraege netto oder brutto? | Geschaeftsfuehrung / Steuerkanzlei | entscheidung |
| C4 | Bleibt es bei one_time / yearly / monthly? | Geschaeftsfuehrung | entscheidung |
| C5 | Soll die Gueltigkeitsmigration vor dem ersten Verkauf angewendet werden? | Geschaeftsfuehrung | entscheidung |

## Validiertes Feld-Schema

### protect_pricing

| Spalte | Typ | Constraint | Beschreibung |
|---|---|---|---|
| risk_level | text NOT NULL | CHECK IN ('LOW','MED','HIGH','VERY_HIGH') | Risikostufe |
| day_price_cents | integer NOT NULL | >= 0 | Tagespreis in Cent (0 = gratis, nicht "gibt es nicht") |
| month_price_cents | integer NOT NULL | >= 0 | Monatspreis in Cent |
| year_price_cents | integer NOT NULL | >= 0 | Jahrespreis in Cent |
| currency | text NOT NULL | CHECK ~ '^[A-Z]{3}$', DEFAULT 'EUR' | ISO 4217 |
| active | boolean NOT NULL | DEFAULT true | Aktiv-Flag |
| effective_from | date NOT NULL | DEFAULT CURRENT_DATE | Gueltig ab (nach Gueltigkeitsmigration) |
| effective_to | date | NULL = offen | Gueltig bis (nach Gueltigkeitsmigration) |

### compliance_plans

| Spalte | Typ | Constraint | Beschreibung |
|---|---|---|---|
| plan_type | text NOT NULL | CHECK IN ('one_time','yearly','monthly') | Planbezeichnung |
| price_cents | integer NOT NULL | >= 0 | Grundpreis in Cent |
| included_submissions | integer NOT NULL | >= 0, DEFAULT 0 | Inkl. Einreichungen |
| min_term_months | integer NOT NULL | >= 0, DEFAULT 0 | Mindestlaufzeit Monate |
| extra_submission_price_cents | integer NOT NULL | >= 0, DEFAULT 0 | Preis je Zusatzeinreichung |
| currency | text NOT NULL | CHECK ~ '^[A-Z]{3}$', DEFAULT 'EUR' | ISO 4217 |
| active | boolean NOT NULL | DEFAULT true | Aktiv-Flag |
| effective_from | date NOT NULL | DEFAULT CURRENT_DATE | Gueltig ab (nach Gueltigkeitsmigration) |
| effective_to | date | NULL = offen | Gueltig bis (nach Gueltigkeitsmigration) |

## Ablauf

1. Geschaeftsfuehrung beantwortet C1–C5
2. Seed-Template kopieren, Platzhalter ersetzen, nicht verkaufte Zeilen streichen
3. Im Supabase-SQL-Editor ausfuehren
4. Gegenprobe: `SELECT * FROM protect_pricing; SELECT * FROM compliance_plans;`

## Blockiert Alltagsengel?

**NEIN.** ChairMatch ist ein eigenes Repo (/Users/work/chairmatch) mit eigenem Supabase-Projekt.
Der Alltagsengel-Rechnungspilot liest keine ChairMatch-Tabelle. Der Unabhaengigkeitstest
(`__tests__/pilot/business-inputs.test.ts`) stellt das sicher.
