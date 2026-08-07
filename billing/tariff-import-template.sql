-- ════════════════════════════════════════════════════════════════════════════
-- TARIF-IMPORT-TEMPLATE
-- Datum: 2026-08-07
--
-- ANLEITUNG:
-- 1. Zeilen mit "FACHLICH_ZU_LIEFERN" durch echte Werte ersetzen
-- 2. Fuer jede Leistungsart/Rechtsgrundlage/Kostentraeger-Kombination
--    einen Eintrag erstellen
-- 3. Preise in CENT (ganzzahlig, z.B. 3500 = 35.00 EUR)
-- 4. Zuschlaege in PROZENT (z.B. 25.00 = 25%)
-- 5. gueltig_ab = Datum ab dem der Tarif gilt
-- 6. gueltig_bis = NULL fuer unbefristete Tarife
--
-- WICHTIG:
-- - Keine erfundenen Preise verwenden!
-- - Leistungsarten muessen aus dem Katalog (billing_leistungsarten) stammen
-- - Rechtsgrundlagen muessen aus dem Katalog (billing_rechtsgrundlagen) stammen
-- - IK-Nummern muessen gueltige Pruefziffern haben (§293 SGB V)
-- ════════════════════════════════════════════════════════════════════════════

-- Erlaubte Leistungsarten (aus Katalog):
-- alltagsbegleitung, betreuung_45a, verhinderungspflege, hauswirtschaft,
-- einkaufsservice, begleitservice, nachtbetreuung, wochenendbetreuung,
-- krankenfahrt, demenzbetreuung, wegepauschale, sonstige

-- Erlaubte Rechtsgrundlagen (aus Katalog):
-- §45b SGB XI, §39 SGB XI, §36 SGB XI, privat

-- Erlaubte Verguetungsarten:
-- zeit_stunde, zeit_minute, leistungskomplex, pauschale, wegepauschale, zuschlag

-- ────────────────────────────────────────────────────────────────────────────
-- BEISPIEL-STRUKTUR (Preise = Platzhalter, NICHT verwenden!)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id,
  leistungsart,
  rechtsgrundlage,
  verguetungsart,
  preis_cent,               -- FACHLICH_ZU_LIEFERN
  einheit,
  bundesland,
  kostentraeger_ik,         -- NULL = generischer Tarif
  gueltig_ab,
  gueltig_bis,              -- NULL = unbefristet
  zuschlag_wochenende_prozent,  -- Default 0
  zuschlag_feiertag_prozent,    -- Default 0
  zuschlag_nacht_prozent,       -- Default 0
  nacht_von,                    -- Default '20:00'
  nacht_bis,                    -- Default '06:00'
  ist_aktiv,
  created_by
) VALUES
  -- ── Alltagsbegleitung (§45b, generisch fuer Hessen) ──
  (
    'FACHLICH_ZU_LIEFERN',    -- organization_id (UUID)
    'alltagsbegleitung',
    '§45b SGB XI',
    'zeit_stunde',
    0,                         -- FACHLICH_ZU_LIEFERN: Preis in Cent
    'Stunde',
    'hessen',
    NULL,                      -- generischer Tarif (ohne IK)
    '2026-01-01',              -- FACHLICH_ZU_LIEFERN: Gueltig ab
    NULL,                      -- unbefristet
    0,                         -- kein Wochenendzuschlag (Standard)
    0,                         -- kein Feiertagszuschlag (Standard)
    0,                         -- kein Nachtzuschlag (Standard)
    '20:00',
    '06:00',
    TRUE,
    NULL                       -- created_by (Actor-UUID, optional)
  ),

  -- ── Alltagsbegleitung (§45b, IK-spezifisch fuer bestimmte Kasse) ──
  (
    'FACHLICH_ZU_LIEFERN',    -- organization_id
    'alltagsbegleitung',
    '§45b SGB XI',
    'zeit_stunde',
    0,                         -- FACHLICH_ZU_LIEFERN: Preis in Cent
    'Stunde',
    'hessen',
    'FACHLICH_ZU_LIEFERN',    -- kostentraeger_ik (9 Ziffern)
    '2026-01-01',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Hauswirtschaft (§45b, generisch) ──
  (
    'FACHLICH_ZU_LIEFERN',
    'hauswirtschaft',
    '§45b SGB XI',
    'zeit_stunde',             -- oder 'zeit_minute' je nach Abrechnungsmodell
    0,                         -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    '2026-01-01',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Wegepauschale (§45b) ──
  (
    'FACHLICH_ZU_LIEFERN',
    'wegepauschale',
    '§45b SGB XI',
    'wegepauschale',
    0,                         -- FACHLICH_ZU_LIEFERN
    'Fahrt',
    'hessen',
    NULL,
    '2026-01-01',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Verhinderungspflege (§39) ──
  (
    'FACHLICH_ZU_LIEFERN',
    'alltagsbegleitung',
    '§39 SGB XI',
    'zeit_stunde',
    0,                         -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    '2026-01-01',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  )

  -- Weitere Tarife hier einfuegen...
  -- Fuer jede Kombination aus Leistungsart + Rechtsgrundlage + ggf. Kostentraeger
;

-- ════════════════════════════════════════════════════════════════════════════
-- CHECKLISTE VOR IMPORT:
-- ════════════════════════════════════════════════════════════════════════════
-- [ ] Alle "FACHLICH_ZU_LIEFERN" durch echte Werte ersetzt
-- [ ] Alle Preise in Cent (ganzzahlig, keine Kommazahlen)
-- [ ] Alle IK-Nummern auf Pruefziffer geprueft
-- [ ] Alle Leistungsarten im Katalog vorhanden
-- [ ] Alle Rechtsgrundlagen im Katalog vorhanden
-- [ ] gueltig_ab Datum korrekt
-- [ ] Keine zeitlichen Ueberlappungen fuer gleiche Kombination
-- [ ] organization_id ist die korrekte Alltagsengel-UUID
-- [ ] Migration auf Staging-Branch getestet
-- [ ] Yusuf hat echte Tarif-Werte freigegeben
