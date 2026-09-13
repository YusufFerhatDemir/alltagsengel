-- Rollback zu 20261106000000_bewerbung_ats_felder.sql
--
-- ACHTUNG: Loescht die Spalten samt Inhalt. Wurden die Felder bereits
-- befuellt, gehen die Angaben verloren — zuerst nach
-- `bewerbung_daten.ats` zurueckschreiben, dann rollen.

DROP INDEX IF EXISTS public.lead_inquiries_ats_startdatum_idx;

ALTER TABLE public.lead_inquiries
  DROP CONSTRAINT IF EXISTS lead_inquiries_ats_fz_status_check,
  DROP CONSTRAINT IF EXISTS lead_inquiries_ats_mobilitaet_check,
  DROP CONSTRAINT IF EXISTS lead_inquiries_ats_prioritaet_check,
  DROP CONSTRAINT IF EXISTS lead_inquiries_ats_erfahrung_check,
  DROP CONSTRAINT IF EXISTS lead_inquiries_ats_stunden_check,
  DROP CONSTRAINT IF EXISTS lead_inquiries_ats_fz_datum_braucht_status;

ALTER TABLE public.lead_inquiries
  DROP COLUMN IF EXISTS ats_startdatum,
  DROP COLUMN IF EXISTS ats_fz_status,
  DROP COLUMN IF EXISTS ats_fz_datum,
  DROP COLUMN IF EXISTS ats_erfahrung_jahre,
  DROP COLUMN IF EXISTS ats_mobilitaet,
  DROP COLUMN IF EXISTS ats_stunden_pro_woche,
  DROP COLUMN IF EXISTS ats_einsatzgebiet,
  DROP COLUMN IF EXISTS ats_notizen,
  DROP COLUMN IF EXISTS ats_letzter_kontakt,
  DROP COLUMN IF EXISTS ats_naechste_aktion,
  DROP COLUMN IF EXISTS ats_prioritaet;
