-- ═══════════════════════════════════════════════════════════════
-- DAKOTA/SFTP: Fehlercode-Katalog befüllen
-- ═══════════════════════════════════════════════════════════════
--
-- Quelle: Technische Anlage 1 (TA1) Version 6.5.1 zum
-- Datenträgeraustauschverfahren nach § 105 SGB XI,
-- GKV-Spitzenverband, Fehlerverzeichnis Anlage 4.
--
-- DAVASO-spezifische Codes: DAVASO Fehlerverzeichnis Stand 2025-06.
-- BITMARCK-Codes: BITMARCK Fehlerverzeichnis Stand 2025-09.
--
-- Jeder Eintrag braucht spec_quelle (Quellenangabe) — ohne
-- Quelle wird ein Eintrag als Behauptung behandelt und
-- pflegeKatalogEintrag() wirft.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.dta_fehlercode_katalog
  (organization_id, kassen_code, quelle_ik, kategorie, beschreibung, massnahme, korrigierbar, spec_quelle, created_by)
VALUES
  -- TA1 Anlage 4: Allgemeine Fehlercodes
  (NULL, '01', NULL, 'verarbeitungsfehler',
   'Auftragsdatei fehlerhaft oder nicht lesbar',
   'Auftragsdatei-Format pruefen (Anlage 3), Uebertragung wiederholen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '02', NULL, 'verarbeitungsfehler',
   'Nutzdatendatei fehlerhaft — EDIFACT-Struktur ungueltig',
   'EDIFACT-Validator ausfuehren, Segmentstruktur pruefen, erneut senden.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '03', NULL, 'verarbeitungsfehler',
   'Entschluesselung fehlgeschlagen — Zertifikat oder Signatur ungueltig',
   'ITSG-Zertifikat erneuern, SECON-Verschluesselung pruefen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '04', NULL, 'verarbeitungsfehler',
   'Absender-IK unbekannt oder nicht zugelassen',
   'IK beim ITSG Trust Center pruefen, Zulassung beim GKV-SV beantragen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '05', NULL, 'verarbeitungsfehler',
   'Empfaenger-IK nicht zustaendig fuer die enthaltenen Kostentraeger',
   'Datenannahmestelle-Routing pruefen (Schluesselverzeichnis DAS/KVdR/VdEK).',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '10', NULL, 'datenfehler',
   'Versichertennummer fehlt oder unplausibel',
   'Versichertennummer mit Versichertenkarte abgleichen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '11', NULL, 'versicherter_unbekannt',
   'Versicherter zum Leistungszeitraum nicht bei diesem Kostentraeger versichert',
   'Kassenzugehoerigkeit des Klienten pruefen, ggf. Kostentraeger aendern.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '12', NULL, 'datenfehler',
   'Pflegegrad fehlt oder weicht vom Gutachten ab',
   'Pflegegrad im System mit dem MDK-Bescheid abgleichen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '13', NULL, 'datenfehler',
   'Leistungszeitraum liegt ausserhalb des Genehmigungszeitraums',
   'Verordnungszeitraum pruefen, ggf. Folge-Verordnung einholen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '20', NULL, 'tarifabweichung',
   'Abrechnungsbetrag uebersteigt den vereinbarten Vergütungssatz',
   'Vertragspreis mit Landesrahmenvertrag abgleichen, Tarifverwaltung pruefen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '21', NULL, 'tarifabweichung',
   'Leistungskomplex nicht im Verguetungsverzeichnis',
   'Leistungsart-Schluessel (Anlage 2) pruefen, Position korrigieren.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '22', NULL, 'tarifabweichung',
   'Kuerzung: Betrag auf vereinbarten Vergütungssatz reduziert',
   'Akzeptieren oder Widerspruch einlegen. Tarif korrigieren um Wiederholung zu vermeiden.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '30', NULL, 'datenfehler',
   'Beschaeftigtennummer fehlt oder ungueltig',
   'Beschaeftigtennummer nach § 293 Abs. 8 SGB V pruefen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  (NULL, '31', NULL, 'datenfehler',
   'Geburtsdatum des Versicherten fehlt oder unplausibel',
   'Geburtsdatum mit Versichertenkarte abgleichen.',
   true, 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis', NULL),

  -- DAVASO-spezifische Codes
  (NULL, 'D01', NULL, 'verarbeitungsfehler',
   'DAVASO: Dateiname entspricht nicht dem vereinbarten Schema',
   'Dateinamen-Konvention pruefen (DAVASO Handbuch).',
   true, 'DAVASO Fehlerverzeichnis Stand 2025-06', NULL),

  (NULL, 'D10', NULL, 'versicherter_unbekannt',
   'DAVASO: Zuordnung Versicherter/Kostentraeger nicht moeglich',
   'Versichertennummer und IK-Nummer des Kostentraegers abgleichen.',
   true, 'DAVASO Fehlerverzeichnis Stand 2025-06', NULL),

  (NULL, 'D20', NULL, 'tarifabweichung',
   'DAVASO: Tarifkennzeichen unbekannt fuer diese Verguetungsvereinbarung',
   'Tarifkennzeichen im Schluesselverzeichnis pruefen, Bundesland-Zuordnung kontrollieren.',
   true, 'DAVASO Fehlerverzeichnis Stand 2025-06', NULL),

  -- BITMARCK-spezifische Codes
  (NULL, 'B01', NULL, 'verarbeitungsfehler',
   'BITMARCK: Nutzdatendatei konnte nicht entschluesselt werden',
   'Empfaengerzertifikat pruefen, SECON-Tool aktualisieren.',
   true, 'BITMARCK Fehlerverzeichnis Stand 2025-09', NULL),

  (NULL, 'B10', NULL, 'versicherter_unbekannt',
   'BITMARCK: Versichertenverhaeltnis zum Leistungsdatum nicht bestaetigbar',
   'Versichertennummer mit aktueller eGK abgleichen.',
   true, 'BITMARCK Fehlerverzeichnis Stand 2025-09', NULL),

  (NULL, 'B20', NULL, 'tarifabweichung',
   'BITMARCK: Vergütungssatz weicht vom hinterlegten Vertrag ab',
   'Vertragspreis im System mit dem bei BITMARCK hinterlegten Satz abgleichen.',
   true, 'BITMARCK Fehlerverzeichnis Stand 2025-09', NULL)

ON CONFLICT DO NOTHING;
