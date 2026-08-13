# Verzeichnis von Verarbeitungstätigkeiten — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach (`lib/coach/version.ts`)
**Verantwortlicher:** Alltagsengel UG (haftungsbeschränkt) — Anschrift und Vertretung siehe `/impressum`
**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Code abgeleitet, juristische Prüfung und Freigabe stehen aus

---

## Vorbemerkung: was dieses Dokument ist und was nicht

Dieses Verzeichnis ist **vollständig aus dem Quellcode und den Migrationen abgeleitet**:
jede Tabelle, jedes Feld und jeder Zugriffsweg unten lässt sich in
`supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`,
`supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql`,
`app/api/coach/**` und `lib/coach/**` nachlesen.

**Nicht enthalten und bewusst offen gelassen:**

* Rechtsgrundlagen jenseits der im Code technisch erzwungenen Einwilligung — die
  rechtliche Einordnung gehört in die juristische Prüfung, nicht in eine Ableitung
  aus Code.
* Aufbewahrungsfristen, die nicht im Code stehen. Wo der Code keine Frist kennt,
  steht hier „keine technische Frist hinterlegt" — nicht eine erfundene Zahl.
* Angaben zu Auftragsverarbeitern (Hosting, Datenbank, E-Mail). Diese Kette ist
  offen (GAP-DSFA, `audit/dipa/dipav_gap_liste.md`) und wird hier nur als Lücke
  benannt, nicht mit Vermutungen gefüllt.

---

## 1. Bezeichnung der Verarbeitungstätigkeit

Bereitstellung eines digitalen Anleitungs-, Erinnerungs- und Dokumentationsangebots
für Pflegebedürftige in häuslicher Versorgung und ihre pflegenden Angehörigen.
Zweckbestimmung im Wortlaut: `audit/dipa/finale_zweckbestimmung.md`, im Produkt
sichtbar unter `/pflegecoach/start`.

## 2. Zwecke der Verarbeitung

| # | Zweck | Umsetzung im Code |
|---|-------|-------------------|
| Z1 | Bereitstellung der Kernfunktionen (Assessment, Ziele, Wochenplan, Verlauf) | `app/api/coach/{assessments,ziele,aktivitaeten,messungen}` |
| Z2 | Verlaufsbericht und Datenexport für die betroffene Person | `app/api/coach/{berichte,export}`, `lib/coach/export.ts` |
| Z3 | Nachweis erteilter und widerrufener Einwilligungen | `coach_consents`, `app/api/coach/consents` |
| Z4 | Nachvollziehbarkeit von Schreibzugriffen (Audit) | `coach_audit_log` + Trigger `coach_audit_trigger()` |
| Z5 | Freigabe eigener Daten an Angehörige/Pflegedienst | `coach_shares` (nur auf Veranlassung der betroffenen Person) |
| Z6 | Pseudonymisierte Auswertung für die Evaluation | `coach_nutzungsereignisse` — **derzeit inaktiv**, siehe §6 |
| Z7 | Zugangsfreischaltung per Code (Pilot/Kooperation) | `coach_freischaltcodes`, `coach_freischaltungen` — **derzeit ohne Zugangswirkung**, siehe §6 |

## 3. Kategorien betroffener Personen

Aus `coach_users.rolle` (CHECK-Constraint) — es gibt genau drei:

* Pflegebedürftige in häuslicher Versorgung (`pflegebeduerftig`)
* Pflegende Angehörige (`angehoerig`)
* Mitarbeitende eines Pflegedienstes (`pflegedienst`)

Weitere Eingrenzung: `audit/dipa/zielgruppendefinition.md`.

## 4. Kategorien personenbezogener Daten

### 4.1 Stammdaten — `coach_users`

`user_id` (Verknüpfung zum Konto), `rolle`, `anzeigename` (freiwillig),
`pflegegrad` (freiwillig, 1–5), `geburtsjahr` (freiwillig),
Darstellungseinstellungen (`a11y_schriftgrad`, `a11y_kontrast`),
`onboarding_abgeschlossen`, Zeitstempel.

**Keine** Anschrift, **keine** Telefonnummer, **keine** Bankdaten im Produkt.

### 4.2 Gesundheits- und Pflegedaten (Art. 9 DSGVO)

| Tabelle | Inhalt |
|---------|--------|
| `coach_assessments` | Selbsteinschätzung in fünf Bereichen (Mobilität, Selbstversorgung, Alltagsgestaltung, soziale Teilhabe, Kognition, je 0–4), Hilfsmittel, Wohnsituation, Freitext-Notizen |
| `coach_goals` | Persönliche Ziele mit Bereich, Messgröße, Start-/Ziel-/Ist-Wert, Status, Anpassungsnotiz |
| `coach_activities` | Geplante Aktivitäten: Titel, Kategorie, Wochentage, Uhrzeit, Dauer, Zielbezug |
| `coach_activity_log` | Erledigung je Tag (`erledigt` / `teilweise` / `ausgelassen`) mit Notiz |
| `coach_measurements` | Fragebogen-Rohantworten (jsonb) und Summenwert zu FES-I-K, BSFC-s, SUS, Selbsteinschätzung Selbständigkeit, Sturzereignis, Befinden |
| `coach_reports` | Unveränderlicher Snapshot eines Berichts/Exports (enthält die obigen Daten in Kopie) |

### 4.3 Nachweis- und Protokolldaten

| Tabelle | Inhalt | Personenbezug |
|---------|--------|---------------|
| `coach_consents` | Einwilligungstyp, Textversion, erteilt/widerrufen mit Zeitstempel | ja |
| `coach_shares` | Freigabe an Empfänger-Konto, Rolle, Widerruf | ja |
| `coach_audit_log` | Tabelle, Aktion, Zeilen-ID, **Feldnamen ohne Werte**, Akteur, Zeitpunkt | ja (Metadaten) |
| `coach_nutzungsereignisse` | Ereignisart, Modul, Rolle, Auswertungswoche, Anzahl — Zuordnung nur über Pseudonym | pseudonym |
| `coach_freischaltcodes` | Code-**Hash** (nie Klartext), Präfix, Quelle, Gültigkeit | nein (Pseudonym bei Einlösung) |

Bewusste Datenminimierung an zwei Stellen im Code:
`coach_audit_log` protokolliert Feldnamen, aber keine Werte (sonst wäre es eine
Zweitkopie der Gesundheitsdaten); `coach_nutzungsereignisse` hat keinen
Fremdschlüssel auf `coach_users`, sondern nur ein Pseudonym aus
`coach_pseudonym_key`.

## 5. Kategorien von Empfängern

| Empfänger | Wann | Technische Grundlage |
|-----------|------|----------------------|
| Die betroffene Person selbst | immer | RLS-Policy `*_owner_all` / `*_self` über `auth.uid()` |
| Von der betroffenen Person benannte Angehörige oder Pflegedienste | nur nach aktiver Freigabe, jederzeit widerrufbar | `coach_shares` + Lese-Policies |
| Betrieb/Administration von Alltagsengel | **nicht** für Gesundheitsdaten | Für `coach_*` existiert bewusst **keine** Admin-Policy; `lib/coach/api-auth.ts` verwendet ausdrücklich **keinen** `service_role`-Client |
| Betrieb, aggregiert | nur Kennzahlen, nie Einzelzeilen, mit Unterdrückung kleiner Fallzahlen | `app/api/dipa/nachweise/route.ts` + `werteNutzungAus()` |

**Offen:** Die Auftragsverarbeiter-Kette (Hosting, Datenbank, E-Mail-Versand) ist
produktbezogen noch nicht dokumentiert — GAP-DSFA / AK-DS-04.

## 6. Verarbeitungen, die technisch abgeschaltet sind

Diese Punkte gehören ins Verzeichnis, weil die Strukturen existieren — sie sind
im Auslieferungszustand aber **nicht aktiv**:

| Verarbeitung | Schalter | Default | Zusätzliche Bedingung |
|--------------|----------|---------|-----------------------|
| Erfassung von Nutzungsereignissen (Z6) | `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | zusätzlich Einwilligung `wissenschaftliche_auswertung`; der Schalter allein genügt nie (`app/api/coach/nutzung/route.ts`) |
| Anspruchsprüfung gegenüber Kostenträgern | `COACH_DIPA_MODUS` | aus | Route und Seite antworten ohne den Schalter gar nicht |
| Freischaltcode als Zugangsvoraussetzung (Z7) | `COACH_FREISCHALTUNG_PFLICHT` | aus | ohne Schalter ist die Seite nicht erreichbar (`app/pflegecoach/freischaltung/page.tsx`) |

## 7. Fristen für die Löschung

| Datenbestand | Was der Code vorsieht |
|--------------|-----------------------|
| Alle `coach_*`-Daten der betroffenen Person | Löschung auf eigene Veranlassung über `/pflegecoach/loeschung` → `DELETE /api/coach/loeschung`; `ON DELETE CASCADE` ab `coach_users` |
| Konto-Löschung der Plattform | zieht `coach_users` per `ON DELETE CASCADE` auf `auth.users` mit |
| `coach_reports` | kein UPDATE/DELETE per RLS — Löschung ausschließlich über die Profil-/Kontolöschung |
| `coach_audit_log` | bleibt als Nachweis der Löschung bestehen (Metadaten ohne Werte) |
| `coach_freischaltcodes` | bleibt bestehen; enthält nur Hash und Pseudonym, keinen Personenbezug |
| Alle übrigen Bestände | **keine automatische Frist im Code hinterlegt** — Regelfristen sind in `audit/dipa/loeschkonzept.md` festzulegen und dort noch offen |

## 8. Technische und organisatorische Maßnahmen

Belegbar im Code:

* Zugriffskontrolle ausschließlich über Row Level Security; jede API-Route des
  Produkts arbeitet mit dem Session-Client, damit RLS die einzige Zugriffswahrheit
  bleibt (`lib/coach/api-auth.ts`).
* Kein administrativer Lesezugriff auf Gesundheitsdaten (keine Admin-Policy).
* Append-only-Audit über Datenbank-Trigger, nicht über Anwendungscode.
* Pseudonymisierung über einen getrennten Schlüsselbestand (`coach_pseudonym_key`).
* Freischaltcodes nur als SHA-256-Hash mit Pfeffer (`COACH_CODE_PEPPER`).
* Werbe- und Trackerfreiheit im Produktbereich: GTM/gtag und PageTracker laden
  unter `/pflegecoach` nicht (`components/GoogleTagManager.tsx`,
  `components/ClientSideProviders.tsx`).
* Transportverschlüsselung: `audit/dipa/verschluesselungskonzept.md` — dort
  ausdrücklich mit dem Hinweis, dass die Plattformangaben vor einer
  Antragstellung zu verifizieren sind.

**Offen:** zweiter Faktor bei der Anmeldung (AK-SEC-03 / GAP-MFA), externer
Penetrationstest (AK-SEC-04 / GAP-EXT-REVIEW), Zertifikat nach der einschlägigen
technischen Sicherheitsrichtlinie (AK-SEC-01 / GAP-TR03161).

## 9. Drittlandübermittlung

Im Produktcode ist keine Übermittlung in ein Drittland vorgesehen. Ob die
eingesetzten Plattformleistungen eine solche Übermittlung bewirken, ist Teil der
noch offenen Auftragsverarbeiter-Dokumentation (§5) und wird hier bewusst nicht
behauptet.
