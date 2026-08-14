# Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Konsolidiertes VVT nach der Struktur des Art. 30 DSGVO, zusammengeführt aus dem produktbezogenen Verarbeitungsverzeichnis und der Datenflussdokumentation — vollständig aus Code und Migrationen abgeleitet.

---

## Status und Vorbemerkung

**Status: ENTWURF** — aus dem Quellcode abgeleitet, juristische Prüfung und
Freigabe stehen aus (DiPA-Matrix DS-05, Klasse A, als ERLEDIGT im Sinne von
„Nachweis vorhanden" geführt, aber mit DS-02 gegenzuprüfen).

Dieses Dokument enthält **bewusst nicht**:

* Rechtsgrundlagen jenseits der im Code technisch erzwungenen Einwilligung —
  die rechtliche Einordnung gehört in die juristische Prüfung.
* Aufbewahrungsfristen, die nicht im Code stehen. Wo der Code keine Frist
  kennt, steht „keine technische Frist hinterlegt" — keine erfundene Zahl.
* Konkrete Angaben zu Auftragsverarbeitern (Hosting, Datenbank, E-Mail). Diese
  Kette ist als Lücke benannt (DS-04, EXTERN_BENÖTIGT), nicht mit Vermutungen
  gefüllt.

---

## 1. Verantwortlicher

Alltagsengel UG (haftungsbeschränkt) — Anschrift und Vertretung siehe `/impressum`.

## 2. Bezeichnung der Verarbeitungstätigkeit

Bereitstellung eines digitalen Anleitungs-, Erinnerungs- und
Dokumentationsangebots für Pflegebedürftige in häuslicher Versorgung und ihre
pflegenden Angehörigen (Digitaler PflegeCoach, `lib/coach/version.ts`).
Zweckbestimmung im Wortlaut: `audit/dipa/finale_zweckbestimmung.md`, im Produkt
sichtbar unter `/pflegecoach/start`.

## 3. Zwecke der Verarbeitung

| # | Zweck | Umsetzung im Code |
|---|---|---|
| Z1 | Bereitstellung der Kernfunktionen (Assessment, Ziele, Wochenplan, Verlauf) | `app/api/coach/{assessments,ziele,aktivitaeten,messungen}` |
| Z2 | Verlaufsbericht und Datenexport für die betroffene Person | `app/api/coach/{berichte,export}`, `lib/coach/export.ts` |
| Z3 | Nachweis erteilter und widerrufener Einwilligungen | `coach_consents`, `app/api/coach/consents` |
| Z4 | Nachvollziehbarkeit von Schreibzugriffen (Audit) | `coach_audit_log` + Trigger `coach_audit_trigger()` |
| Z5 | Freigabe eigener Daten an Angehörige/Pflegedienst | `coach_shares` (nur auf Veranlassung der betroffenen Person) |
| Z6 | Pseudonymisierte Auswertung für die Evaluation | `coach_nutzungsereignisse` — **derzeit inaktiv** (Schalter aus, siehe §8) |
| Z7 | Zugangsfreischaltung per Code (Pilot/Kooperation) | `coach_freischaltcodes`, `coach_freischaltungen` — **derzeit ohne Zugangswirkung** (Schalter aus) |

## 4. Kategorien betroffener Personen

Aus `coach_users.rolle` (CHECK-Constraint, genau drei Werte):

* Pflegebedürftige in häuslicher Versorgung (`pflegebeduerftig`)
* Pflegende Angehörige (`angehoerig`)
* Mitarbeitende eines Pflegedienstes (`pflegedienst`)

Weitere Eingrenzung: `audit/dipa/zielgruppendefinition.md`.

## 5. Kategorien personenbezogener Daten

### 5.1 Stammdaten (`coach_users`)

`user_id` (Kontoverknüpfung), `rolle`, `anzeigename` (freiwillig), `pflegegrad`
(freiwillig, 1–5), `geburtsjahr` (freiwillig), Darstellungseinstellungen
(`a11y_schriftgrad`, `a11y_kontrast`), `onboarding_abgeschlossen`, Zeitstempel.
**Keine** Anschrift, **keine** Telefonnummer, **keine** Bankdaten im Produkt.

### 5.2 Gesundheits- und Pflegedaten (Art. 9 DSGVO)

| Tabelle | Inhalt |
|---|---|
| `coach_assessments` | Selbsteinschätzung in fünf Bereichen (Mobilität, Selbstversorgung, Alltagsgestaltung, soziale Teilhabe, Kognition, je 0–4), Hilfsmittel, Wohnsituation, Freitext-Notizen |
| `coach_goals` | Persönliche Ziele mit Bereich, Messgröße, Start-/Ziel-/Ist-Wert, Status, Anpassungsnotiz |
| `coach_activities` | Geplante Aktivitäten: Titel, Kategorie, Wochentage, Uhrzeit, Dauer, Zielbezug |
| `coach_activity_log` | Erledigung je Tag (`erledigt`/`teilweise`/`ausgelassen`) mit Notiz |
| `coach_measurements` | Fragebogen-Rohantworten (jsonb) und Summenwert zu FES-I-K, BSFC-s, SUS, Selbständigkeits-Selbsteinschätzung, Sturzereignis, Befinden |
| `coach_reports` | Unveränderlicher Snapshot eines Berichts/Exports (Kopie der obigen Daten) |

### 5.3 Nachweis- und Protokolldaten

| Tabelle | Inhalt | Personenbezug |
|---|---|---|
| `coach_consents` | Einwilligungstyp, Textversion, erteilt/widerrufen mit Zeitstempel | ja |
| `coach_shares` | Freigabe an Empfänger-Konto, Rolle, Widerruf | ja |
| `coach_audit_log` | Tabelle, Aktion, Zeilen-ID, Feldnamen **ohne Werte**, Akteur, Zeitpunkt | ja (Metadaten) |
| `coach_nutzungsereignisse` | Ereignisart, Modul, Rolle, Auswertungswoche, Anzahl — Zuordnung nur über HMAC-Pseudonym | pseudonym |
| `coach_freischaltcodes` | Code-**Hash** (nie Klartext), Präfix, Quelle, Gültigkeit | nein (Pseudonym bei Einlösung) |

Bewusste Datenminimierung: `coach_audit_log` protokolliert Feldnamen, keine
Werte; `coach_nutzungsereignisse` hat keinen Fremdschlüssel auf `coach_users`,
sondern nur ein Pseudonym über `coach_pseudonym_key`.

## 6. Kategorien von Empfängern

| Empfänger | Wann | Technische Grundlage |
|---|---|---|
| Die betroffene Person selbst | immer | RLS-Policy `*_owner_all`/`*_self` über `auth.uid()` |
| Von der betroffenen Person benannte Angehörige/Pflegedienste | nur nach aktiver Freigabe, jederzeit widerrufbar | `coach_shares` + Lese-Policies |
| Betrieb/Administration von Alltagsengel | **nicht** für Gesundheitsdaten | Für `coach_*`-Gesundheitsdatentabellen existiert bewusst keine Admin-Policy; `lib/coach/api-auth.ts` verwendet ausdrücklich keinen `service_role`-Client |
| Betrieb, aggregiert | nur Kennzahlen, nie Einzelzeilen, mit Unterdrückung kleiner Fallzahlen (< 5) | `app/api/dipa/nachweise/route.ts` |

**Offen:** Die Auftragsverarbeiter-Kette (Hosting, Datenbank, E-Mail-Versand)
ist produktbezogen noch nicht vollständig vertraglich dokumentiert — DS-04,
EXTERN_BENÖTIGT. Erhoben (aber ohne Verträge) in `audit/dipa/avv_dossier_pflegecoach.md`.

## 7. Drittlandtransfer

Im Produktcode ist keine Übermittlung in ein Drittland vorgesehen — der
PflegeCoach ruft keinen externen Dienst auf. Ob die eingesetzten
Plattformleistungen (Hosting, Datenbank) eine Übermittlung bewirken, ist Teil
der noch offenen Auftragsverarbeiter-Dokumentation (§6) und wird hier **nicht**
behauptet. Keine erfundene Aussage zu Serverstandorten.

## 8. Verarbeitungen, die technisch abgeschaltet sind

| Verarbeitung | Schalter | Default | Zusätzliche Bedingung |
|---|---|---|---|
| Erfassung von Nutzungsereignissen (Z6) | `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | zusätzlich Einwilligung `wissenschaftliche_auswertung` |
| Anspruchsprüfung gegenüber Kostenträgern | `COACH_DIPA_MODUS` | aus | Route und Seite antworten ohne Schalter mit 404 |
| Freischaltcode als Zugangsvoraussetzung (Z7) | `COACH_FREISCHALTUNG_PFLICHT` | aus | ohne Schalter ist die Seite nicht erreichbar |

## 9. Löschfristen

Nur was der Code tatsächlich vorsieht — keine erfundenen Fristen:

| Datenbestand | Vorgesehene Löschung |
|---|---|
| Alle `coach_*`-Daten der betroffenen Person | auf eigene Veranlassung über `/pflegecoach/loeschung` → `DELETE /api/coach/loeschung`; `ON DELETE CASCADE` ab `coach_users` |
| Konto-Löschung der Plattform | zieht `coach_users` per `ON DELETE CASCADE` auf `auth.users` mit |
| `coach_reports` | kein UPDATE/DELETE per RLS — Löschung nur über Profil-/Kontolöschung |
| `coach_audit_log` | bleibt als Nachweis der Löschung bestehen (Metadaten ohne Werte) |
| `coach_freischaltcodes` | bleibt bestehen (nur Hash und Pseudonym, kein Personenbezug) |
| Alle übrigen Bestände | **keine automatische Frist im Code hinterlegt** — Regelfristen sind laut `audit/dipa/loeschkonzept.md` festzulegen und dort noch offen |

Details und Begründung: `audit/dipa/loeschkonzept.md`.

## 10. Verweis auf technische und organisatorische Maßnahmen (TOM)

Die vollständige TOM-Ableitung (Verschlüsselung, Zugriffskontrolle, Löschung,
Audit) ist in `docs/dipa/02_DATENSCHUTZ_TOM_DSFA_VORBEREITUNG.md` zusammengefasst.
Kurzfassung der im Code belegbaren Maßnahmen:

* Zugriffskontrolle ausschließlich über Row Level Security, Session-Client statt `service_role` (`lib/coach/api-auth.ts`).
* Kein administrativer Lesezugriff auf Gesundheitsdaten (keine Admin-Policy auf den Gesundheitsdatentabellen).
* Append-only-Audit über Datenbank-Trigger.
* Pseudonymisierung über getrennten, für niemanden lesbaren Schlüsselbestand.
* Freischaltcodes nur als SHA-256-Hash mit Pfeffer.
* Werbe- und Trackerfreiheit im Produktbereich (`components/GoogleTagManager.tsx`, `components/ClientSideProviders.tsx`).
* Transportverschlüsselung — Plattformangaben vor Antragstellung zu verifizieren.

**Offen:** externer Penetrationstest (SEC-04), Zertifikat nach TR-03161 (SEC-01). Zweiter Faktor (SEC-03) ist seit 14.08.2026 umgesetzt, siehe `docs/dipa/11_MFA_DOKUMENTATION.md`.

---

## Quellen

* `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md`
* `audit/dipa/datenfluesse_pflegecoach.md`
* `audit/dipa/datenschutzarchitektur_pflegecoach.md`
* `audit/dipa/zielgruppendefinition.md`
* `audit/dipa/finale_zweckbestimmung.md`
* `audit/dipa/avv_dossier_pflegecoach.md`
* `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`, `20260826010000_dipa_freischaltung_nachweise_eul.sql`
* `docs/DIPA_MATRIX_FINAL.md` (Abschnitt 2, Datenschutz)
* `docs/dipa/02_DATENSCHUTZ_TOM_DSFA_VORBEREITUNG.md`
