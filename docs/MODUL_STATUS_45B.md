# Modul-Status: §45b End-to-End-Prüfung

**Stand:** 2026-08-12
**Prüfer:** Claude (automatisiert)
**Scope:** Kompletter §45b-Ablauf — Kundenaufnahme bis Zahlungseingang

---

## Gesamtbewertung

**Kann §45b praktisch genutzt werden?** **JA — mit Einschränkungen**

Der technische Kern (Budget, Rechnung, OPOS, DTA) ist vollständig implementiert.
Es fehlen externe Voraussetzungen und ein automatischer Übertrag-Prozess.

---

## 1. Kundenaufnahme

| Schritt | Status | Details |
|---------|--------|---------|
| Kunde anlegen | **FUNKTIONIERT** | `/admin/clients` — Stammdaten, Pflegegrad (1–5), Pflegekasse, IK, Versichertennr. |
| Pflegegrad zuweisen | **FUNKTIONIERT** | Validierung 1–5, Feld `care_level` + `pflegegrad` |
| Vertrag erstellen | **FUNKTIONIERT** | `akten_vertraege` — Typen: Dienstleistungsvertrag, Abtretungserklärung etc. |
| Budget-Typ zuweisen | **TEILWEISE** | Budget-Typ existiert (`entlastung` / `verhinderungspflege`), aber **kein automatisches Budget-Anlegen** bei Kundenaufnahme — muss manuell in DB erstellt werden |

**Fix benötigt:** Auto-Budget-Anlage bei Neukundenaufnahme (oder UI-Button).

---

## 2. Budgetverwaltung

| Schritt | Status | Details |
|---------|--------|---------|
| Budget-Anlage pro Jahr/Typ | **TEILWEISE** | DB-Defaults korrekt (131€/Mon, 1572€/Jahr, 3539€ VP/KZP), aber kein UI-Button zum Anlegen |
| Entlastungsbetrag 131€/Mon | **FUNKTIONIERT** | `ENTLASTUNG_MONATLICH_EUR = 131`, `ENTLASTUNG_JAEHRLICH_EUR = 1572` |
| VP/KZP 3539€ Jahresbetrag | **FUNKTIONIERT** | `VP_KZP_KOMBINIERT_EUR = 3539` (§42a, PUEG +4,5%) |
| Budget-Anzeige + Ampel | **FUNKTIONIERT** | Grün <70%, Gelb 70–95%, Rot >95% / überzogen |
| Budget-Warnung 95% | **FUNKTIONIERT** | `pruefeBudget()` warnt ab 95%, blockiert bei 100% |
| Budget-Blockierung 100% | **FUNKTIONIERT** | `blockiert: true` bei ≥100% Ausschöpfung |
| VP+KZP-Kombinations-Check | **FUNKTIONIERT** | `pruefeVPBudget()` prüft `combined_used_amount` gegen 3539€ |
| Übertrag Vorjahr (bis 30.06.) | **TEILWEISE** | Felder vorhanden (`carryover_amount`, `carryover_expires`), Warnungen implementiert (60-Tage-Frühwarnung), **aber kein automatischer Übertrag-Prozess zum Jahreswechsel** |
| DB-Trigger für `used_amount` | **FUNKTIONIERT** | Trigger aktualisiert automatisch `used_amount` und `combined_used_amount` |

**Fehlend:** Automatischer Übertrag-Prozess (Cron/Migration zum 01.01. jeden Jahres).

---

## 3. Einsatzplanung & Leistungserbringung

| Schritt | Status | Details |
|---------|--------|---------|
| Tour erstellen | **FUNKTIONIERT** | Wochen-/Tagesansicht, Fahrtzeiten, Vertretung |
| Mitarbeiter-Zuordnung | **FUNKTIONIERT** | Über `assignments`-Tabelle, Doppelbelegungs-Trigger |
| Mitarbeiter-Freigabe-Prüfung | **FUNKTIONIERT** | Status, Vertragsstatus, Einsatzfreigabe-Flag, Qualifikationen |
| Client-Freigabe-Prüfung | **FUNKTIONIERT** *(gefixt)* | Status, aktiver Vertrag — **neu in Tour-API integriert** |
| Budget-Check vor Einsatz | **FUNKTIONIERT** *(gefixt)* | `pruefeBudget()` + `pruefeClientFreigabe()` **jetzt in POST /api/tours integriert** — blockiert bei 100%, warnt bei 95% |
| VP-Budgetcheck (3539€) | **FUNKTIONIERT** | `pruefeVPBudget()` prüft VP+KZP-Kombination |

**Gefixt in dieser Prüfung:**
- Budget-Check und Client-Freigabe-Check waren als Funktionen vorhanden, aber NICHT in der Tour-Anlage aufgerufen → jetzt integriert in `POST /api/tours`

---

## 4. Leistungsnachweise

| Schritt | Status | Details |
|---------|--------|---------|
| Leistungsnachweis erstellen | **FUNKTIONIERT** | 3 Wege: automatisch aus Tour, manuell (Admin), Engel-App |
| Datum, Dauer, Leistungsart | **FUNKTIONIERT** | `service_records` mit allen Pflichtfeldern |
| Unterschrift/Bestätigung | **FUNKTIONIERT** | Canvas-SignaturePad, Native-App-Unterschriften, SHA-256-Signatursystem |
| PDF-Export Leistungsnachweis | **FUNKTIONIERT** | Kassenkonform mit IK, Pflichtfeldern, Einsatztabelle, Handzeichen |
| Bundesland-Gating (eNLW) | **FUNKTIONIERT** | Warnung wenn nicht freigeschaltet |

---

## 5. Abtretungserklärung

| Schritt | Status | Details |
|---------|--------|---------|
| Abtretungserklärung erfassen | **FUNKTIONIERT** | `verordnungen.abtretungserklaerung_vorhanden` + Datum + Dokument-Upload |
| Prüfung bei Monatsabschluss | **FUNKTIONIERT** | Ohne Abtretung → Position als **nicht abrechenbar** markiert |
| Warnung im Leistungsnachweis | **FUNKTIONIERT** | "Direktabrechnung mit der Kasse nicht möglich" |
| Kostenerstattungsweg | **TEILWEISE** | Vorlage in `lib/coach/abrechnung.ts` vorhanden, aber `verguetungGeklaert: false` — nicht operativ |

**Ergebnis:** System ist auf **Direktabrechnung** (mit Abtretungserklärung) ausgelegt. Kostenerstattung als alternativer Weg ist nicht aktiv.

---

## 6. Rechnungsstellung

| Schritt | Status | Details |
|---------|--------|---------|
| Rechnung erstellen (atomare Engine) | **FUNKTIONIERT** | `create_invoice_draft_atomic` RPC — Preise aus `billing_tariffs` |
| Rechnung an Kunde | **FUNKTIONIERT** | Kundenportal `/kunde/rechnungen` mit PDF-Download |
| PDF-Rechnung Pflichtangaben | **FUNKTIONIERT** *(gefixt)* | **IK-Nummer, IBAN/BIC, Steuernummer jetzt im PDF** |
| Storno/Gutschrift | **FUNKTIONIERT** | `cancelInvoice()`, `createCreditNote()`, Korrekturrechnung |
| Statusmaschine (14 Zustände) | **FUNKTIONIERT** | entwurf → geprüft → freigegeben → übermittelt → quittiert → bezahlt |
| Idempotenz | **FUNKTIONIERT** | Doppelte Aufrufe geben bestehende Rechnung zurück |

**Gefixt in dieser Prüfung:**
- IK-Nummer fehlte auf der PDF-Rechnung → jetzt im Kopf + Footer
- IBAN/BIC fehlte im Footer → jetzt aus `organizations`-Tabelle geladen
- Steuernummer fehlte → jetzt im Footer

---

## 7. Kassenworkflow

| Schritt | Status | Details |
|---------|--------|---------|
| Implementierter Weg | **Direktabrechnung** | via EDIFACT/DTA/DAKOTA |
| Kostenerstattung (Kunde → Kasse) | **NICHT AKTIV** | Vorlage existiert, aber nicht operativ |
| Pre-Flight-Validierung | **FUNKTIONIERT** | 14 Prüfpunkte (Anerkennung, Tarife, Zertifikate, Transport) |
| EDIFACT-Generierung | **FUNKTIONIERT** | Generator + Validator |
| SECON-Verschlüsselung | **FUNKTIONIERT** | Absender-/Empfänger-Zertifikate |
| DAKOTA-Übermittlung | **FUNKTIONIERT** | SFTP-Transport |
| Rückläufer-Verarbeitung | **FUNKTIONIERT** | Rückläufer-Dashboard, Aufgaben |
| Readiness-Check | **FUNKTIONIERT** | Ampelsystem (Grün/Gelb/Rot) mit intern/extern-Trennung |

---

## 8. OPOS / Zahlungseingänge

| Schritt | Status | Details |
|---------|--------|---------|
| Offene Posten | **FUNKTIONIERT** | Altersstrukturanalyse (0–30, 30–60, 60–90, 90+ Tage) |
| Zahlung zuordnen | **FUNKTIONIERT** | Auto-Matching (Score ≥70 → automatisch), manuelle Zuordnung |
| Bezahlt-Filter | **FUNKTIONIERT** | Status-Filter offen/teilweise_bezahlt/bezahlt |
| Mahnwesen | **FUNKTIONIERT** | 6 Stufen (Erinnerung → Inkasso), PDF-Mahnschreiben, Blocker-Logik |
| CAMT-Import | **FUNKTIONIERT** | 3 Tabellen: camt_imports, zahlungseingaenge, klaerfaelle |
| Rücklastschrift | **FUNKTIONIERT** | Stornoautomatik, Gebühr 5€, SEPA-Mandatssperre nach 2x |
| DATEV-Export | **FUNKTIONIERT** | Buchungssatz-Generator, DATEV-Format |
| Klienten-Salden | **FUNKTIONIERT** | `getKlientSalden()` — Gesamtoffene pro Klient |

---

## Externe Voraussetzungen (EXTERN)

Diese Punkte sind **NICHT im Code lösbar** — sie hängen von Behörden, Verträgen und Dienstleistern ab:

| Voraussetzung | Status |
|---------------|--------|
| **Anerkennung nach §45a SGB XI** | Anerkennungsbescheid der Landesbehörde erforderlich |
| **IK-Nummer** | Bei ARGE·IK beantragt (460629986 ist hinterlegt) |
| **ITSG-Absenderzertifikat** | Beim ITSG Trust Center beantragen (kostenpflichtig) |
| **SFTP-Zugang Datenannahmestelle** | Zugangsdaten bei der Annahmestelle beantragen |
| **Empfänger-Zertifikate** | Aus öffentlichem ITSG-Verzeichnis laden |
| **SECON-Passwort** | Env-Variable `SECON_ZERT_PASSWORT` in Vercel setzen |
| **Kassenvereinbarung** | Vertrag mit den Pflegekassen (Landesrahmenvertrag) |
| **Landesfreischaltung** | `state_settings.kassenrechnung_enabled = true` |
| **Abtretungserklärung** pro Kunde | Physisch unterschrieben, in Verordnung hinterlegt |

---

## Interne Voraussetzungen (INTERN — im System lösbar)

| Was | Aufwand | Priorität |
|-----|---------|-----------|
| **Auto-Budget-Anlage bei Kundenaufnahme** | Mittel — API-Insert nach Client-Erstellen | Hoch |
| **Automatischer Übertrag zum Jahreswechsel** | Mittel — Cron-Job oder Migration zum 01.01. | Hoch |
| **Kassentarife pflegen** | Gering — `billing_tariffs` befüllen | Hoch |
| **Kostenträger-Stammdaten pflegen** | Gering — `/admin/kassenabrechnung/stammdaten` | Hoch |
| **Leistungsarten-Konsistenz** | Gering — Zentrale Enum statt verteilte Strings | Niedrig |

---

## Durchgeführte Fixes (diese Prüfung)

1. **Budget-Check in Tour-Anlage integriert** (`app/api/tours/route.ts`)
   - `pruefeBudget()` wird jetzt pro Klient vor der Tour-Anlage aufgerufen
   - `pruefeClientFreigabe()` prüft Vertragsstatus und Klient-Status
   - Blockierung bei 100% Budget, Warnung bei 95%
   - Übersteuern mit `force_override: true` + Audit-Trail

2. **PDF-Rechnung: IK-Nummer + Bankdaten ergänzt** (`app/api/admin/invoices/[id]/generate-pdf/route.ts`)
   - IK-Nummer im Belegkopf neben "Alltagsengel"
   - IK-Nummer + Steuernummer im Footer
   - IBAN + BIC + Bankname aus `organizations`-Tabelle im Footer
   - `getOrgIK()` für mandantenfähige IK-Auflösung

---

## Handlungsanweisungen

### Sofort (vor erstem §45b-Einsatz):
1. **Anerkennung §45a** sicherstellen (Landesbehörde Hessen)
2. **Kassentarife** in `billing_tariffs` einpflegen (Admin → Kassenabrechnung → Stammdaten)
3. **Kostenträger** anlegen (Pflegekassen mit IK-Nummern)
4. **Bankdaten** in `organizations`-Tabelle pflegen (IBAN, BIC)
5. Für jeden Kunden: **Budget manuell anlegen** (`client_budgets` mit Jahr, Typ, Beträgen)
6. Für jeden Kunden: **Abtretungserklärung** unterschreiben lassen und in Verordnung hinterlegen

### Mittelfristig (Automatisierung):
7. **Auto-Budget bei Kundenanlage** implementieren
8. **Jahreswechsel-Übertrag** als Cron-Job einrichten
9. **ITSG-Zertifikate** für DTA-Übermittlung beantragen
10. **SFTP-Zugang** zur Datenannahmestelle beantragen
