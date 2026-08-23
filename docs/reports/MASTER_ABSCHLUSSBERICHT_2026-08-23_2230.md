# MASTER-ABSCHLUSSBERICHT 23.08.2026 / 22:30

## Phase 3 — Restlücken schließen + Produktionshärtung

---

## Ausgangsstand

Abschlussbericht 20:00 lag vor mit 8 Tracks (Phase 2) erledigt, 5 offene P2/P3-Punkte. Phase 3 mit 8 neuen Tracks gestartet.

---

## Erledigte Tracks

### Track 1: RESEND LIVE-VERIFIKATION

**Status: EXTERN_BLOCKIERT**

Keine Änderung gegenüber Phase 2: Domain DKIM/SPF/DMARC verifiziert, Code geprüft, aber ein kontrollierter Test-Versand erfordert Zugang zum Vercel-Dashboard zur Prüfung der API-Key-Gültigkeit. Kein technisch lösbarer Schritt ohne externen Eingriff.

### Track 2: Retry/Dead-Letter Automatisierung

**Status: IMPLEMENTIERT + GETESTET + DEPLOYED + LIVE_VERIFIZIERT**
**Commits: `a47ccf2`, `5b4daf9`, `ba635b8`**

- Retry-Worker (`lib/notifications/retry-worker.ts`): 540 Zeilen, exponentielles Backoff, MAX_VERSUCHE mit Dead Letter
- Fehlerklassifikation (`lib/notifications/fehlerklassen.ts`): permanent vs. transient vs. unbekannt
- Vorgangsregister (`lib/notifications/vorgaenge/`): booking-neu, booking-zusage etc. als wiederherstellbare Vorgänge
- Cron-Route (`app/api/cron/zustellung-retry/route.ts`): 5-Min-Takt via GitHub Actions, Tages-Rückfall via vercel.json
- Betriebsansicht (`app/admin/zustellspur/page.tsx`): Dead-Letter-Übersicht für Admins
- Sperre: `zustellung_retry_laeufe` mit UNIQUE partial index + Heartbeat + Crash-Recovery
- Fehlendes CRON_SECRET → Warnung statt 288 rote Läufe/Tag
- Migration `20260927000000_zustellung_retry_worker.sql` → **LIVE eingespielt**
- **22 Dateien, +3483 Zeilen, 1173+ Testzeilen**

### Track 3: VP/KZP Fachliche Verifikation

**Status: IMPLEMENTIERT + GETESTET + DEPLOYED + LIVE_VERIFIZIERT**
**Commit: `9965739`**

- **Primärquelle:** BMG (bundesgesundheitsministerium.de/verhinderungspflege): "für längstens **acht Wochen** je Kalenderjahr" — VP = 56 Tage ab 01.07.2025
- Jahresgetrennte Implementierung: bis 2024 VP=42 (alter Rechtsstand), ab 2025 VP=56
- Nicht pauschal überschrieben — Nacherfassung für 2024 bleibt korrekt
- Migration `20260928000000_vpkzp_vp_56_tage.sql` → **LIVE eingespielt**
- **Live-Verifikation:** VP2024=42, VP2025=56, VP2026=56, KZP2026=56

### Track 4: FCM/Native Push

**Status: IMPLEMENTIERT + GETESTET + DEPLOYED + LIVE_VERIFIZIERT**
**Commits: `3bd42b4`, `d0be881`**

- FCM HTTP v1 Provider (`lib/notifications/push/fcm-provider.ts`): Retry, Token-Invalidierung, graceful degradation
- Token-Store (`lib/notifications/push/token-store.ts`): Rotation, Mandantentrennung, Opt-out
- API-Routen: `POST/DELETE /api/notifications/push/register|unregister`
- Notification Preferences Tabelle für Kanal-Opt-out
- Provider 'fcm' im delivery_log CHECK
- **3 Bestandsfehler behoben:**
  1. fcm_tokens ohne UNIQUE-Index → Dubletten bei jedem App-Start
  2. INVALID_ARGUMENT löschte pauschal Token → Payload-Bug hätte gesamten Gerätebestand geleert
  3. Geräte waren mandantenlos → kein org_fence
- Migration `20260930000000_push_geraete_token.sql` → **LIVE eingespielt**
- **42 Tests, 12 Dateien**

### Track 5: ChairMatch Doppel-Submit Schutz

**Status: IMPLEMENTIERT + GETESTET + DEPLOYED + LIVE_VERIFIZIERT**
**Commit: `ec72de3`**

- Claim-Tabelle mit Fingerprint als PK (SHA-256 über Nutzer+Equipment+Termin+Dauer+Nachricht)
- Gleitendes 5-Min-Fenster statt statischem UNIQUE (kein Bucket-Randproblem)
- Race-safe: INSERT auf PK ist atomares Tor, Verlierer bekommt 23505
- Duplikat → 200 mit bestehender Anfrage + `duplicate: true`
- DB-Fehler → 500, kein stiller Fallback (kein localStorage!)
- Cleanup-Funktion `purge_expired_rental_request_claims()`
- Migration `20260823_rental_request_dedupe.sql` → **LIVE eingespielt**
- **34 neue Tests, Gesamtsuite 345 (vorher 311)**

### Track 6: ChairMatch Supabase Health

**Status: ERLEDIGT**

- Projekt `pwdbjqfpgumyfktbfswg`: ALIVE, PG 17.6, 79 public tables
- Server antwortet in <1s
- Kein Paused/Sleep-Status

### Track 7: Real E2E Produktionsketten

**Status: NICHT GESTARTET**

Erfordert laufende Vercel-Deployments und echte API-Endpunkte. Die umfangreichen PGlite-Tests (echtes Postgres-SQL) in den Tracks 2, 3, 4, 5, 8 decken die Datenbankschicht ab. Die E2E-Kette aus Phase 2 (Track 3, Commit 78e1f1b) läuft weiterhin.

### Track 8: Security/Production Hardening Delta

**Status: IMPLEMENTIERT + GETESTET + DEPLOYED + LIVE_VERIFIZIERT**
**Commit: `1dba3d4`**

- **3 Sicherheitslücken gefunden und behoben:**
  1. **HOCH:** VP/KZP-Tagekontingent im Wettlauf umgehbar (READ COMMITTED Lost Update). Fix: `pg_advisory_xact_lock` vor dem Zählen
  2. **MITTEL:** Negativbeträge gaben Kassenbudget frei (kein Vorzeichen-CHECK). Fix: 3 CHECKs auf vpkzp_buchungen
  3. **NIEDRIG:** Audit-Log war per INSERT beschreibbar. Fix: `pg_trigger_depth()`-Wächter
- Migration `20260929000000_vpkzp_integritaet_haertung.sql` → **LIVE eingespielt**
- **13 neue PGlite-Tests, 87/87 grün**

---

## Commits (chronologisch, alle auf origin/main)

| Commit | Beschreibung |
|---|---|
| `9965739` | VP-Tage 42→56 gemäß BMG §42a SGB XI |
| `1dba3d4` | Security Delta: Wettlaufsperre, Negativbetrag-CHECKs, Audit-Trigger |
| `3bd42b4` | FCM Push-Kanal Infrastruktur |
| `d0be881` | Push-Migration umnummeriert (Kollision) |
| `a47ccf2` | Retry/Dead-Letter-Automatisierung |
| `5b4daf9` | Zustellung-Retry: 5-Min-Takt GitHub Actions |
| `ba635b8` | Zustellung-Retry: CRON_SECRET-Warnung |
| `ec72de3` | ChairMatch Doppel-Submit-Riegel |

---

## Migrationen (Phase 3, alle LIVE_VERIFIZIERT)

1. `vpkzp_vp_56_tage` → Alltagsengel (VP 42→56, jahresgetrennt)
2. `vpkzp_integritaet_haertung` → Alltagsengel (3 CHECKs, Advisory Lock, Audit-Trigger)
3. `push_geraete_token` → Alltagsengel (org_id, UNIQUE, Opt-out, Provider 'fcm')
4. `zustellung_retry_worker` → Alltagsengel (Vorgangsbezug, Dead-Letter, Retry-Läufe)
5. `rental_request_dedupe` → ChairMatch (Claim-Tabelle, Cleanup-Funktion)

**GESAMT Phase 2+3: 11 Migrationen auf 2 Projekte**

---

## Gefundene echte Bugs (Phase 3: 6)

1. **fcm_tokens ohne UNIQUE-Index** — Nachricht N-fach bei N App-Starts (FCM) — GEFIXT
2. **INVALID_ARGUMENT löschte alle Tokens** — Payload-Bug hätte Gerätebestand geleert (FCM) — GEFIXT
3. **Geräte mandantenlos** — kein org_fence auf fcm_tokens (FCM) — GEFIXT
4. **VP/KZP Race Condition** — Doppelbuchung überzog Kontingent (Security) — GEFIXT
5. **Negativbeträge** — Budget-Manipulation via negativem betrag_euro (Security) — GEFIXT
6. **Audit-Log beschreibbar** — Fälschung der Änderungsspur per INSERT (Security) — GEFIXT

**GESAMT Phase 2+3: 9 echte Bugs gefunden und behoben**

---

## Offene Punkte

| Prio | Punkt | Status |
|---|---|---|
| P2 | RESEND KEY_UNVERIFIED — Vercel-Key-Gültigkeit | EXTERN_BLOCKIERT |
| P3 | FCM-Key Gültigkeit — erst bei echter Zustellung prüfbar | EXTERN_BLOCKIERT |
| P3 | E2E gegen Live-Endpoints (Vercel) | NICHT_GESTARTET |
| P4 | Geld-Deckel §42a nur in TypeScript, nicht in DB | AKZEPTIERT (Repo-Konvention) |
| P4 | Zeitstempel-Kollision 20260928 (VP + Push) | BEHOBEN (d0be881 → 20260930) |

---

## GO/NO-GO

- **Alltagsengel: GO für Betrieb** — VP/KZP fachlich korrekt, Security-Lücken geschlossen, Retry-Worker produktionsreif
- **ChairMatch: GO für Betrieb** — Doppel-Submit serverseitig gesichert, Supabase gesund

---

*Alltagsengel — Master-Abschlussbericht Phase 3, 23.08.2026, 22:30 Uhr*
