# TARIF-VERIFIKATION — Im System hinterlegte Abrechnungsdaten

**Stand:** 2026-08-12
**Prüfmethode:** Automatisierte Web-Recherche gegen offizielle Quellen + Code-Analyse
**Quellen:** SGB XI (gesetze-im-internet.de), GKV-Spitzenverband, pflege-in-hessen.de, Supabase-Migrationen
**Status:** BUDGETWERTE KORREKT — PfluV-Konformität klärungsbedürftig, VP-Default §42a-konform korrigiert

---

## BEFUNDE (Stand: Fachliche Korrekturprüfung 12.08.2026)

### BEFUND 1: VP- und KZP-Budgetwerte — BEHOBEN

**Datei:** `lib/config/budget-constants.ts`

| Konstante | Wert im Code | Korrekt seit 01.01.2025 | Status |
|-----------|-------------|------------------------|--------|
| `VP_JAEHRLICH_EUR` | **1.685 €** | **1.685 €** | **KORREKT** (Referenzwert) |
| `KZP_JAEHRLICH_EUR` | **1.854 €** | **1.854 €** | **KORREKT** (Referenzwert) |
| `VP_KZP_KOMBINIERT_EUR` | **3.539 €** | **3.539 €** | **KORREKT** (operatives Limit) |

**Korrekturhistorie:**
- Commit 871a713: Budget-Werte auf PUEG +4,5% korrigiert (1685/1854/3539)
- Fachliche Korrekturprüfung: VP_JAEHRLICH_EUR und KZP_JAEHRLICH_EUR als **Referenzwerte** markiert (seit §42a SGB XI, 01.07.2025, nur noch der gemeinsame Jahresbetrag operativ)

### BEFUND 1a: VP-Budget-Default §42a-konform korrigiert — BEHOBEN

**Datei:** `lib/personal/einsatzfreigabe.ts`

**Problem:** `pruefeBudget()` verwendete VP_JAEHRLICH_EUR (1685€) als Default für VP-Budgets. Seit §42a SGB XI kann das gesamte 3539€-Budget für VP allein genutzt werden.

**Fix:** Default geändert auf VP_KZP_KOMBINIERT_EUR (3539€). 7 neue Tests für §42a-Logik ergänzt.

**Quelle:** §42a SGB XI (PUEG, in Kraft seit 01.07.2025), BMG-Pressemitteilung, DMRZ Ratgeber, vdek.com

---

### BEFUND 2: Service-Pricing 35 €/h vs. PfluV-Obergrenze 30/25 €/h

**Datei:** `supabase/migrations/20260719_eylem_audit_complete_features.sql` (service_pricing-Seeds)

| Leistungsart | Budget-Typ | Preis im System | PfluV-Obergrenze Hessen | Status |
|---|---|---|---|---|
| alltagsbegleitung | entlastung | **35 €/h** | 30 €/h (Betreuung) oder 25 €/h (Entlastung) | **PRÜFEN** |
| betreuung_45a | entlastung | **35 €/h** | 30 €/h (Betreuung) | **PRÜFEN** |
| hauswirtschaft | entlastung | **35 €/h** | 25 €/h (Entlastung im Alltag) | **PRÜFEN** |
| einkaufsservice | entlastung | **35 €/h** | 25 €/h (Entlastung im Alltag) | **PRÜFEN** |
| begleitservice | entlastung | **35 €/h** | 25 €/h (Entlastung im Alltag) | **PRÜFEN** |

**Regelung:**
- Die PfluV Hessen setzt **Preisobergrenzen** für nach § 45a SGB XI **anerkannte** Angebote:
  - Betreuungsangebote (§ 45a Abs. 1 S. 2 Nr. 1 + 2): **max. 30 €/h inkl. USt.**
  - Entlastung im Alltag (§ 45a Abs. 1 S. 2 Nr. 3, z. B. Hauswirtschaft): **max. 25 €/h inkl. USt.**
- **Zugelassene Pflegedienste** (§ 72 SGB XI) sind von der PfluV **ausgenommen** — sie verhandeln Vergütungsvereinbarungen direkt mit den Kassen.

**Entscheidung nötig:** Ist Alltagsengel ein nach PfluV anerkannter Dienst oder ein nach § 72 SGB XI zugelassener Pflegedienst?
- Falls PfluV-anerkannt: 35 €/h überschreitet die Obergrenze → Preise senken oder Differenz als Privatanteil abrechnen
- Falls § 72-zugelassen: 35 €/h ist zulässig (keine PfluV-Bindung)

**Hinweis:** Die `service_pricing`-Tabelle ist laut Migration explizit als **INTERNE Kalkulationspreise** markiert, NICHT als verbindliche Kassentarife. Die tatsächliche Abrechnung läuft über `billing_tariffs`.

---

## 1. Gesetzliche Budgetgrenzen

### 1.1 Entlastungsbetrag — § 45b SGB XI

| Parameter | Wert im System | Gesetzlicher Wert | Status |
|---|---|---|---|
| Monatlich | 131 € | **131 €** (seit 01.01.2025) | **VERIFIZIERT** |
| Jährlich | 1.572 € | **1.572 €** (131 × 12) | **VERIFIZIERT** |
| Anspruch | ab PG 1 | ab PG 1 | **VERIFIZIERT** |

**Rechtsgrundlage:** § 45b Abs. 1 S. 1 SGB XI i.V.m. § 30 Abs. 1 SGB XI
**Dynamisierung:** Von 125 € auf 131 € zum 01.01.2025 (+4,5 %, Bekanntmachung v. 14.11.2024)
**Quelle:** sozialgesetzbuch-sgb.de/sgbxi/45b.html, pflege-dschungel.de/entlastungsbetrag-2025/

### 1.2 Verhinderungspflege — § 39 SGB XI

| Parameter | Wert im System | Gesetzlicher Wert | Status |
|---|---|---|---|
| Jährlich (Referenzwert) | **1.685 €** | **1.685 €** (seit 01.01.2025) | **VERIFIZIERT** |
| Vorpflegezeit | entfallen | **entfallen** seit 01.07.2025 | **VERIFIZIERT** |
| Operatives Limit | **3.539 €** (VP_KZP_KOMBINIERT_EUR) | **3.539 €** (§42a) | **VERIFIZIERT** |

**Rechtsgrundlage:** § 39 Abs. 1 SGB XI i.V.m. § 42a SGB XI
**Quelle:** sozialversicherung-kompetent.de, BMG-Pressemitteilung 01.07.2025

### 1.3 Kurzzeitpflege — § 42 SGB XI

| Parameter | Wert im System | Gesetzlicher Wert | Status |
|---|---|---|---|
| Jährlich (Referenzwert) | **1.854 €** | **1.854 €** (seit 01.01.2025) | **VERIFIZIERT** |

**Rechtsgrundlage:** § 42 Abs. 2 SGB XI i.V.m. § 42a SGB XI
**Quelle:** sozialversicherung-kompetent.de

### 1.4 Gemeinsamer Jahresbetrag — § 42a SGB XI (seit 01.07.2025)

| Parameter | Wert im System | Gesetzlicher Wert | Status |
|---|---|---|---|
| Kombiniert VP + KZP | **3.539 €** | **3.539 €** | **VERIFIZIERT** |
| VP-Default in pruefeBudget() | **3.539 €** | **3.539 €** | **VERIFIZIERT** (korrigiert) |

**Rechtsgrundlage:** § 42a SGB XI (eingefügt durch PUEG, in Kraft seit 01.07.2025)
**Konzept:** VP (1.685 €) und KZP (1.854 €) werden in einen gemeinsamen Jahresbetrag zusammengeführt — frei aufteilbar. Kann vollständig für VP oder vollständig für KZP genutzt werden.
**Vorpflegezeit:** Entfällt vollständig seit 01.07.2025.
**Quelle:** vdek.com, DMRZ Ratgeber, BMG-Pressemitteilung

---

## 2. Preisobergrenzen Hessen (PfluV)

### 2.1 billing_gesetzliche_obergrenzen — Seed-Daten

Quelle: `20260808110000_tarifschichten_bundesland.sql`

| # | Bundesland | Angebotstyp | Obergrenze | Quelle im System | Status |
|---|---|---|---|---|---|
| 1 | Hessen | Betreuungsangebot | **30,00 €/h** inkl. USt. | PfluV Hessen § 3 Nr. 1+2 | **PLAUSIBEL** |
| 2 | Hessen | Entlastungsangebot | **25,00 €/h** inkl. USt. | PfluV Hessen § 3 Nr. 3 | **PLAUSIBEL** |

**Verifikation:** Bestätigt durch pflege-in-hessen.de (offizielles Hessen-Pflegeportal). Die exakten Werte 30 €/h und 25 €/h werden dort als Preisobergrenzen genannt. Der originale Verordnungstext (PDF) war bildbasiert und konnte nicht maschinell ausgewertet werden — daher PLAUSIBEL statt VERIFIZIERT.

**Quellen:**
- pflege-in-hessen.de/formen-der-pflege/pflege-zuhause/haeufig-gestellte-fragen/informationen-fuer-anbieterinnen-und-anbieter/
- rv.hessenrecht.hessen.de/bshe/document/jlr-UntAngVHErahmen

**PfluV-Novelle:** Das hessische Kabinett hat eine Änderung der PfluV beschlossen (Verbändeanhörung läuft). Es ist möglich, dass die starren Obergrenzen gelockert oder abgeschafft werden — aktuell gelten sie aber noch. Der Trigger `enforce_tariff_obergrenze` ist korrekt auf `bestaetigt=FALSE` gesetzt.

**Fahrtkosten:** Laut pflege-in-hessen.de dürfen Fahrtkosten **zusätzlich** zu den Obergrenzen abgerechnet werden (um ländliche Anbieter nicht zu benachteiligen). Die 5-€-Fahrtkostenpauschale im Repo ist korrekt NICHT als Obergrenze geseedet.

---

## 3. Leistungsarten-Katalog (billing_leistungsarten)

Quelle: `20260807120000_tariff_model_hardening.sql`

| # | Code | Bezeichnung | Status |
|---|---|---|---|
| 1 | `alltagsbegleitung` | Alltagsbegleitung | PLAUSIBEL |
| 2 | `betreuung_45a` | Betreuung nach § 45a SGB XI | PLAUSIBEL |
| 3 | `verhinderungspflege` | Verhinderungspflege | PLAUSIBEL |
| 4 | `hauswirtschaft` | Hauswirtschaftliche Versorgung | PLAUSIBEL |
| 5 | `einkaufsservice` | Einkaufsservice | PLAUSIBEL |
| 6 | `begleitservice` | Begleitservice | PLAUSIBEL |
| 7 | `nachtbetreuung` | Nachtbetreuung | PLAUSIBEL |
| 8 | `wochenendbetreuung` | Wochenendbetreuung | PLAUSIBEL |
| 9 | `krankenfahrt` | Krankenfahrt | PLAUSIBEL |
| 10 | `demenzbetreuung` | Demenzbetreuung | PLAUSIBEL |
| 11 | `wegepauschale` | Wegepauschale | PLAUSIBEL |
| 12 | `sonstige` | Sonstige Leistung | PLAUSIBEL |

**Hinweis:** Es gibt **keine bundesweit standardisierten Leistungskomplexe** für § 45b SGB XI (anders als bei § 36 Sachleistungen mit LK1/LK2/…). Jedes Bundesland definiert eigene Anerkennungsrahmen. Die Leistungsarten sind daher organisationsspezifisch und NICHT gegen einen gesetzlichen Katalog prüfbar.

**Status:** PLAUSIBEL — intern konsistenter Katalog, der die typischen Leistungen eines Alltagsbegleitungsdienstes abbildet. Kein gesetzlicher Abgleich möglich.

---

## 4. Rechtsgrundlagen-Katalog (billing_rechtsgrundlagen)

| # | Code | Bezeichnung | Status |
|---|---|---|---|
| 1 | `§45b SGB XI` | Entlastungsleistungen | **VERIFIZIERT** — § 45b SGB XI ist korrekte Rechtsgrundlage |
| 2 | `§39 SGB XI` | Verhinderungspflege | **VERIFIZIERT** — § 39 SGB XI ist korrekte Rechtsgrundlage |
| 3 | `§36 SGB XI` | Häusliche Pflegehilfe | **VERIFIZIERT** — § 36 SGB XI ist korrekte Rechtsgrundlage |
| 4 | `privat` | Privatzahler (ohne Kasse) | **PLAUSIBEL** — keine gesetzliche Referenz nötig |

**Ergänzungshinweis:** § 42a SGB XI (Gemeinsamer Jahresbetrag) ist als eigenständige Rechtsgrundlage im Katalog **nicht** enthalten. Da § 42a faktisch VP + KZP zusammenführt, reicht der bestehende Eintrag `§39 SGB XI` operativ — sofern das Budget-Limit auf 3.539 € aktualisiert wird.

---

## 5. Tarifquellen-Katalog (billing_tarifquellen)

| # | Code | Bezeichnung | Status |
|---|---|---|---|
| 1 | `PRIVATE_PREISLISTE` | Interne Preisliste für Privatzahler | PLAUSIBEL |
| 2 | `ANERKENNUNGSBESCHEID` | Preis aus Anerkennungsbescheid (Landesbehörde) | PLAUSIBEL |
| 3 | `VERGUETUNGSVEREINBARUNG` | Vergütungsvereinbarung mit Pflegekasse | PLAUSIBEL |
| 4 | `KASSENVEREINBARUNG` | Rahmenvertrag / Kassenvereinbarung | PLAUSIBEL |
| 5 | `MANUELL_FREIGEGEBEN` | Manuell geprüft und von GF freigegeben | PLAUSIBEL |

**Hinweis:** Für nach § 45a anerkannte Dienste (NICHT zugelassene Pflegedienste) gibt es **keine Vergütungsvereinbarungen** mit Pflegekassen. Die Abrechnung läuft über Kostenerstattung (der Pflegebedürftige reicht Rechnungen ein). Die Tarifquelle `VERGUETUNGSVEREINBARUNG` ist nur relevant, wenn Alltagsengel als zugelassener Pflegedienst nach § 72 SGB XI agiert.

---

## 6. Interne Service-Preise (service_pricing)

Quelle: `20260719_eylem_audit_complete_features.sql`

| # | Leistungsart | Budget-Typ | Preis | PfluV-konform? | Status |
|---|---|---|---|---|---|
| 1 | alltagsbegleitung | entlastung | 35 €/h | Betreuung: max 30 € | **PRÜFEN** |
| 2 | alltagsbegleitung | verhinderung | 35 €/h | VP: keine PfluV-Bindung | PLAUSIBEL |
| 3 | alltagsbegleitung | private | 40 €/h | Privat: frei | PLAUSIBEL |
| 4 | betreuung_45a | entlastung | 35 €/h | Betreuung: max 30 € | **PRÜFEN** |
| 5 | betreuung_45a | verhinderung | 35 €/h | VP: keine PfluV-Bindung | PLAUSIBEL |
| 6 | hauswirtschaft | entlastung | 35 €/h | Entlastung: max 25 € | **PRÜFEN** |
| 7 | hauswirtschaft | private | 38 €/h | Privat: frei | PLAUSIBEL |
| 8 | einkaufsservice | entlastung | 35 €/h | Entlastung: max 25 € | **PRÜFEN** |
| 9 | begleitservice | entlastung | 35 €/h | Entlastung: max 25 € | **PRÜFEN** |
| 10 | begleitservice | private | 40 €/h | Privat: frei | PLAUSIBEL |

**Beurteilung:**
- **Privat- und VP-Preise** sind **nicht PfluV-reguliert** → PLAUSIBEL
- **Entlastungs-Preise** bei 35 €/h liegen **über der PfluV-Obergrenze** (30 € für Betreuung, 25 € für Hauswirtschaft/Entlastung)
- Falls Alltagsengel nach PfluV anerkannt ist, müssten Entlastungs-Preise auf max. 30 €/h (Betreuung) bzw. 25 €/h (Hauswirtschaft) gesenkt werden
- Die Preise sind laut Migration-Kommentar **INTERNE Kalkulationspreise** — die verbindliche Abrechnung läuft über `billing_tariffs`

---

## 7. Abrechnungstarife (billing_tariffs) — Live-DB

**23 Zeilen auf Live-DB** (direkt eingetragen, nicht aus Migrationen).

**Status:** NICHT VERIFIZIERT — die konkreten Werte sind nicht im Repository einsehbar (nur auf der Live-Datenbank). Ohne Supabase-MCP/DATABASE_URL kann der Inhalt in dieser Session nicht geprüft werden.

**Empfehlung:** Inhalt per SQL exportieren und gegen die PfluV-Obergrenzen prüfen:
```sql
SELECT leistungsart, rechtsgrundlage, preis_cent/100.0 AS preis_eur,
       bundesland, verguetungsart, gueltig_ab, tarifquelle
FROM billing_tariffs
WHERE ist_aktiv = true
ORDER BY rechtsgrundlage, leistungsart;
```

---

## 8. Leistungspreise (leistungspreise) — Live-DB

**24 Zeilen auf Live-DB** (direkt eingetragen, nicht aus Migrationen).

**Tabellenstruktur** (aus Migration `20260731010000`):
- `bundesland` TEXT (CHECK auf 16 Bundesländer)
- `leistungsart` TEXT
- `preis_cent` INTEGER
- `gueltig_ab` DATE
- `gueltig_bis` DATE
- UNIQUE(bundesland, leistungsart, gueltig_ab)

**Status:** NICHT VERIFIZIERT — nur auf Live-DB, nicht im Repo einsehbar.

---

## 9. Wegepauschalen (billing_wegepauschalen)

**Keine Seed-Daten.** Migration kommentiert: "KEINE Seed-Werte — Beträge sind vertraglich zu belegen."

**Recherche-Ergebnis:** Laut pflege-in-hessen.de dürfen Fahrtkosten **zusätzlich** zu den Leistungspreisen abgerechnet werden. Die 5-€-Fahrtkostenpauschale (Repo-intern erwähnt) hat **keine PfluV-Grundlage** — sie basiert auf einem selbst beantragten Wert.

---

## 10. Landesspezifische Regeln (billing_landesregeln)

| # | Bundesland | Regel | Wert | Status |
|---|---|---|---|---|
| 1 | Hessen | anerkennung_rechtsgrundlage | PfluV Hessen | PLAUSIBEL |

16 Regel-Schlüssel definiert, aber nur 1 Wert hinterlegt. Die übrigen Werte (Mindesteinsatzdauer, Taktung, Qualifikation etc.) müssen aus der PfluV Hessen entnommen werden.

---

## Regulatorische Einordnung: § 45a/§ 45b SGB XI

### Wie werden Preise für Alltagsbegleitung reguliert?

1. **Keine bundesweit standardisierten Leistungskomplexe** für § 45b (anders als § 36 Sachleistungen)
2. **Landesverordnungen** regeln die Anerkennung und ggf. Preisobergrenzen (z. B. PfluV Hessen)
3. **Keine Vergütungsvereinbarungen** zwischen anerkannten Diensten und Pflegekassen — das Kostenerstattungsprinzip gilt
4. **Anbieter setzen eigene Preise** innerhalb der landesrechtlichen Grenzen
5. **Zugelassene Pflegedienste** (§ 72 SGB XI) sind von PfluV-Obergrenzen ausgenommen

### GKV-Spitzenverband
- Hat Empfehlungen nach § 45a Abs. 7 SGB XI herausgegeben — diese sind Richtlinien für Länder, keine bindenden Leistungskomplexe
- Kein zentraler Leistungsschlüssel-Katalog für § 45b-Dienste

---

## Zusammenfassung

| Tabelle / Wert | Status | Handlungsbedarf |
|---|---|---|
| Entlastungsbetrag 131 €/Monat | **VERIFIZIERT** | Keiner |
| Entlastungsbetrag 1.572 €/Jahr | **VERIFIZIERT** | Keiner |
| VP 1.685 €/Jahr (Referenzwert) | **VERIFIZIERT** | Keiner |
| KZP 1.854 €/Jahr (Referenzwert) | **VERIFIZIERT** | Keiner |
| VP+KZP §42a Gemeinsamer Jahresbetrag 3.539 € | **VERIFIZIERT** | Keiner |
| VP-Budget-Default in pruefeBudget() | **VERIFIZIERT** | Korrigiert auf 3539€ (§42a) |
| PfluV Hessen 30 €/h Betreuung | **PLAUSIBEL** | Verordnungstext 1:1 gegenlesen |
| PfluV Hessen 25 €/h Entlastung | **PLAUSIBEL** | Verordnungstext 1:1 gegenlesen |
| Service-Pricing 35 €/h (Kasse) | **PRÜFEN** | Klären: PfluV- oder § 72-Status |
| Leistungsarten (12 Stück) | **PLAUSIBEL** | Kein gesetzlicher Katalog zum Abgleich |
| Rechtsgrundlagen (4 Stück) | **VERIFIZIERT** | Ggf. § 42a ergänzen |
| billing_tariffs (23 Live-Zeilen) | **NICHT VERIFIZIERT** | SQL-Export + fachliche Prüfung |
| leistungspreise (24 Live-Zeilen) | **NICHT VERIFIZIERT** | SQL-Export + fachliche Prüfung |

---

## Quellenverzeichnis

| # | Quelle | URL / Fundstelle | Geprüft am |
|---|---|---|---|
| 1 | § 45b SGB XI (Gesetzestext) | sozialgesetzbuch-sgb.de/sgbxi/45b.html | 2026-08-12 |
| 2 | § 39 SGB XI (Gesetzestext) | sozialgesetzbuch-sgb.de/sgbxi/39.html | 2026-08-12 |
| 3 | § 42 SGB XI (Gesetzestext) | sozialgesetzbuch-sgb.de/sgbxi/42.html | 2026-08-12 |
| 4 | § 42a SGB XI (Gemeinsamer Jahresbetrag) | sozialgesetzbuch-sgb.de/sgbxi/42a.html | 2026-08-12 |
| 5 | § 45a SGB XI (Gesetzestext) | sozialgesetzbuch-sgb.de/sgbxi/45a.html | 2026-08-12 |
| 6 | Dynamisierung 2025 (4,5 %) | pflege-dschungel.de/entlastungsbetrag-2025/ | 2026-08-12 |
| 7 | VP-Budget 1.685 € | sozialversicherung-kompetent.de — VP-Leistungsrecht | 2026-08-12 |
| 8 | KZP-Budget 1.854 € | sozialversicherung-kompetent.de — KZP-Leistungsrecht | 2026-08-12 |
| 9 | Gemeinsamer Jahresbetrag 3.539 € | vdek.com/magazin/ausgaben/2025-02/gemeinsamer-jahresbetrag | 2026-08-12 |
| 10 | PfluV Hessen (Obergrenzen) | pflege-in-hessen.de — Informationen für Anbieter | 2026-08-12 |
| 11 | PfluV Hessen (Rechtstext) | rv.hessenrecht.hessen.de/bshe/document/jlr-UntAngVHErahmen | 2026-08-12 |
| 12 | PfluV-Novelle (Kabinettsbeschluss) | hessen.de/presse — Änderung der PfluV | 2026-08-12 |
| 13 | GKV-Empfehlungen § 45a Abs. 7 | GKV-Spitzenverband — Rahmenrichtlinien | 2026-08-12 |
| 14 | Marktpreise Alltagsbegleitung | pflege-panorama.de, onlinepflegeakademie.de | 2026-08-12 |

---

## Nächste Schritte

1. ~~**SOFORT:** Budget-Konstanten korrigieren~~ — **ERLEDIGT** (1685/1854/3539 korrekt, VP-Default auf 3539 gefixt)
2. **KLÄREN:** Rechtsstatus von Alltagsengel (PfluV-Anerkennung vs. § 72-Zulassung) → bestimmt ob 35 €/h zulässig
3. **PRÜFEN:** billing_tariffs (23 Zeilen) und leistungspreise (24 Zeilen) per SQL-Export gegen PfluV-Obergrenzen prüfen
4. **BESTÄTIGEN:** PfluV-Obergrenzen (30/25 €) am Originalverordnungstext verifizieren → `bestaetigt=TRUE` setzen
5. **ERWÄGEN:** § 42a als Rechtsgrundlage in billing_rechtsgrundlagen aufnehmen
6. **AUSFÜLLEN:** billing_landesregeln für Hessen (Mindesteinsatzdauer, Taktung, Qualifikation etc.)

**Verantwortlich:** Fachliche Leitung / Abrechnungsexperte
**Freigabe-Workflow:** Wert verifizieren → `tarifquelle` auf `VERGUETUNGSVEREINBARUNG` oder `MANUELL_FREIGEGEBEN` setzen → Trigger `bestaetigt=TRUE`
