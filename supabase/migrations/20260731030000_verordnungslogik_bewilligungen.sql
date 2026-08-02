-- ═══════════════════════════════════════════════════════════════
-- Eylems Korrektur: Verordnung vs. Bewilligung unterscheiden
-- ---------------------------------------------------------------
-- §37 SGB V  (Behandlungspflege)      → echte ärztliche Verordnung (Muster 12)
-- §36 SGB XI (Pflegesachleistung)     → KEINE Verordnung, Zusage der Pflegekasse (Kombi)
-- §45b SGB XI (Entlastungsbetrag)     → KEINE Verordnung, 131 €/Monat automatischer Anspruch
-- §39 SGB XI (Verhinderungspflege)    → KEINE Verordnung, Antrag bei Pflegekasse
-- §45a SGB XI (Alltagsbegleitung)     → KEINE Verordnung, Anerkennung nach Landesrecht
-- §40 SGB XI (Pflegebox)              → KEINE Verordnung, bis 40 €/Monat Pflegehilfsmittel
-- §38 SGB XI (Kombinationsleistung)   → Kombi-Zusage der Pflegekasse erforderlich
-- Bereits angewendet via Supabase MCP (apply_migration) am 31.07.2026.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS ist_verordnung boolean DEFAULT true;
-- true = ärztliche Verordnung (§37), false = Bewilligung/Zusage/Anspruch

ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kombinationsleistung boolean DEFAULT false;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kombi_zusage_vorhanden boolean DEFAULT false;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kombi_zusage_datum date;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kombi_zusage_aktenzeichen text;

-- Budget-Felder: §45b = 13100 (131 €), §40 = 4000 (40 €), §39 individuell
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS monatliches_budget_cent integer;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS budget_verbraucht_cent integer DEFAULT 0;

-- Bestehende Daten: §37 = Verordnung, alles andere = Bewilligung
UPDATE verordnungen SET ist_verordnung = (verordnung_type = 'behandlungspflege_37');

-- Erweiterte Verordnungstypen
ALTER TABLE verordnungen DROP CONSTRAINT IF EXISTS verordnungen_verordnung_type_check;
ALTER TABLE verordnungen ADD CONSTRAINT verordnungen_verordnung_type_check
  CHECK (verordnung_type IN (
    'behandlungspflege_37',
    'haeusliche_pflege_36',
    'entlastung_45b',
    'verhinderung_39',
    'alltagsbegleitung_45a',
    'pflegebox_40',
    'fahrdienst',
    'kombinationsleistung_38',
    'sonstige'
  ));

-- Erweiterte Leistungsarten (Pflegebox, Fahrdienste, Kombi)
ALTER TABLE verordnungen DROP CONSTRAINT IF EXISTS verordnungen_leistungsart_check;
ALTER TABLE verordnungen ADD CONSTRAINT verordnungen_leistungsart_check
  CHECK (leistungsart IN (
    'grosse_koerperpflege', 'kleine_koerperpflege', 'hilfe_ausscheiden',
    'hauswirtschaft', 'behandlungspflege', 'medikamentengabe',
    'injektionen', 'wundversorgung', 'kompressionsstruempfe',
    'blutzuckermessung', 'katheter', 'stomaversorgung',
    'alltagsbegleitung_45a', 'verhinderungspflege_39', 'entlastung_45b',
    'pflegebox', 'fahrdienst_begleitung', 'fahrdienst_transport',
    'kombinationsleistung', 'sonstige'
  ));

-- Gleicher erweiterter CHECK für Leistungspositionen
ALTER TABLE verordnung_leistungen DROP CONSTRAINT IF EXISTS verordnung_leistungen_leistungsart_check;
ALTER TABLE verordnung_leistungen ADD CONSTRAINT verordnung_leistungen_leistungsart_check
  CHECK (leistungsart IN (
    'grosse_koerperpflege', 'kleine_koerperpflege', 'hilfe_ausscheiden',
    'hauswirtschaft', 'behandlungspflege', 'medikamentengabe',
    'injektionen', 'wundversorgung', 'kompressionsstruempfe',
    'blutzuckermessung', 'katheter', 'stomaversorgung',
    'alltagsbegleitung_45a', 'verhinderungspflege_39', 'entlastung_45b',
    'pflegebox', 'fahrdienst_begleitung', 'fahrdienst_transport',
    'kombinationsleistung', 'sonstige'
  ));
