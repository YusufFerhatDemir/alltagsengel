# Anleitung: SEPA Gläubiger-Identifikationsnummer (Creditor-ID) beantragen

**Stand:** 2026-08-12

---

## Was ist die Creditor-ID?

Die **Gläubiger-Identifikationsnummer** (Creditor Identifier, CI) ist eine eindeutige Kennung für jeden Gläubiger im SEPA-Lastschriftverfahren. Sie ist **zwingend erforderlich**, um SEPA-Lastschriften einziehen zu können.

**Aktueller Status in Alltagsengel:** Der Platzhalter `DE98ZZZ09999999999` ist konfiguriert. Dieser muss vor dem ersten Lastschrifteinzug durch die echte Creditor-ID ersetzt werden.

---

## Schritt-für-Schritt-Anleitung

### Schritt 1: Online-Beantragung bei der Deutschen Bundesbank

**URL:** https://extranet.bundesbank.de/scp/

1. Rufen Sie die Webseite der Deutschen Bundesbank für die Gläubiger-ID-Vergabe auf
2. Wählen Sie „Gläubiger-Identifikationsnummer beantragen"
3. Füllen Sie das Formular aus:
   - **Antragsteller:** Alltagsengel [vollständiger Firmenname]
   - **Rechtsform:** [GmbH / UG / etc.]
   - **Anschrift:** [Geschäftsadresse]
   - **Kontaktdaten:** [E-Mail, Telefon]
   - **Verwendungszweck:** SEPA-Basislastschrift für Einzug von Entlastungsleistungen (§ 45b SGB XI)

### Schritt 2: Bestätigung erhalten

- Die Creditor-ID wird in der Regel **innerhalb weniger Minuten** per E-Mail zugestellt
- Das Format ist: `DE` + 2 Prüfziffern + `ZZZ` (oder Geschäftsbereichskennung) + nationale Kennung
- Beispiel: `DE98ZZZ01234567890`

### Schritt 3: Creditor-ID im System konfigurieren

Die Creditor-ID wird in der Datenbank in der `organizations`-Tabelle gespeichert (Spalte `sepa_creditor_id`).

**Option A: Über das Admin-Dashboard**
1. Einloggen als Admin
2. Navigation zu Einstellungen → Organisation
3. Feld „SEPA Gläubiger-ID" ausfüllen
4. Speichern

**Option B: Direkt in Supabase**
```sql
UPDATE organizations
SET sepa_creditor_id = 'DE[XX]ZZZ[XXXXXXXXXX]'
WHERE id = '00000000-0000-4000-8000-000460629986';
```

### Schritt 4: SEPA-Mandatsverwaltung starten

Nach Konfiguration der echten Creditor-ID:
1. SEPA-Mandate für bestehende Kunden einrichten
2. Mandatsreferenzen vergeben (Format: `MREF-[Kundennr]-[lfd.Nr.]`)
3. Pre-Notifications versenden (mind. 14 Tage vor erstem Einzug)

---

## Wichtige Hinweise

- Die Beantragung ist **kostenlos**
- Pro Unternehmen wird **eine** Creditor-ID vergeben (mit optionalen Geschäftsbereichskennungen)
- Die Creditor-ID ist **lebenslang gültig** und ändert sich nicht
- Sie muss auf allen SEPA-Mandatsformularen und Pre-Notifications angegeben werden
- Bei Unternehmensumwandlung (z.B. UG → GmbH) kann eine neue beantragt werden

## Technische Integration

Die Creditor-ID wird verwendet in:
- `lib/billing/sepa/sepa-service.ts` — Lastschrifteinzug-Generierung
- `lib/billing/sepa/pain008.ts` — PAIN.008 XML-Erstellung
- SEPA-Mandatsformulare (PDF-Generierung)

Der Code prüft bereits beim Lastschrifteinzug, ob eine gültige `sepa_creditor_id` in der `organizations`-Tabelle vorhanden ist (`sepa-service.ts:177`). Ohne gültige ID wirft der Service einen Fehler.

---

## Checkliste

- [ ] Creditor-ID bei der Deutschen Bundesbank beantragt
- [ ] Bestätigung per E-Mail erhalten
- [ ] Creditor-ID in der Datenbank konfiguriert (organizations.sepa_creditor_id)
- [ ] Platzhalter `DE98ZZZ09999999999` ist ersetzt
- [ ] Test-Lastschrift generiert und XML geprüft
- [ ] SEPA-Mandatsformular mit korrekter Creditor-ID aktualisiert
- [ ] Pre-Notification-Template mit korrekter Creditor-ID aktualisiert
