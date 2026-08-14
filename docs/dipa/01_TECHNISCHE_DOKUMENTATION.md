**Stand:** 2026-08-14 · **Zweck:** Konsolidierte technische Dokumentation des Digitalen PflegeCoach (Architektur, Stack, Deployment) für die DiPA-Vorbereitung.

# Technische Dokumentation — Digitaler PflegeCoach

**Produktversion:** 0.5.0 (`lib/coach/version.ts`) · **Betriebsmodus:** `COACH_DIPA_MODUS=false`

Dieses Dokument konsolidiert `audit/dipa/technische_dokumentation_pflegecoach.md` und
`audit/dipa/sicherheitsarchitektur_pflegecoach.md` sowie Fakten aus `package.json`,
`.github/workflows/ci.yml` und `vercel.json`. Es erfindet nichts über die
gewählten Quellen hinaus.

---

## 1. Produktidentität und Abgrenzung

Der PflegeCoach ist ein eigenständig versioniertes Produkt innerhalb der
Alltagsengel-Plattform. Er teilt mit ihr ausschließlich die Anmeldung:

| Grenze | Umsetzung |
|--------|-----------|
| Eigene Datenhaltung | ausschließlich `coach_*`-Tabellen; keine Schreib- oder Lesebeziehung zu den operativen Plattformtabellen |
| Eigene Zugriffsschicht | `lib/coach/api-auth.ts` — ohne Rollen-, Organisations- oder `service_role`-Zugriff |
| Eigenes Layout | `app/pflegecoach/layout.tsx` + `CoachShell.tsx`; der Marketing-Rahmen der Plattform wird ausgeblendet |
| Keine Werbung, kein Tracking | Tracker und GTM sind unter `/pflegecoach` technisch abgeschaltet |
| Eigene Versionierung | `lib/coach/version.ts`, Änderungen in `audit/dipa/CHANGELOG_pflegecoach.md` |

Begründung, warum kein Medizinprodukt vorliegt: `audit/dipa/mdr_negativabgrenzung.md`
(nicht Gegenstand dieses Dokuments).

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
was Row Level Security (RLS) nicht erlaubt, kommt nicht heraus. Eine dokumentierte
Ausnahme: `app/api/dipa/nachweise/route.ts` liest Nutzungsereignisse im
Systemkontext und aggregiert sie sofort — Einzelzeilen und Pseudonyme verlassen
die Route nie.

Die vollständige Verteidigungslinie (Schichtmodell Transport → Header → Sitzung
→ Route → RLS → Grants) sowie die Angriffsflächen-Analyse stehen in
`audit/dipa/sicherheitsarchitektur_pflegecoach.md`. Entwurfsgrundsatz dort:
Schicht "RLS" muss allein halten; alle Schichten davor sind Bequemlichkeit und
frühe Fehlermeldung, keine Sicherheitsgarantie.

## 3. Technologie-Stack

Aus `package.json` (Kern-Dependencies, Stand dieses Repos):

| Bereich | Technologie | Version |
|---|---|---|
| Framework | Next.js (App Router) | `^16.2.12` |
| UI-Runtime | React / React DOM | `^19.2.7` |
| Sprache | TypeScript | `^5.9.3` |
| Backend/Datenbank | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | `^2.97.0` / `^0.8.0` |
| Fehler-Monitoring | `@sentry/nextjs` | `^10.49.0` |
| PDF | `pdf-lib`, `@pdf-lib/fontkit` | `^1.17.1` / `^1.1.1` |
| E-Mail | `resend` | `^6.9.4` |
| Zahlungen (Plattform, nicht PflegeCoach) | `stripe` | `^22.4.0` |
| Unit-Tests | `vitest`, `tsx --test` | `^4.1.10` |
| E2E-Tests | `@playwright/test` | `^1.59.1` |
| Linting | `eslint` + `eslint-config-next` | `^9` / `16.1.6` |
| Node.js (CI) | laut `ci.yml` | `22` |

Der PflegeCoach selbst ruft laut technischer Dokumentation **keine externen
Schnittstellen** auf; serverseitig benötigt er nur Node.js für Next.js sowie
PostgreSQL mit aktiviertem RLS und `pgcrypto`.

## 4. Fachliche Module

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

## 5. Datenmodell

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

Zu jeder Tabelle existiert ein Rollback-Skript (`*_rollback_*.sql`). Beide
Migrationen sind laut Projekt-Memory seit dem 12.08.2026 auf Production live.

## 6. Konfiguration und Produktschalter

Alle Schalter sind Umgebungsvariablen, keine Datenbankzeilen — Deployment-
Entscheidungen, keine Laufzeiteinstellungen. Alle sind fail-safe voreingestellt
(`lib/coach/config.ts`):

| Variable | Default | Wirkung, wenn `true` |
|----------|---------|----------------------|
| `COACH_DIPA_MODUS` | aus | Anspruchsprüfung und Kostenträgerbezug werden sichtbar |
| `COACH_FREISCHALTUNG_PFLICHT` | aus | Freischaltcode wird Zugangsvoraussetzung für Schreibzugriffe |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | Nutzungsereignisse werden erfasst — zusätzlich einwilligungsabhängig |
| `COACH_CODE_PEPPER` | leer | Pfeffer für den Freischaltcode-Hash |
| `COACH_MFA_PFLICHT` | aus | Pflicht zum zweiten Faktor (freiwillige Nutzung bleibt möglich) |
| `COACH_PREISE_FREIGEGEBEN` | aus | gesamter Bestellweg des Selbstzahler-Produkts |

Der Auslieferungszustand ist damit ein normaler digitaler Pflege- und
Assistenzservice ohne Kostenträgerbezug, ohne Zugangscode, ohne
Ereigniserfassung. `lib/coach/produktgrenze.test.ts` sichert als Strukturtest
ab, dass die Schalter tatsächlich greifen.

## 7. Hosting und Betrieb

| Aufgabe | Weg |
|---------|-----|
| Hosting | Vercel (Next.js), Konfiguration in `vercel.json` (Build-Speicher, Cron-Jobs); **kein explizites Hosting-Region-Attribut im Repository gesetzt** |
| Datenbank/Backend | Supabase (verwaltetes PostgreSQL mit RLS) |
| Ausbringen | `./deploy.sh "<Beschreibung>"` — Typecheck (warn-only), Secret-Guard, Commit, Push, Remote-Verifikation |
| Datenbankänderung | Migration in `supabase/migrations/`, dazu ein Rollback-Skript |
| Zurückrollen (Code) | `./scripts/rollback.sh <N> --push` (Revert, kein Reset) |
| Zurückrollen (Datenbank) | zugehöriges `*_rollback_*.sql` |

**Kein Zugriffsweg für Support auf Gesundheitsdaten.** Für `coach_*` existiert
keine Admin-Policy; Supportfälle mit Dateneinsicht sind nur mit aktiver
Mitwirkung der betroffenen Person lösbar (Datenexport durch sie selbst).

## 8. CI-Pipeline (Qualitäts-Gate vor jedem Merge)

Aus `.github/workflows/ci.yml`. Die Pipeline läuft bei Push auf `main`, bei
Pull Requests gegen `main` und per manuellem Trigger. **Sie deployt nichts** —
das Deployment läuft ausschließlich über Vercel, außerhalb dieser Pipeline.

Reihenfolge der Schritte (Job `verify`, `ubuntu-latest`, Node.js 22):

1. Checkout, `npm ci`
2. **Typecheck** — `npm run typecheck` (blockierend)
3. **Lint** — `npm run lint` (informativ, blockiert nicht — Begründung im
   Workflow: ca. 1.100 bestehende `no-explicit-any`-Befunde mangels
   generierter Supabase-DB-Typen)
4. **Unit-Tests (vitest)** — `npx vitest run` (blockierend)
5. **Unit-Tests (node:test)** — `npm run test:unit` (blockierend)
6. **Secret-Scan** — `scripts/ci-secret-scan.sh` (blockierend)
7. **IK-Hardcoding-Check** — `scripts/ci-ik-check.sh` (blockierend)
8. **Forbidden-Strings-Lint** — `npm run lint:forbidden` (blockierend)
9. **Production-Build** — `npm run build` mit `NODE_OPTIONS=--max-old-space-size=4096` (blockierend)

Secrets für den CI-Lauf sind Platzhalter (`ci-placeholder-*`); reale Zugangsdaten
liegen nicht im Workflow-File.

## 9. Qualitätssicherung im Code

* Unit-Tests je Fachmodul: `lib/coach/*.test.ts`
* Konformanztest des Exports gegen `lib/coach/export.schema.json`
* Datenbanktests: `supabase/shadow/50_pflegecoach_tests.sql` (68/68 bestanden, Stand 14.08.2026)
* Barrierefreiheits-Regeln als Fehler für `app/pflegecoach/**` (`eslint.config.mjs`)
* Broken-Link-Gate: `scripts/check-internal-links.mjs`
* Typecheck: `npm run typecheck`

## 10. Bekannte Grenzen (unbeschönigt)

* Kein zweiter Faktor ist verpflichtend (nur freiwillig verfügbar).
* Kein externer Penetrationstest, kein Sicherheitszertifikat.
* Kein verbindliches Austauschformat (z. B. FHIR-Profile) — der Export ist ein
  eigenes, dokumentiertes JSON-Format (siehe `docs/dipa/12_INTEROPERABILITAET_EXPORT_DOKUMENTATION.md`).
* Inhalte tragen durchgehend den Prüfstatus `entwurf`; die pflegefachliche
  Freigabe steht aus.
* Angaben zu Hosting und Auftragsverarbeitern sind noch nicht vollständig
  produktbezogen dokumentiert (siehe `audit/dipa/avv_dossier_pflegecoach.md`).

---

## Quellen

- `audit/dipa/technische_dokumentation_pflegecoach.md`
- `audit/dipa/sicherheitsarchitektur_pflegecoach.md`
- `package.json`
- `.github/workflows/ci.yml`
- `vercel.json`
- `deploy.sh`
- `docs/DIPA_MATRIX_FINAL.md`
