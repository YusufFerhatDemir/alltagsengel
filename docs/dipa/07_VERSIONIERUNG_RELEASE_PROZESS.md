**Stand:** 2026-08-14 · **Zweck:** SemVer-Schema, Changelog-Disziplin und Deployment-Prozess des Digitalen PflegeCoach.

# Versionierung und Release-Prozess — Digitaler PflegeCoach

**Aktuelle Produktversion:** `0.5.0` · **Quelle der Wahrheit:** `lib/coach/version.ts`

---

## 1. Warum eine eigene Produktversion

Der PflegeCoach ist laut `lib/coach/version.ts` bewusst **separat** von den
Plattform-Deployments der Alltagsengel-Website versioniert. Hintergrund
(wörtlich aus dem Code-Kommentar): DiPAV verlangt eine klare Produktidentität;
Änderungsanzeigen beziehen sich auf diese Produktversion, nicht auf
Plattform-Deployments. Die Version wird an drei Stellen im Produkt selbst
ausgewiesen: UI-Fußzeile, Datenexport, Verlaufsberichte.

Definierte Konstanten in `lib/coach/version.ts`:

```
COACH_PRODUKT_NAME    = 'Digitaler PflegeCoach'
COACH_PRODUKT_VERSION = '0.5.0'
COACH_PRODUKT_STAND   = '2026-08-14'
COACH_SUPPORT_EMAIL   = 'info@alltagsengel.care'
```

## 2. SemVer-Schema

`MAJOR.MINOR.PATCH`, mit Erhöhung nach Änderungs-Kategorie (aus dem
Kopf-Kommentar von `lib/coach/version.ts`):

| Stufe | Bedeutung | Regulatorische Folge |
|---|---|---|
| **PATCH** | Fehlerbehebungen ohne Funktionsänderung | keine gesonderte Bewertung |
| **MINOR** | neue/geänderte Funktionen | potenziell anzeigepflichtig — siehe BfArM-Frage 20 in `audit/dipa/bfarm_fragenkatalog.md` |
| **MAJOR** | Änderungen an Zweckbestimmung/Produktgrenze | immer regulatorisch zu bewerten, und zwar **vor** der Umsetzung |

Jede Versionsänderung wird in `audit/dipa/CHANGELOG_pflegecoach.md`
dokumentiert. Das QM-Handbuch (`audit/dipa/qms_handbuch_pflegecoach.md` §3)
macht daraus einen verbindlichen Schritt im Änderungsverfahren: Einordnung
(PATCH/MINOR/MAJOR) ist der **erste** der fünf Schritte jeder Produktänderung,
noch vor der Umsetzung.

## 3. Changelog-Disziplin (gelebte Praxis)

`audit/dipa/CHANGELOG_pflegecoach.md` ist ein separater Versionsstrang, unabhängig
von Plattform-Deployments. Bisherige Einträge zeigen die tatsächlich gelebte
Disziplin:

| Version | Datum | Kern der Änderung | Veröffentlicht? |
|---|---|---|---|
| 0.1.0 | 2026-08-09 | MVP: Datenmodell, API, UI, Barrierefreiheit, Export | nicht produktiv (Migration nicht angewendet) |
| 0.2.0 | 2026-08-12 | Nutzerflow, Freischaltung, Nachweise, eUL (Blöcke 15a–15d) | nicht veröffentlicht |
| 0.3.0 | 2026-08-13 | Betrieb als normaler Service, Auffindbarkeit, Zulassungsunterlagen | — |
| 0.4.0 | 2026-08-13 | Widerruf wirkt technisch, Schalter durchgesetzt, keine Sackgassen | — |
| 0.5.0 | 2026-08-14 | MFA, FHIR-Export, QMS-Handbuch, Risikoakte (laut Projekt-Historie) | — |

Jeder MINOR/MAJOR-Eintrag im Changelog trägt eine ausdrückliche
**"Regulatorische Bewertung dieser Änderung"** — z. B. wird bei 0.4.0 explizit
festgehalten, dass die Zweckbestimmung unverändert bleibt und keine Funktion
hinzukommt, die den Nutzen für die betroffene Person verändert; ob daraus eine
Anzeigepflicht folgt, bleibt offen bis zur Klärung mit BfArM-Frage 20.

**Beobachtung zur Selbstkorrektur:** Der Changelog-Eintrag zu 0.3.0 korrigiert
ausdrücklich eine frühere Aussage zu 0.2.0 (Migrationsstatus) — die Disziplin
umfasst also auch das Nachziehen falscher Statusmeldungen, nicht nur neue
Einträge.

## 4. Deployment-Prozess

Deployment läuft technisch **nicht** über die CI-Pipeline
(`.github/workflows/ci.yml` ist ein reines Qualitäts-Gate, siehe
`docs/dipa/01_TECHNISCHE_DOKUMENTATION.md` §8), sondern über `./deploy.sh`,
das einzige vom Projekt vorgesehene Werkzeug zum Ausliefern
(`/Users/work/alltagsengel/CLAUDE.md`, Abschnitt "Autonomie-Regel"; Skript
selbst: `/Users/work/alltagsengel/deploy.sh`).

Ablauf laut Kopf-Kommentar und Code von `deploy.sh` (7 Schritte):

1. **Stale-Lock-Cleanup** — entfernt hängende xlsx-Locks, `.git/index.lock`
   (nur wenn älter als 5 Minuten), veraltete Next.js-Build-Verzeichnisse.
2. **Typecheck** — `tsc --noEmit`; von tsc gemeldete Typfehler **blockieren**
   den Deploy vor dem Commit (bis 31.08.2026 warn-only — so gelangten zwei
   Typfehler-Commits nach main und machten die CI rot, die auf
   `npm run typecheck` blockiert). Bricht tsc dagegen ohne eine einzige
   `error TS`-Zeile ab (Speicher), ist das **kein** Typbefund: der Schritt
   warnt „NICHT geprüft" und laesst durch, statt einen Fehler zu erfinden.
   Der Lauf bekommt dafür `--max-old-space-size=4096`, weil der
   Node-Standard-Heap fuer dieses Repo nicht reicht.
   Überspringbar mit `SKIP_TYPECHECK=1` als bewusstem Notausstieg pro Lauf.
3. **Precommit-Guard** — `scripts/precommit-guard.sh`; **blockiert** den
   Commit bei Secrets, `.env`-Dateien, `node_modules` o. ä. Override nur mit
   explizitem `GUARD_BYPASS=1` (laut CLAUDE.md nur mit ausdrücklicher
   Zustimmung des Nutzers).
4. **Commit** — `git add -A` (oder scoped über `DEPLOY_PATHS`), dann
   `git commit` mit der übergebenen Nachricht plus Co-Autor-Zeile. Wird
   übersprungen, wenn nichts zu committen ist.
5. **Push** — auf den gleichnamigen Remote-Branch; `claude/*`- und
   `worktree/*`-Branches pushen automatisch auf `main`. Bei divergierendem
   Remote wird zuerst automatisch rebasiert (kein Force-Push).
6. **Verify-Push** — `scripts/verify-push.sh` vergleicht den lokalen `HEAD`
   mit der tatsächlichen Remote-Wahrheit und bricht mit Fehler ab, falls der
   Push nicht angekommen ist.
7. **IndexNow-Ping** (nur bei `main`-Deploys) — läuft im Hintergrund, nicht
   blockierend, für die SEO-Sitemap; kein Bezug zum PflegeCoach-Produkt.

Rückroll-Wege:

| Ebene | Werkzeug |
|---|---|
| Code | `./scripts/rollback.sh <N> --push` — `git revert`, **kein** `reset --hard` |
| Datenbank | zugehöriges `*_rollback_*.sql` je Migration |

**Notfall-Override:** `GUARD_BYPASS=1 ./deploy.sh "…"` — laut CLAUDE.md nur mit
expliziter Zustimmung des Nutzers zulässig.

## 5. Verhältnis Produktversion ↔ Deployment

Ein Deployment über `deploy.sh` ist ein technischer Auslieferungsvorgang für
das gesamte Repository (Plattform + PflegeCoach zusammen — es gibt keine
getrennte Pipeline nur für den PflegeCoach). Die **Produktversion** des
PflegeCoach wird davon unabhängig in `lib/coach/version.ts` geführt und nur bei
inhaltlichen Änderungen am Produkt erhöht, mit begleitendem Changelog-Eintrag.
Ein reiner Infrastruktur- oder Plattform-Deploy ohne Coach-Änderung erhöht die
Produktversion nicht.

## 6. Offene Punkte

* Es existiert keine formale Freigabekennzeichnung je Release (wer hat
  freigegeben, wann) über den Git-Commit hinaus — vermerkt im QM-Handbuch §2.
* Ob MINOR-Änderungen am PflegeCoach eine BfArM-Änderungsanzeige auslösen,
  ist ungeklärt (BfArM-Frage 20) und wird bislang pro Release nur diskutiert,
  nicht entschieden.

---

## Quellen

- `lib/coach/version.ts`
- `audit/dipa/CHANGELOG_pflegecoach.md`
- `/Users/work/alltagsengel/CLAUDE.md` (Abschnitt "Autonomie-Regel")
- `/Users/work/alltagsengel/deploy.sh`
- `audit/dipa/qms_handbuch_pflegecoach.md` §3 (Änderungsverfahren)
