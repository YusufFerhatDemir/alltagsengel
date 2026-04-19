# Dead-Code-Audit — Master Report

**Erstellt:** 2026-04-20
**Methode:** 4 parallele Agent-Teams (Frontend / Backend / Database / Assets+Deps)
**Scope:** Komplette AlltagsEngel.care-Codebase + Supabase-Datenbank
**Status:** Reine Analyse. Keine Code-Änderungen, keine DB-Migrations, keine Commits außer dieses Reports.

> **Kein Auto-Pilot:** Dieser Report ist Yusufs Entscheidungs-Grundlage. Erst
> nach grünem Licht (manuelle Review jeder Position) wird in einer
> Folge-Session bereinigt.

---

## 0. Executive Summary

| Kategorie | Treffer (sicher) | Treffer (investigate) | Geschätzte Einsparung |
|---|---|---|---|
| **Frontend** (LOC) | ~14 LOC | ~290 LOC | 200–300 LOC |
| **Backend / API** (Endpoints) | 3 | 6 | 4 Datei-Bäume + Bundle-Reduktion |
| **Database** (Tabellen/Spalten) | 0 | 1 (messages-Duplikat) | – (Schema clean) |
| **Assets** (Dateien) | 4 (~140 KB) | 6 + 4 Archive-Ordner | bis zu **197 MB** |
| **Dependencies** (NPM-Pakete) | 0 | 3 (Capacitor auto-init) | 0 |

**Headline-Funde:**

1. **Codebase ist überraschend gesund** — fast keine toten Komponenten, Hooks oder lib-Exports. Frontend-Hygiene ist auf 95%+ Niveau.
2. **5 verwaiste API-Endpoints** (3 sichere Löschkandidaten + 2 zu klären). Alle Auth/Cron/Webhook-Endpoints sind sauber identifiziert und geschützt.
3. **DB ist CLEAN** — 59 Tabellen, 156 RLS-Policies, alle Spalten haben Code-Bezug. Einzige Architektur-Entscheidung: `messages` vs `chat_messages` (Doppel-Chat-System für Booking + Krankenfahrt).
4. **`/archive/` ist der Elefant im Raum** — bis zu **197 MB** löschbar, davon **14 MB als Security-Risiko** markiert (`/archive/private/`).
5. **Keine ungenutzten NPM-Pakete** — Dependency-Tree ist diszipliniert.

**Größte Quick-Wins (Low-Risk, High-Reward):**
- A1: `/archive/next-old/` löschen → **25 MB** weg, Risiko: 0
- A2: `/archive/expo-legacy/` + `/archive/dripfy-mis-legacy/` löschen → **~360 KB**, Risiko: 0
- B1: 3 sichere DELETE-Endpoints (`scan-medikament`, `content-blocks`, `admin/pricing`) → kleinerer Bundle, kleinere Angriffsfläche
- C1: 4 ungenutzte Public-Icons löschen → ~480 KB
- D1: `.DS_Store`-Files aus Git-Tracking nehmen

**Größtes Security-Item:**
- **`/archive/private/`** (14 MB, letzter Commit 2026-02-05) — möglicherweise Secrets/Keys. **Vor Löschung Inhalt prüfen, ggf. Keys rotieren.**

**Größte Architektur-Entscheidung:**
- **`messages` (Booking-Chat, in Code aktiv) vs. `chat_messages` (Krankenfahrt-Chat, leer + ungenutzt im Code)** — beide Tabellen mit RLS, aber entweder Krankenfahrt-Chat fertig bauen ODER `chat_messages` einstampfen.

---

## 1. Per-Team Treffer-Übersicht

### Team 1 — Frontend (`docs/audit/DEAD_CODE_FRONTEND.md`)

```
Gesamt-Dateien:                232 TS/TSX
console.log/debug in Prod:     38  (19 davon Client-Side → wrappen)
Backup-/Old-Dateien:           3   (alle in /archive — OK)
Auskommentierte Blöcke:        143 (4 High-Priority im MIS)
Ungenutzte Hook-Exports:       0
Ungenutzte Components:         0
Ungenutzte lib-Exports:        0  (von 80+)
Tote Server-Actions:           0  (Projekt nutzt API-Routes)
Tote Props/Interfaces:         0
LOC-Einsparpotenzial:          ~200–300
```

**Verdict:** Frontend ist clean. Hauptaktion: Client-Side `console.log` hinter `process.env.NODE_ENV`-Gate stellen.

### Team 2 — Backend / API (`docs/audit/DEAD_CODE_BACKEND.md`)

```
Endpoints gesamt:              34
Mit Frontend-Aufrufer:         19  (ACTIVE)
Ohne Frontend-Aufrufer:        15
  → DELETE-Kandidaten:         5  (3 sicher, 2 zu klären)
  → INVESTIGATE (Cron/Service): 6
  → RISIKO-HOCH (nicht löschen): 4
Server-Actions:                0
Tote /lib-Helpers:             0
Edge-Functions:                1  (account-hard-delete, AKTIV via pg_cron)
```

**Verdict:** 3 sichere Lösch-Kandidaten. 2 Klärungsfälle (Stripe-Status + Email-Verifikations-Fallback). Cron-Endpoints korrekt erkannt.

### Team 3 — Database (`docs/audit/DEAD_CODE_DATABASE.md`)

```
Tabellen gesamt:               59
Mit Daten:                     32
Leer (mit Code-Ref):           6   (PWA, Newsletter, Rate-Limit etc. — bereit, noch keine Daten)
Leer (konfigurativ):           21  (MIS, Krankenfahrt-Features, Admin-UI vorhanden)
DELETE-Kandidaten:             0
RLS-Policies:                  156 (100% Coverage, alle gültig)
Views:                         0
Stored Functions/RPCs:         15  (13 aktiv, 2 ready/scheduled)
Edge-Functions:                1   (account-hard-delete)
Performance-Issues:            0
Security-Advisor:              3   (alle intentional: Public Tracking)
```

**Verdict:** DB ist clean. **Einziges echtes Issue:** `messages` vs `chat_messages` — Architektur-Entscheidung erforderlich.

### Team 4 — Assets + Dependencies (`docs/audit/DEAD_CODE_ASSETS.md`)

```
/public-Assets:                33 (USED: 13, IMPLICIT: 10, UNUSED: 10)
NPM Prod-Deps:                 20 (USED: 17, INDIRECT: 2, INVESTIGATE: 3)
NPM Dev-Deps:                  6  (alle USED)
Archive-Ordner:                8  (~205 MB total)
.DS_Store-Files:               5  (in Git-Tracking trotz .gitignore)
Sonstige Junk-Files:           ~6 (.tmp, .bak, ~lock)
```

**Verdict:** Größter Hebel des gesamten Audits. ~197 MB löschbar in `/archive/`. Sicherheits-Audit für `/archive/private/` notwendig.

---

## 2. Konsolidierte Cleanup-Liste (priorisiert)

Format: **`<ID> — <Beschreibung> | Risiko | Impact | Aufwand | Empfehlung`**

### Priorität 0 — Security-Critical (sofort)

| ID | Item | Risiko Löschen | Impact wenn doch gebraucht | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **S1** | `/archive/private/` (14 MB) Inhaltscheck | – | HOCH (Secrets!) | 30 min | **INVESTIGATE FIRST** — wenn Keys: rotieren + Git-History bereinigen mit BFG/git-filter-repo |

### Priorität 1 — Sichere Quick-Wins (Top-Empfehlung)

| ID | Item | Risiko | Impact | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **A1** | `/archive/next-old/` löschen (25 MB, 1424 Dateien — alte Build-Artefakte) | LOW | LOW | 2 min | ✅ DELETE |
| **A2** | `/archive/expo-legacy/` löschen (32 KB — vor Capacitor-Migration) | LOW | LOW | 2 min | ✅ DELETE |
| **A3** | `/archive/dripfy-mis-legacy/` löschen (324 KB — irrelevantes Legacy-Projekt) | LOW | LOW | 2 min | ✅ DELETE |
| **A4** | `/archive/backups/` löschen (leeres Verzeichnis) | LOW | LOW | 1 min | ✅ DELETE |
| **C1** | 4 ungenutzte Icon-Files löschen: `app-icon-1024.png`, `app-icon-1024-v3.png`, `icon-512x512-v3.png`, `assets/icon.jpg` (~480 KB) | LOW | LOW | 5 min | ✅ DELETE — vorher `capacitor.config.ts` checken (Doppel-Check) |
| **D1** | `.DS_Store`-Files aus Git-Tracking nehmen (5 Files): `git rm --cached **/.DS_Store` | LOW | NULL | 2 min | ✅ DELETE (sind in `.gitignore`, nur Git-Cache-Reste) |
| **D2** | `.tmp`-Files in `docs/data-room*/02-pitch-deck/` (3 Canva-Reste) | LOW | NULL | 2 min | ✅ DELETE |
| **D3** | `.git/*.lock.bak`-Reste (von Sandbox-Workarounds) | LOW | NULL | 1 min | ✅ DELETE |
| **D4** | `.~lock.Alltagsengel_Bewertung.xlsx#` (Office-Lock) | LOW | NULL | 1 min | ✅ DELETE |

**Σ Quick-Wins:** ~26 MB sofort weg, 5 Sekunden Build-Zeit-Reduktion (geschätzt), 0 Risiko.

### Priorität 2 — Sichere Code-Löschungen (mit Verify-Step)

| ID | Item | Risiko | Impact | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **B1** | `/app/api/scan-medikament/route.ts` löschen (Vision/LLM-Medikamenten-Scan, 0 Frontend-Aufrufer) | LOW | LOW | 5 min | ✅ DELETE — Verify: `grep -r "scan-medikament"` |
| **B2** | `/app/api/content-blocks/route.ts` löschen (Admin-Content-CRUD, 0 Aufrufer) | LOW | LOW | 5 min | ✅ DELETE — Verify: kein Admin-UI ruft `/api/content-blocks` auf |
| **B3** | `/app/api/admin/pricing/route.ts` löschen (Admin-Pricing-CRUD, 0 Aufrufer) | LOW | MEDIUM | 5 min | ⚠️ INVESTIGATE — wird Pricing über Frontend verwaltet? Wenn ja, war dies geplant aber nie verbunden |
| **F1** | 4 auskommentierte `console.log` in `app/mis/analytics/page.tsx` löschen (Lines 86, 107, 115, 143) | NONE | NONE | 1 min | ✅ DELETE |

### Priorität 3 — Architektur-Entscheidungen (User muss entscheiden)

| ID | Item | Risiko | Impact | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **DB1** | `messages` vs. `chat_messages` Doppelsystem | MEDIUM | MEDIUM | 1–2h Discussion + Migration | **DECIDE:** Krankenfahrt-Chat fertig bauen (`chat_messages` nutzen) ODER auf `messages` konsolidieren und `chat_messages` droppen |
| **B4** | `/app/api/payment/route.ts` (Stripe-Integration auskommentiert) | MEDIUM | HIGH (wenn Stripe geplant) | – | **DECIDE:** Wird Stripe in nächsten 3 Monaten integriert? Wenn nein → DELETE. Wenn ja → KEEP + Code reaktivieren |
| **B5** | `/app/api/auth/send-verification/route.ts` (Fallback für Supabase-Verifikations-Fehler) | MEDIUM | LOW | 30 min Logs prüfen | **INVESTIGATE:** Supabase-Logs auf Aufrufe der letzten 30 Tage prüfen. Wenn 0 → DELETE |

### Priorität 4 — Sicheres Refactoring (Zeitfresser, niedriger Hebel)

| ID | Item | Risiko | Impact | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **F2** | 19 Client-Side `console.log/debug` mit `process.env.NODE_ENV === 'development'` umhüllen | LOW | LOW | 1–2h | ⏳ NICE-TO-HAVE — vor Launch oder bei Bundle-Optimierung |
| **F3** | 139 weitere auskommentierte Blöcke schrittweise aufräumen | LOW | LOW | 2–4h | ⏳ NICE-TO-HAVE — kein Brand |
| **G1** | `upload-helper.js`, `assemble.js` in `/public` (jeweils <1 KB) | LOW | LOW | 10 min | INVESTIGATE — wird im aktiven Build genutzt? Wenn nicht → DELETE |

### Priorität 5 — Aufwendiger / Mit Team-Diskussion

| ID | Item | Risiko | Impact | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **A5** | `/archive/video-generation/` löschen (156 MB, Tesseract-Training?) | MEDIUM | MEDIUM | 30 min Review | **INVESTIGATE:** Was ist das? Wenn nur Test-Daten → DELETE (riesiger Disk-Win) |
| **A6** | `/archive/debug-screenshots/` löschen (11 MB, alte Screenshots) | LOW | LOW | 5 min | OPTIONAL — wenn Tests fertig sind → DELETE |
| **A7** | 3 Capacitor-Plugins ohne expliziten Import (haptics, keyboard, status-bar) | LOW | LOW | 15 min | INVESTIGATE — wenn `capacitor.config.ts` sie nicht aktiv nutzt → uninstall |

---

## 3. Risiko-Matrix (Heat-Map)

```
                  IMPACT IF NEEDED
                  LOW         MEDIUM       HIGH
              ┌────────────┬────────────┬────────────┐
RISK   LOW    │  A1-A4     │            │            │
LIKELY        │  C1, D1-D4 │            │            │
DELETION      │  B1, B2    │            │            │
BREAKS        │  F1        │            │            │
              ├────────────┼────────────┼────────────┤
       MEDIUM │  F2, F3    │  B3        │  B4 (Stripe)│
              │  A6, A7    │  DB1       │            │
              │  G1        │  B5        │            │
              ├────────────┼────────────┼────────────┤
       HIGH   │            │  A5        │  S1 (Secrets)│
              │            │  (video-gen)│            │
              └────────────┴────────────┴────────────┘
```

**Lese-Regel:**
- **Linke Spalte oben** = ungefährliche Quick-Wins → sofort machen
- **Rechte Spalte / unten** = vor Löschung untersuchen
- **S1** ist oben-rechts = höchstes Risiko-vs-Impact-Verhältnis = vorrangig prüfen

---

## 4. Empfohlene Reihenfolge der Bereinigung

**Phase 0 (heute, 30 min):**
1. **S1** — `/archive/private/` Inhalt prüfen (Security-First!)
2. Wenn Keys gefunden: rotieren + Git-History bereinigen (BFG, separate Session)

**Phase 1 (eine Session, ~1h):**
1. A1, A2, A3, A4 (Archive-Cleanup, ~26 MB)
2. C1 (4 Icons, ~480 KB)
3. D1, D2, D3, D4 (Junk-Files)
4. F1 (4 auskommentierte Lines)
5. → Build, `npm run lint`, `npx tsc --noEmit`, ein Smoke-Test pro Bereich, commit + push

**Phase 2 (eine Session, ~1h):**
1. B1 (`scan-medikament`)
2. B2 (`content-blocks`)
3. → Verify: keine Frontend-/iOS-/Android-Referenzen mehr
4. → Build, Test, commit + push

**Phase 3 (Architektur-Sprint, 1-2h):**
1. **DB1** — Entscheidung: Krankenfahrt-Chat fertig bauen ODER `chat_messages` einstampfen
2. B4 — Stripe-Frage klären (mit Yusuf)
3. B5 — Supabase-Logs prüfen für `send-verification`
4. Entsprechende Aktion (DELETE oder KEEP)

**Phase 4 (optional, Zeitfenster):**
1. A5 — `/archive/video-generation/` (156 MB) — wenn nicht mehr gebraucht: massiver Disk-Win
2. A6, A7
3. F2 — Client-Console-Wrapping (vor Launch sinnvoll)
4. F3 — Auskommentierten Code aufräumen

---

## 5. Geschätzte Einsparungen (zusammengefasst)

### Disk-Space
| Bereich | Konservativ | Aggressiv | Maximum |
|---|---|---|---|
| `/public` Assets | 480 KB | 480 KB | 480 KB |
| `/archive/*` | 26 MB | 41 MB | 197 MB |
| Junk-Files | 30 KB | 30 KB | 30 KB |
| **Σ** | **~26 MB** | **~41 MB** | **~197 MB** |

### Code (LOC)
| Bereich | Sicher löschbar | Mit Klärung |
|---|---|---|
| Backend-Endpoints | ~250 LOC (3 Endpoints) | +~300 LOC (B3-B5) |
| Frontend-Comments | ~14 LOC (F1) | +~290 LOC (F3) |
| **Σ** | **~265 LOC** | **bis ~855 LOC** |

### DB-Größe
- 0 (keine Tabellen-Drops empfohlen, alle leer-Tabellen sind konfigurativ oder ready)

### Bundle-Size (Schätzung)
- Frontend-Bundle: keine Änderung (kein toter Frontend-Code, nur lazy-loaded heavy libs)
- Server-Bundle: -~150 KB durch Endpoint-Löschungen (geschätzt aus Bundle-Report)

### Build-Zeit
- 5–10 Sekunden weniger (Schätzung) durch weniger Dateien/Routes

---

## 6. Architektur-Entscheidungen (für Yusuf)

### 6.1 Krankenfahrt-Chat: bauen oder einstampfen?

**Status:**
- Tabelle `chat_messages` existiert (5 Spalten, RLS, Schema definiert)
- 0 Code-Referenzen im aktiven App-Code (`/app/fahrer`, `/app/kunde`)
- Tabelle `messages` ist die Booking-Chat (aktiv genutzt)

**Optionen:**
1. **Krankenfahrt-Chat fertig bauen** → `chat_messages` benutzen, Chat-UI in `/app/fahrer/chat/[ride_id]` und `/app/kunde/krankenfahrt/[id]/chat` bauen
2. **`chat_messages` droppen** → Migration, dann ggf. `messages` für Krankenfahrten erweitern (`booking_id` nullable, `ride_id` zusätzlich)
3. **Status-Quo** → beide Tabellen liegen lassen (kostenlos in Supabase, kein Schaden)

**Empfehlung:** Status-Quo bis Krankenfahrt-Feature priorisiert wird. Tabelle leer = quasi gratis.

### 6.2 Stripe: kommt es noch?

**Status:** `/app/api/payment/route.ts` hat Stripe-Code auskommentiert, erstellt nur DB-Einträge. Keine Frontend-Aufrufer.

**Optionen:**
1. **DELETE** — Stripe wird nicht in nächsten 3 Monaten integriert. Wenn doch kommt, wird neu geschrieben.
2. **KEEP + dokumentieren** — Stripe ist in Roadmap, Code als Stub behalten.

**Empfehlung:** Wenn Stripe nicht in Roadmap ist → DELETE, viel sauberer.

---

## 7. Was NICHT angefasst wird (explizit)

- **Migrations** in `/supabase/migrations/` — historischer Verlauf, nie löschen
- **Feature-Flags** (`lib/feature-flags.ts`, `kf_feature_flags`) — sind aktiv
- **Sentry-Example-Code** (`/app/sentry-example/`) — Demo-Code, intentional
- **`@capacitor/*`-Pakete ohne explizite Imports** — werden via `capacitor.config.ts` initialisiert
- **`auto-init`-Plugins** (haptics, keyboard, status-bar) — bei Unsicherheit lieber drinlassen
- **iOS/Android-Build-Artefakte**
- **Audit-Tooling** (`scripts/audit-rls.ts`, `scripts/rls-matrix.ts`)
- **Edge-Function `account-hard-delete`** — läuft täglich via pg_cron
- **Auth-Endpoints** (`/api/auth/*`) — kritisch
- **Webhook/Cron-Endpoints** (`/api/cron/*`, `/api/drip`)
- **Monitoring-Tunnel** (`/monitoring`)

---

## 8. Folge-Session: Cleanup-Workflow

Nach Yusufs Review dieses Reports:

1. **Mark up dieses Files** — bei jedem Item Checkbox setzen oder `❌ skip` markieren.
2. **Neue Session öffnen** mit dem Folgeprompt:

   ```
   Lies docs/audit/DEAD_CODE_MASTER.md.
   Arbeite NUR die Items ab, die ich grün markiert habe (✅).
   Pro Item: Löschung → Verify-Step (build, lint, tsc) → Commit (kleine, atomare Commits) → Push.
   Bei Architektur-Items (DB1, B4, B5): mit mir nochmal abstimmen, nicht autonom entscheiden.
   ```

3. **Order:** Phase 0 → 1 → 2 → 3 → 4 (siehe §4)
4. **Verify-Pflicht:** nach jedem `git rm` einmal `npx tsc --noEmit && npm run lint && npm run build` (zumindest bei Code-Löschungen)
5. **Smoke-Tests:** für gelöschte Endpoints einmal das verbundene UI-Flow durchklicken (z.B. wenn `scan-medikament` weg, kurz schauen ob Notfall-Seite lädt)

---

## 9. Analogie

Stell dir das Projekt wie ein **Mehrfamilienhaus** vor:

- **Wohnungen (Code im aktiven `/app`, `/components`)** — sauber, alle bewohnt, Möbel benutzt. **Hier ist kaum was wegzuwerfen.**
- **Keller (`/archive/`)** — voll mit alten Kartons. Manche enthalten alte Fotos (`expo-legacy`, `next-old`), manche sind komplett vergessen (`dripfy-mis-legacy`), und einer steht dort beschriftet als „Privat — bitte nicht öffnen" (`/archive/private/`). **Hier ist der größte Raum-Gewinn — aber Vorsicht beim Privatkarton.**
- **Heizungsraum (DB)** — alles gut, alle Rohre angeschlossen, ein Ventil offen für ein Bad das noch nicht gebaut wurde (`chat_messages`). Zerbricht nichts.
- **Schaukasten im Eingang (Public-Assets)** — drei alte Werbeposter hängen dort die niemand mehr sieht. **Schnell weg, optisch besser.**

**Dein nächster Schritt** = Keller-Inventur (Phase 0 + 1). 90% des Gewinns mit 20% des Aufwands.

---

## 10. Anhang: alle Detail-Reports

- `docs/audit/DEAD_CODE_FRONTEND.md` (283 Zeilen, ausführliche Frontend-Analyse)
- `docs/audit/DEAD_CODE_BACKEND.md` (266 Zeilen, alle 34 Endpoints)
- `docs/audit/DEAD_CODE_DATABASE.md` (331 Zeilen, alle 59 Tabellen + RLS-Diagnose)
- `docs/audit/DEAD_CODE_ASSETS.md` (272 Zeilen, alle Assets + Deps + Archive)
- `docs/audit/DEAD_CODE_FINDINGS.json` (155 Zeilen, maschinen-lesbares Frontend-Format)
- `docs/audit/CLEANUP_CHECKLIST.md` (163 Zeilen, vom Frontend-Agent generiert — überlappt mit diesem Master-Report, kann referenziert werden)

---

**End of Report.** Stand 2026-04-20. Keine Code-Änderungen, keine DB-Änderungen, keine Commits außer dieser Datei.
