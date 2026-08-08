# Abschlussbericht: Cross-Module-Integration & IST/SOLL Gap-Analyse

**Datum:** 2026-08-08
**Branch:** `staging/expansion-abnahme`
**Scope:** System-weite IST/SOLL-Analyse aller 16 operativen Schritte + Cross-Module-Fixes

---

## 1. IST/SOLL Gap-Analyse — 16 operative Schritte

| # | Schritt | IST-Status | Kritische Lücken |
|---|---------|-----------|-----------------|
| 1 | Kundenaufnahme | API + Formular NEU gebaut | Keine (P0 behoben) |
| 2 | Stammdaten | 7-Tab Kundenakte vollständig | Keine |
| 3 | Kostenträger/Pflegegrad/Budgets | client_budgets + Ampel-System | Keine |
| 4 | Verträge | Vertrags-Tab in Kundenakte | Keine |
| 5 | Mitarbeiter/Qualifikationen | Personalmanagement + Einsatzfreigabe | Keine |
| 6 | Einsatzplanung | Kalender + Zuweisungen + Freigabe-Guard NEU | Keine (P0 behoben) |
| 7 | Dienstplan | Wochenansicht + Eintrag-CRUD + Freigabe-Guard NEU | Keine |
| 8 | Leistungserbringung | service_records + Status-FSM | Keine |
| 9 | Leistungsnachweis | Leistungsnachweise mit Unterschrift | Keine |
| 10 | Unterschrift | service_signatures (on-site) + mis_signature_requests | Keine |
| 11 | Pflegedokumentation | Mandanten-isoliert (vorige Session) | Keine |
| 12 | Aufgaben | ops_aufgaben + Wiedervorlage + Eskalation | Keine |
| 13 | Rechnung | Rechnungsgenerierung aus Leistungsnachweisen | Keine |
| 14 | DTA | EDIFACT + DAKOTA-Transport + 19-State FSM | Keine |
| 15 | Rückläufer | Import + Zuordnung + Aufgaben-Integration NEU | Keine (P0 behoben) |
| 16 | Controlling/Monatsabschluss | Abrechnungsläufe + Zahlungsavise | Keine |

---

## 2. Identifizierte P0-Gaps und Lösungen

### P0-1: Admin-Kundenaufnahme fehlte komplett

**Problem:** Kein API-Endpoint und kein Formular zum Anlegen neuer Klienten.

**Lösung:**
- `app/api/admin/clients/route.ts` — POST-Endpoint mit:
  - Auth: `getUser()` + `profiles.role` Check
  - Org-Isolation: `getActiveOrgId()` + `organization_id` im Insert
  - Kundennummer-Generierung: `KD-YYMM-XXXX` Format
  - Input-Validation: first_name/last_name Pflicht, care_level 1-5, Duplikat-Check
  - IDOR-Schutz: `createAdminClient()` mit explizitem org_id
- `app/admin/clients/page.tsx` — Inline-Formular mit:
  - 6 Sektionen: Stammdaten, Adresse, Pflegedaten, Notfallkontakt, Hausarzt, Anmerkungen
  - Validierung, Banner-Feedback, Auto-Reload nach Anlegen

### P0-2: Einsatzplanung ohne Qualifikationsprüfung

**Problem:** Mitarbeiter konnten ohne gültigen Vertrag oder mit abgelaufenen Qualifikationen zugewiesen werden.

**Lösung:**
- `app/api/einsatzplanung/route.ts` — POST + PATCH erweitert:
  - `checkCaregiverClearance()` ruft `pruefeEinsatzfreigabe()` auf
  - Prüft: Vertragsstatus = 'aktiv', Einsatzfreigabe-Flag, abgelaufene Qualifikationen
  - Bei Nicht-Freigabe: HTTP 422 mit Problemliste
  - `force_override: true` erlaubt Override mit Warnung im Response
  - `checkBudgetWarning()` warnt bei >95% Budget-Ausschöpfung
- `app/api/personal/dienstplan/eintraege/route.ts` — POST erweitert:
  - Gleicher Freigabe-Check vor `createEintrag()`
  - `forceOverride: true` für erzwungene Zuweisung

### P0-3: Rückläufer erzeugen keine Aufgaben

**Problem:** Fehlgeschlagene/abgelehnte Rückläufer blieben ohne Follow-up — kein Korrekturprozess.

**Lösung:**
- `app/api/billing/dta/ruecklaeufer/route.ts` — POST erweitert:
  - Bei `fehlerErstellt: true` automatische `ops_aufgaben`-Erstellung
  - Kategorie: `abrechnung`, Priorität: `kritisch` (Ablehnung) oder `hoch` (Fehler)
  - Aufgabe enthält: Typ, Status, Fehlercode/-text, Positionsstatistik
  - Verknüpfung über `abrechnungslauf_id` + `metadata.ruecklaeufer_id`
  - Fehler bei Aufgaben-Erstellung blockiert Import nicht (try/catch)

---

## 3. Security-Fixes

### S1: IDOR-Lücke in Rückläufer-Lauf-Zuordnung (kritisch)

**Problem:** `importiereRuecklaeufer()` aktualisierte `abrechnungslaeufe` per `laufId` ohne `organization_id`-Filter. Ein Admin konnte Status eines fremden Abrechnungslaufs manipulieren.

**Fix:** `lib/abrechnung/ruecklaeufer.ts`
- Lauf-Existenz + Org-Zugehörigkeit wird vor jedem Update geprüft
- Alle `.update()` auf `abrechnungslaeufe` haben jetzt `.eq('organization_id', ...)`

### S2: IDOR-Lücke in Rückläufer-Zuordnungsfunktion

**Problem:** `ordneRuecklaeuferZu()` verknüpfte Rückläufer mit beliebigem Abrechnungslauf ohne Org-Check.

**Fix:** `lib/abrechnung/ruecklaeufer.ts`
- Prüfung: `abrechnungslaeufe.id` + `organization_id` = `rl.organization_id`
- Throw bei Org-Mismatch

---

## 4. Security-Audit aller geänderten Endpoints

| Endpoint | Auth | Org-Isolation | IDOR-Schutz | Input-Validation |
|----------|------|--------------|-------------|-----------------|
| `POST /api/admin/clients` | getUser + role | getActiveOrgId | org_id im Insert + Duplikat-Check | name required, care_level 1-5 |
| `POST /api/einsatzplanung` | requireStaff | getActiveOrgId | Freigabe gegen org | Pflichtfelder, force_override |
| `PATCH /api/einsatzplanung` | requireStaff | getActiveOrgId | Freigabe gegen org | id required |
| `POST /api/personal/dienstplan/eintraege` | requirePersonalAdmin | auth.ctx.organizationId | Freigabe gegen org | body validated |
| `GET /api/billing/dta/ruecklaeufer` | getUser + role | getActiveOrgId + eq filter | org_id in query | - |
| `POST /api/billing/dta/ruecklaeufer` | getUser + role | getActiveOrgId + org_id param | Lauf-Org-Check NEU | typ + meldung required |

---

## 5. Cross-Module-Integration — Verknüpfungsmatrix

```
Kundenaufnahme ──→ clients (Stammdaten) ──→ client_budgets (Ampel)
                                           ↓
Einsatzplanung ──→ assignments ←── pruefeEinsatzfreigabe() ←── caregivers + qualifikationen
         ↓                                                       ↑
    checkBudgetWarning() ──→ client_budgets              Dienstplan (eintraege)
                                                              ↓
DTA-Import ──→ abrechnungslaeufe ──→ dta_ruecklaeufer ──→ ops_aufgaben (NEU)
                                           ↓
                                    dta_fehlerprotokoll
                                           ↓
                                    billing_audit_log (SHA-256)
```

**Neue Verknüpfungen (diese Session):**
1. `Einsatzplanung` → `Einsatzfreigabe` (Qualifikations-Gate vor Zuweisung)
2. `Dienstplan` → `Einsatzfreigabe` (gleicher Gate vor Eintrag-Erstellung)
3. `Rückläufer` → `Aufgaben` (automatische Korrektur-Aufgabe bei Fehlern)
4. `Einsatzplanung` → `Budget` (Warnung bei >95% Ausschöpfung)

---

## 6. Geänderte Dateien

| Datei | Aktion | Beschreibung |
|-------|--------|-------------|
| `app/api/admin/clients/route.ts` | NEU | Klienten-Erstellungs-API |
| `app/admin/clients/page.tsx` | UMGESCHRIEBEN | Inline-Aufnahmeformular |
| `app/api/einsatzplanung/route.ts` | ERWEITERT | Freigabe-Guard + Budget-Warnung |
| `app/api/personal/dienstplan/eintraege/route.ts` | ERWEITERT | Freigabe-Guard |
| `app/api/billing/dta/ruecklaeufer/route.ts` | ERWEITERT | Aufgaben-Auto-Erstellung |
| `lib/abrechnung/ruecklaeufer.ts` | GEFIXT | 2x IDOR-Lücke (organization_id) |

---

## 7. Bekannte Einschränkungen

1. **Budget-Warnung nur API-seitig** — UI zeigt Warnungen aus der API-Response, hat aber kein proaktives Budget-Dashboard im Einsatzplaner
2. **Aufgaben-Zuweisung bei Rückläufern** — Aufgabe wird ohne `verantwortlich_id` erstellt (kein Auto-Assign an Abrechnungsteam)
3. **Klienten-Import aus CSV/Excel** — nur Einzelanlage via Formular, kein Bulk-Import

---

## 8. Empfohlene nächste Schritte (P1-P2)

| Prio | Thema | Beschreibung |
|------|-------|-------------|
| P1 | Aufgaben-Auto-Assign | Rückläufer-Aufgaben automatisch an Abrechnungsverantwortlichen zuweisen |
| P1 | Budget-Dashboard | Proaktive Budget-Ampel im Einsatzplaner-Kalender |
| P2 | Klienten-Bulk-Import | CSV/Excel-Upload für Massenanlage |
| P2 | Rückläufer-Eskalation | Unbearbeitete Rückläufer-Aufgaben nach 48h eskalieren |
| P2 | Qualifikations-Ablauf-Warnung | Voraus-Warnung 30 Tage vor Qualifikationsablauf |
