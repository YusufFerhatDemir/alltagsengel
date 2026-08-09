# Security- & Testregel-Review — „Digitaler PflegeCoach" v0.1.0

**Stand:** 2026-08-09 · **Reviewer:** Lead-Architect-Agent (Selbst-Review; externes Review ausstehend)
**Scope:** Migration `20260819010000`, `lib/coach/*`, `app/api/coach/*`, `app/pflegecoach/*`,
Tracker-Guards in `components/{ClientSideProviders,GoogleTagManager,LayoutWrapper}.tsx`

---

## 1. Testregel-Matrix (DB → Backend/API → UI → Tests → Security → Domain → Production)

| Stufe | Gate | Ergebnis | Nachweis |
|---|---|---|---|
| DB | Migration baut auf leerer DB, idempotent (2. Lauf), Rollback sauber | **PASS** | Shadow-DB-Build 97 OK (Coach-Migration OK); 2. Lauf fehlerfrei; Rollback → 0 `coach_`-Tabellen; danach Re-Apply OK. Die 4 Build-Fehler sind vorbestehende fremde Migrationen (u. a. `20260814010000`), nicht Teil dieses Moduls |
| Backend/API | 12 Routen, Auth-Guard, Whitelisting, RLS-only | **PASS (Code-Review)** | Selbst-Review §2; Laufzeit-E2E gegen echte DB erst nach Live-Apply möglich |
| UI | 13 Seiten, A11y-Grundausstattung | **TEILWEISE** | Statisch geprüft (Struktur, ARIA, Fokus, Kontrastwerte in CSS); Browser-/Screenreader-Test ausstehend (lokaler Dev-Server laut Projekt-Erfahrung unbrauchbar; Verifikation nach Freigabe auf Preview/Production) |
| Tests | Unit + Rollen/Rechte | **PASS** | 27 Unit-Tests (`lib/coach/*.test.ts`, node:test) grün inkl. Export-Schema-Konformanz; **39/39 Shadow-RLS-Tests** (`supabase/shadow/50_pflegecoach_tests.sql`) grün |
| Security-Review | dieses Dokument | **PASS mit Auflagen** | §2/§3 — Auflagen: MFA (GAP-MFA), TR-03161, Pentest |
| Domain-Review (fachlich) | pflegefachliche Prüfung Inhalte + Instrumente | **PENDING** | Inhalte tragen `pruefstatus: 'entwurf'` + UI-Badge; externe Prüfung nicht durch einen Agenten leistbar (GAP-QS, GAP-INSTRUMENTE) |
| Production-Verifikation | Live-Apply + `verify-pflegecoach-migration.mjs` + curl-Checks | **GESPERRT** | Ausdrückliche Anweisung 09.08.2026: kein Deploy, keine Produktionsmigration. Ablauf nach Freigabe: Task #7 |

**Gesamtstatus: KEIN PASS** im Sinne der Testregel — Domain-Review und Production-Verifikation
stehen aus (bewusst: Deploy-Sperre). Alles lokal Prüfbare ist grün.

## 2. Security-Selbst-Review (Befunde)

### Zugriffskontrolle (verifiziert durch Shadow-Tests P1–P8)
- ✅ Nutzer-Scoping ausschließlich über RLS (`auth.uid()`), Session-Client in allen Routen —
  **kein** `createAdminClient`/service_role im gesamten Coach-Code.
- ✅ Betriebs-Admins (`profiles.role='admin'`) sehen 0 Zeilen (Produktgrenze, Test P3).
- ✅ `anon` vollständig entzogen — Grant-Ebene, nicht nur RLS (Test P4). Wichtig wegen der
  bekannten Default-Privileges-Falle des Projekts.
- ✅ Freigaben nur lesend, widerruflich; `coach_users` bleibt auch bei Freigabe privat (P5).
- ✅ Mass-Assignment abgewehrt: alle Routen whitelisten Felder explizit; `coach_user_id`
  stammt immer aus dem Auth-Kontext, nie aus dem Body; zusätzlich RLS-WITH-CHECK (P2).
- ✅ Unveränderlichkeit: Berichte kein UPDATE/DELETE, Einwilligungen kein DELETE — als
  fehlende Policy UND entzogener Grant (P6).
- ✅ Audit-Log append-only per Grant + fehlende Policies; Trigger SECURITY DEFINER mit
  `SET search_path = public`; protokolliert Metadaten ohne Datenwerte (P7).

### Eingaben/Injection
- ✅ Kein String-SQL im Coach-Code (nur Supabase-Query-Builder); Zahlen-/Enum-Validierung
  serverseitig; Datums-Parameter regex-geprüft; Längen-Limits auf allen Freitexten.
- ✅ `belastung_kurz`-Summenwert wird serverseitig berechnet (Client kann nicht manipulieren).
- ✅ Kein `dangerouslySetInnerHTML` im Coach-UI; Inhalte sind statische TS-Konstanten.

### Datenschutz
- ✅ Einwilligungen versioniert, append-only, Widerruf protokolliert (Art. 7).
- ✅ Export ohne interne IDs/auth-`user_id` (Unit-Test erzwungen).
- ✅ Keine Tracker im Produktpfad (Guards); keine Coach-Daten in Logs/Analytics.
- ⚠️ Restrisiko GAP-TRENNUNG: gemeinsame Plattform-Infrastruktur (Auth, Hosting, GTM bei
  SPA-Navigation aus Marketing-Bereich bereits im Speicher). Bewertung: für MVP/Pilot
  akzeptabel, vor Antrag BfArM-Frage 13 klären.

### Offene Security-Auflagen (nicht MVP-blockierend, antragsblockierend)
1. **MFA** fehlt plattformweit (GAP-MFA, TR-03161-relevant).
2. **BSI TR-03161**-Zertifizierung + Pentest + ISMS (GAP-TR03161/GAP-ISMS).
3. Externes Security-Review (dieses Dokument ist ein Selbst-Review desselben Autors wie der Code).

## 3. Bekannte Einschränkungen der Testumgebung
- Shadow-DB bildet PostgREST-Semantik über `SET ROLE` + `request.jwt.claims` nach — sehr nah,
  aber kein Ersatz für einen Live-Smoke-Test nach Apply (Task #7 enthält beides).
- E2E-Browser-Tests (Playwright vorhanden im Repo) für `/pflegecoach` noch nicht geschrieben —
  sinnvoll erst gegen eine DB mit `coach_`-Tabellen (Shadow-PostgREST-Shim oder Preview nach Apply).
- Voller `tsc`-Lauf des Monorepos ist lokal extrem langsam; Ergebnis siehe Abschlussbericht,
  zusätzlich type-checkt Vercel bei jedem Build.
