# Technische Dokumentation — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Version:** siehe `lib/coach/version.ts` (Einzelquelle; wird in UI-Fußzeile, Datenexport und Bericht ausgewiesen)
**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet

---

## 1. Produktidentität und Abgrenzung

Der PflegeCoach ist ein eigenständig versioniertes Produkt innerhalb der
Alltagsengel-Plattform. Er teilt mit ihr die Anmeldung, sonst nichts:

| Grenze | Umsetzung |
|--------|-----------|
| Eigene Datenhaltung | ausschließlich `coach_*`-Tabellen; keine Schreib- oder Lesebeziehung zu den operativen Tabellen der Plattform |
| Eigene Zugriffsschicht | `lib/coach/api-auth.ts` — bewusst ohne Rollen-, Organisations- und `service_role`-Zugriff |
| Eigenes Layout | `app/pflegecoach/layout.tsx` + `CoachShell.tsx`; der Marketing-Rahmen der Plattform wird ausgeblendet (`components/LayoutWrapper.tsx`) |
| Keine Werbung, kein Tracking | `components/GoogleTagManager.tsx`, `components/ClientSideProviders.tsx` blenden unter `/pflegecoach` alles aus |
| Eigene Versionierung | `lib/coach/version.ts`, Änderungen in `audit/dipa/CHANGELOG_pflegecoach.md` |

Begründung, warum kein Medizinprodukt vorliegt: `audit/dipa/mdr_negativabgrenzung.md`.

## 2. Systemarchitektur

```
Browser (React/Next.js App Router)
  │
  ├─ app/pflegecoach/**          Produktoberfläche (Client Components)
  │   └─ _lib/client.ts          einheitlicher Fetch + Profil-Guard
  │
  ├─ app/api/coach/**            Produkt-API (Route Handler, Node-Runtime)
  │   └─ lib/coach/api-auth.ts   Session-Client, KEIN service_role
  │
  ├─ lib/coach/**                fachliche Logik, rein und testbar
  │
  └─ PostgreSQL (Supabase)
      ├─ coach_*                 Datenhaltung, Row Level Security aktiv
      ├─ coach_audit_trigger()   Append-only-Protokoll (SECURITY DEFINER)
      └─ coach_mein_pseudonym()  Pseudonym-Auflösung für Nutzungsereignisse
```

Grundsatz: **Die Datenbank ist die Zugriffswahrheit.** Die API-Schicht setzt keine
eigenen Rechte durch, sondern reicht die Nutzersession an die Datenbank durch;
was RLS nicht erlaubt, kommt nicht heraus. Genau eine Ausnahme, dokumentiert und
begründet: `app/api/dipa/nachweise/route.ts` liest Nutzungsereignisse im
Systemkontext und aggregiert sie sofort — Einzelzeilen und Pseudonyme verlassen
die Route nie.

## 3. Fachliche Module

| Modul | Datei | Zweck |
|-------|-------|-------|
| Assessment | `lib/coach/assessment.ts` | Selbsteinschätzung in fünf Bereichen, Verlauf |
| Ziele & Wochenplan | `app/api/coach/{ziele,aktivitaeten}` | Zielverwaltung, wiederkehrende Aktivitäten, Erledigung |
| Empfehlungen | `lib/coach/empfehlungen.ts` | regelbasierte Hinweise, keine Diagnostik |
| Belastung | `lib/coach/belastung.ts` | Selbsteinschätzung für pflegende Angehörige |
| Inhalte | `lib/coach/inhalte.ts` | Übungen, Wissensmodule, Wohnraum-Checkliste; jedes Element trägt einen Prüfstatus |
| Export | `lib/coach/export.ts` + `export.schema.json` | maschinenlesbarer Datenexport, reine Funktion |
| Bericht | `app/pflegecoach/bericht` | menschenlesbare Druckansicht |
| Löschung | `app/api/coach/loeschung` | produktbezogene Löschung ohne Kontoverlust |
| Nachweise | `lib/coach/nachweise.ts` | Auswertung mit Unterdrückung kleiner Fallzahlen |
| Anspruch | `lib/coach/anspruch.ts` | nur im DiPA-Modus; im Auslieferungszustand inaktiv |
| Freischaltung | `lib/coach/freischaltung.ts` | Codes als SHA-256-Hash mit Pfeffer |
| Anforderungskatalog | `lib/coach/anforderungskatalog.ts` | maschinenlesbarer Stand der Zulassungsanforderungen |

## 4. Datenmodell

Vollständig in den Migrationen:

* `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql` — Kern
  (`coach_users`, `coach_consents`, `coach_shares`, `coach_assessments`,
  `coach_goals`, `coach_activities`, `coach_activity_log`, `coach_measurements`,
  `coach_reports`, `coach_audit_log`)
* `supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql` —
  Freischaltung, Nachweise, ergänzende Leistungen
  (`coach_pseudonym_key`, `coach_freischaltcodes`, `coach_freischaltungen`,
  `coach_anspruchspruefungen`, `coach_nutzungsereignisse`,
  `coach_abrechnungswege`, `eul_erbringungen`, `eul_qualifikationen`)

Zu jeder Tabelle gibt es ein Rollback-Skript (`*_rollback_*.sql`).
Feldweise Auflistung: `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` §4.

## 5. Konfiguration und Produktschalter

Alle Schalter sind Umgebungsvariablen, keine Datenbankzeilen — sie sind
Deployment-Entscheidungen, keine Laufzeiteinstellungen. Alle sind fail-safe
voreingestellt (`lib/coach/config.ts`, dokumentiert in `.env.example`):

| Variable | Default | Wirkung, wenn `true` |
|----------|---------|----------------------|
| `COACH_DIPA_MODUS` | aus | Anspruchsprüfung und Kostenträgerbezug werden sichtbar; Seite, API-Route und Navigationspunkt existieren nur dann |
| `COACH_FREISCHALTUNG_PFLICHT` | aus | Freischaltcode wird Zugangsvoraussetzung: ohne gültige Freischaltung lehnt `requireCoachUser({ schreibzugriff: true })` jeden Schreibzugriff ab (403) |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | Nutzungsereignisse werden erfasst — zusätzlich immer einwilligungsabhängig |
| `COACH_CODE_PEPPER` | leer | Pfeffer für den Code-Hash; nachträgliche Änderung entwertet ausgegebene Codes |

Der Auslieferungszustand ist damit: normaler digitaler Pflege- und
Assistenzservice, ohne Kostenträgerbezug, ohne Zugangscode, ohne Ereigniserfassung.

Dass die Schalter tatsächlich greifen, sichert `lib/coach/produktgrenze.test.ts`
als Strukturtest ab: Er prüft, dass die DiPA-spezifischen Seiten und Routen an
`dipaModus()`/`freischaltungPflicht()` gebunden sind, dass im ungegateten
Produktbereich keine Erstattungs- oder Zulassungsaussage steht und dass keine
schreibende Coach-Route die Einwilligungsprüfung auslässt.

## 6. Systemanforderungen

**Nutzerseitig:** aktueller Browser mit JavaScript (Chrome, Edge, Firefox, Safari
in der jeweils aktuellen und der vorangehenden Hauptversion), Internetverbindung,
Konto auf der Alltagsengel-Plattform. Keine Installation, keine App nötig; die
Oberfläche ist auf Mobilgerät und Desktop nutzbar. Bedienhilfen im Produkt selbst:
drei Schriftgrößen und ein Kontrastmodus (`CoachShell.tsx`, gerätübergreifend
gespeichert).

**Serverseitig:** Node.js-Laufzeit für Next.js (Version siehe `package.json`),
PostgreSQL mit aktiviertem Row Level Security, `pgcrypto`. Keine weiteren
Dienste; der PflegeCoach ruft keine externen Schnittstellen auf.

## 7. Betrieb

| Aufgabe | Weg |
|---------|-----|
| Ausbringen | `./deploy.sh "<Beschreibung>"` — Typecheck, Secret-Guard, Commit, Push, Remote-Verifikation |
| Datenbankänderung | Migration in `supabase/migrations/`, dazu ein Rollback-Skript |
| Zurückrollen (Code) | `./scripts/rollback.sh <N> --push` (Revert, kein Reset) |
| Zurückrollen (Datenbank) | zugehöriges `*_rollback_*.sql` |
| Produktversion erhöhen | `lib/coach/version.ts` + Eintrag in `audit/dipa/CHANGELOG_pflegecoach.md` |
| Freischaltcodes ausgeben | `/admin/dipa` — Klartext erscheint genau einmal, danach nur der Hash |
| Kennzahlen der Evaluation | `/admin/dipa`, aggregiert; kleine Fallzahlen werden unterdrückt |

**Kein Zugriffsweg für Support auf Gesundheitsdaten.** Das ist keine Lücke,
sondern gewollt: Es existiert keine Admin-Policy auf `coach_*`. Supportfälle, die
Dateneinsicht erfordern, sind nur mit aktiver Mitwirkung der betroffenen Person
lösbar (Datenexport durch sie selbst).

## 8. Qualitätssicherung im Code

* Unit-Tests je Fachmodul: `lib/coach/*.test.ts` (Assessment, Belastung,
  Empfehlungen, Export, Freischaltung, Nachweise, Anspruch, Abrechnung, EuL)
* Konformanztest des Exports gegen `lib/coach/export.schema.json`
* Datenbanktests: `supabase/shadow/50_pflegecoach_tests.sql`
* Barrierefreiheits-Regeln als Fehler für `app/pflegecoach/**` (`eslint.config.mjs`)
* Broken-Link-Gate: `scripts/check-internal-links.mjs`
* Typecheck: `npm run typecheck`

## 9. Bekannte Grenzen

Diese Punkte sind offen und werden hier benannt, nicht beschönigt:

* Kein zweiter Faktor bei der Anmeldung.
* Kein externer Penetrationstest, kein Sicherheitszertifikat.
* Kein verbindliches Austauschformat (z. B. FHIR-Profile) für die Coach-Daten;
  der Export ist ein eigenes, dokumentiertes JSON-Format.
* Inhalte in `lib/coach/inhalte.ts` tragen durchgehend den Prüfstatus `entwurf`;
  die pflegefachliche Freigabe steht aus und wird im Produkt sichtbar ausgewiesen.
* Angaben zu Hosting und Auftragsverarbeitern sind nicht produktbezogen
  dokumentiert.
