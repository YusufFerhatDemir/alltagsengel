# P0-Abschlussbericht — Production-Hardening

**Branch:** `audit/production-hardening` · **Datum:** 2026-08-01

Alle 5 P0-Befunde aus dem Audit sind behoben, jeweils mit Tests belegt und
committet. Keine Änderung wurde auf einer produktiven Datenbank ausgeführt;
neue Datenbank-Migrationen liegen ausschließlich als Dateien vor.

## Übersicht

| # | Befund | Repo | Status | Commit |
|---|---|---|---|---|
| P0-1 | Admin-/Server-Routenschutz war Dead Code | Alltagsengel | ✅ behoben | `6f41d87` |
| P0-2 | 9 RLS-Policies ohne org_id-Prüfung | efy care | ✅ behoben | `519f4ba` |
| P0-3 | Auth-Token im Klartext (AsyncStorage) | efy care | ✅ behoben | `1e84775` |
| P0-4 | Storage-Bucket ohne Mandantentrennung | efy care | ✅ behoben | `3b328ca` |
| P0-5 | Hartcodierte IK-Nummer | beide | ✅ behoben | `329a806` / `a5c9fb1` |

Zusätzlich dokumentiert: `audit/SECON_ARCHITECTURE_DECISION.md` (Commit `5b1e767`).

---

## P0-1: Admin- und Server-Routenschutz

**Vorher:** `proxy.ts` implementierte vollständigen Server-seitigen Schutz
(CSRF, JWT-Verifikation, Fail-Closed für `/admin`/`/mis`/sensible Kunden-
routen) — lief aber nie, weil Next.js Middleware exakt als `middleware.ts`
im Projekt-Root erwartet und den Export `middleware` (nicht `proxy`). Der
gesamte Schutz war seit dem ursprünglichen Commit Dead Code.

**Nachher:** `middleware.ts` re-exportiert `proxy` als `middleware` + den
`config`-Matcher. Der Schutz ist damit aktiv.

**Tests:** `__tests__/security/p0-1-admin-auth.test.ts` — 13 Tests: Fail-
Closed für nicht angemeldete Nutzer auf `/admin`, `/mis`, `/kunde/zahlungsdaten`;
Rollenprüfung (kunde/engel → kein Admin-Zugriff, admin/superadmin → Zugriff);
DB-Fallback-Pfad; CSRF-Schutz (Cross-Origin-POST → 403, Same-Origin/Subdomain
→ erlaubt); Fail-Closed bei Middleware-Exception. **13/13 grün.**

---

## P0-2: RLS-Mandantentrennung (efy care)

**Vorher:** Die Multi-Mandanten-Migration (`20260801150000`) hatte
`organization_id` auf allen Tabellen ergänzt und die meisten Policies auf
`is_org_member(organization_id)` umgestellt — 9 Policies auf 8 Tabellen blieben
dabei unverändert:

- **INSERT ohne Org-Check** (Cross-Tenant-Dateninjektion — jede:r Angemeldete
  konnte `organization_id` auf eine fremde Organisation setzen):
  `audit_logs_insert`, `action_fingerprints_insert`, `sync_conflicts_insert`,
  `offline_queue_insert`, `device_sessions_upsert`.
- **UPDATE mit Selbstzugriff, org_id aber änderbar** (Tenant-Hopping — eigene
  Zeile in fremde Organisation verschieben): `caregivers_update_self`,
  `service_visits_write_caregiver`, `device_sessions_update`,
  `quality_measures_update_own`.

**Nachher:** Migration `20260801170000_fix_rls_org_scope.sql`:
- Neuer Helfer `actor_belongs_to_org()` (prüft Org-Zugehörigkeit für Staff
  **und** Betreuungskräfte/Klient:innen, nicht nur `organization_members`).
- Die 5 INSERT-Policies verlangen jetzt `organization_id is null or
  actor_belongs_to_org(organization_id)`.
- Trigger `prevent_organization_id_change()` (BEFORE UPDATE) auf den 5
  betroffenen Tabellen — verhindert Tenant-Hopping zuverlässig (RLS
  `with check` kann NEW nicht gegen OLD vergleichen, ein Trigger schon).

**Wichtig:** Nur Migrationsdatei — **nicht** auf die Prod-DB angewendet.

**Tests:** `efy-care/__tests__/security/p0-2-rls-tenant-isolation.test.ts` —
15 SQL-Analyse-Tests (kein DB-Zugriff): prüfen die Migrationsdatei als Text
auf die erwarteten Checks/Trigger für alle 9 Policies + Regressionsschutz
gegen den alten verwundbaren Insert-Check. **15/15 grün.**

---

## P0-3: Token-Speicherung (efy care)

**Vorher:** `src/lib/supabase.ts` übergab `AsyncStorage` direkt als
`auth.storage` an den Supabase-Client — Access-/Refresh-Token lagen im
Klartext (Android: über `adb backup` auslesbar, unverschlüsselte Cloud-
Backups, nach Root/Jailbreak trivial extrahierbar).

**Nachher:** `secureSessionStorage` (neuer Adapter) — der von Supabase selbst
empfohlene „LargeSecureStore"-Hybrid: ein zufälliger AES-256-Schlüssel liegt
in `expo-secure-store` (iOS Keychain/Android Keystore), die eigentliche
Session AES-verschlüsselt in AsyncStorage (SecureStore hat ein 2048-Byte-
Limit, die Supabase-Session ist typischerweise größer). Die AES-Kernlogik
(`aesEnvelope.ts`) hat bewusst keinen React-Native-Import und ist dadurch
unter Node/Vitest direkt testbar.

**Tests:** `efy-care/__tests__/security/p0-3-token-storage.test.ts` — 9 Tests:
Verschlüsselungs-Roundtrip, Chiffrat enthält nie den Klartext, jeder Aufruf
erzeugt einen neuen Schlüssel, falscher Schlüssel liefert nicht den Original-
wert, Verdrahtung von `supabase.ts` (kein direkter AsyncStorage-Import mehr).
**9/9 grün.**

---

## P0-4: Storage-Mandantentrennung (efy care)

**Vorher:** Die Buckets `leistungsnachweise`/`rechnungspakete` waren bereits
über `client_org_member()` an die Organisation des Klienten gebunden — der
Bucket `qualitaetsmanagement` wurde dabei übersehen:
- `qualitaetsmanagement_select`: `auth.uid() is not null` — jede angemeldete
  Person **jeder** Organisation konnte jedes QM-Dokument **jeder anderen**
  Organisation lesen.
- `qualitaetsmanagement_write/update/delete`: `is_admin_or_pdl()` ohne
  Org-Bezug — Admin/PDL von Org A konnte QM-Dokumente von Org B löschen.

**Nachher:** Migration `20260801180000_storage_org_scope.sql` führt für
`qualitaetsmanagement` dieselbe `<organization_id>/…`-Pfadkonvention wie bei
den anderen beiden Buckets ein, gebunden über `is_org_member()`. Der Bucket
wurde client-seitig noch nicht befüllt (kein Referenz-Treffer in `app/src/`),
daher keine Datenmigration nötig.

**Wichtig:** Nur Migrationsdatei — **nicht** auf die Prod-DB angewendet.

**Tests:** `efy-care/__tests__/security/p0-4-storage-isolation.test.ts` —
12 Tests: prüfen die neuen Policies auf Org-Bindung + Regressionsschutz, dass
`leistungsnachweise`/`rechnungspakete` weiterhin `client_org_member()`
referenzieren. **12/12 grün.**

---

## P0-5: Hartcodierte IK-Nummer (beide Projekte)

**Vorher:** Alltagsengels IK (`460629986`) stand wörtlich in 5 Stellen:

| Datei | Vorher |
|---|---|
| `lib/abrechnung/edifact-generator.ts:42` | `export const ALLTAGSENGEL_IK = '460629986'` |
| `lib/abrechnung/leistungsnachweis-pdf.ts:35` | `ik: '460629986'` |
| `app/admin/abrechnung/einstellungen/page.tsx:14` | `const EIGENE_IK = '460629986'` |
| `app/api/leistungsnachweis/route.ts:42` | `process.env.ALLTAGSENGEL_IK_NUMMER \|\| '460629986'` |
| `efy-care/app/src/features/abrechnung/leistungsnachweis.ts:36` | `export const IK_NUMMER = '460629986'` |

Das war für den heutigen Single-Org-Betrieb harmlos, hätte aber jede weitere
Organisation (Multi-Mandant, efy care ist bereits mandantenfähig) mit der
falschen IK ausgestattet.

**Nachher:**
- **Alltagsengel:** `lib/config/org-config.ts::getOrgIK(supabase, organizationId?)`
  — liest `organizations.ik_nummer` (DB, Default: die bestehende Stamm-Org-
  Konstante `DEFAULT_ORG_ID` aus `lib/organizations/types.ts` — bewusst
  wiederverwendet statt dupliziert), Fallback `ALLTAGSENGEL_IK`-Env,
  sonst Fehler. Kein hartcodierter Default mehr. `edifact-generator.ts`
  verlangt `absender_ik` jetzt als Pflichtparameter (alle bestehenden
  Aufrufer übergaben ihn ohnehin schon explizit). Die beiden Client-
  Komponenten (`abrechnung/page.tsx`, `abrechnung/einstellungen/page.tsx`)
  laden die IK jetzt per `useEffect` + `getOrgIK()`.
- **efy care:** `app/src/lib/orgConfig.ts::getOrgIK(supabase, organizationId)`
  — analog, aber org-bewusster: liest die IK über die `organization_id` der
  jeweiligen Verordnung (echtes Multi-Mandanten-System), Fallback
  `EXPO_PUBLIC_ALLTAGSENGEL_IK`.

**Tests:** je ein grep-basierter Regressionstest pro Repo
(`__tests__/security/p0-5-no-hardcoded-ik.test.ts` in beiden), der den
gesamten `app/`+`lib/`-Quellcode (Alltagsengel) bzw. `app/src`
(efy care) nach dem String-Literal `'460629986'` durchsucht — erlaubt bleibt
ausschließlich Testcode (`secon.test.ts`-Fixtures). **8/8** (Alltagsengel)
bzw. **4/4** (efy care) grün.

---

## SECON-Architekturentscheidung

`audit/SECON_ARCHITECTURE_DECISION.md`: efy care baut **kein** eigenes SECON.
Begründung: `node-forge`/`zlib` (Basis der bestehenden SECON-Implementierung
in `lib/abrechnung/secon.ts`) sind Node.js-spezifisch und in React Native
nicht ohne komplette Neuimplementierung der CMS-Krypto-Schicht lauffähig;
X.509-Zertifikate sind IK- (also Organisations-), nicht Client-gebunden;
private Schlüssel gehören nicht auf Mobilgeräte. efy care erzeugt weiterhin
nur die unverschlüsselte EDIFACT-Nutzdatendatei — Verschlüsselung/Versand
laufen zentral über einen (noch zu bauenden) Alltagsengel-API-Endpunkt.

---

## Test-Ergebnisse (Gesamtprüfung)

```
Alltagsengel:  npx tsc --noEmit          → 0 Fehler
               npx vitest run            → 2 Dateien, 21/21 Tests grün
               npm run test:unit         → 26/28 grün (2 vorbestehende,
                                            unabhängige PLZ-Matching-Fehler
                                            in lib/hessen-plz.test.ts —
                                            nicht durch diese Arbeit
                                            verursacht, nicht Teil der P0-Liste)

efy care:      cd app && npm run typecheck → 0 Fehler
               npx vitest run              → 4 Dateien, 40/40 Tests grün
```

**Hinweis zu den 2 vorbestehenden hessen-plz-Fehlern:** Diese betreffen die
PLZ-Nachbarschafts-Matching-Logik (`Wiesbaden ↔ Frankfurt`, Geocoding-API-
Aufruf-Zähler) und wurden durch keine der P0-Änderungen berührt (kein Datei-
Overlap). Sie waren bereits vor dieser Session vorhanden und sind hier nicht
behoben worden, da sie kein Sicherheitsbefund sind — separates Ticket
empfohlen.

---

## GO/NO-GO-Update

Alle 5 P0-Befunde sind mit Migration/Code-Fix + Tests behoben und auf den
jeweiligen Repo-Branches (`audit/production-hardening` bzw. `main` in
efy care) gepusht. **Kein Deployment auf Produktion** (weder Datenbank-
Migrationen noch Vercel/App-Build) wurde ausgeführt — das bleibt eine
bewusste, separate Entscheidung des Auftraggebers.

**Offen vor echtem Produktivbetrieb** (aus den ursprünglichen Audit-Dokumenten,
nicht Teil dieser P0-Liste, zur Vollständigkeit):
- efy-care-Migrationen `20260801150000`–`20260801180000` müssen auf die
  jeweilige Prod-DB angewendet werden (aktuell nur als Dateien vorhanden).
- Alltagsengels eigene Multi-Mandanten-Migration
  (`20260801_phase3_multi_mandant_saas.sql`) ist ebenfalls noch nicht live.
- SECON-Übermittlungs-Endpunkt für efy care (s. Architekturentscheidung)
  ist noch nicht gebaut — aktuell rein manueller EDIFACT-Export.

---

## Abnahme (2026-08-01)

Unabhängige Abnahme-Session durchgeführt — vollständige Beweisführung in
**`audit/P0_ABNAHME_ALLTAGSENGEL.md`**. Ergebnis: **GO für Phase 3.**

Kernpunkte der Abnahme:

- Alle P0-Commits (`6f41d87`, `329a806`, `5b1e767`, `51ab34e`) sind auf
  `origin/audit/production-hardening` gepusht (lokal = remote, verifiziert).
- Test-Nachlauf 2026-08-01 14:32: `npx vitest run` → 21/21 grün, Exit 0
  (P0-1: 13/13, P0-5: 8/8, jeweils `--reporter=verbose` dokumentiert).
- **Test-Widerspruch „61 grün vs. hessen-plz rot" geklärt:** Die 61 sind
  21 Alltagsengel-Vitest + 40 efy-care-Vitest; `lib/hessen-plz.test.ts` läuft
  im separaten node:test-Runner (26/28 grün, Exit 1). Die 2 Fehler sind
  veraltete Assertions: Commit `c4195df` erhöhte `ENGEL_MATCH_RADIUS_KM`
  bewusst von 15 auf 25 km, die Distanz 65207↔65933 beträgt 21,05 km — bei
  25 km zurecht Match. Kein Produktfehler, kein P0-Bezug, vorbestehend.
- Neue Nebenbefunde (P1/P2): `/api/admin/*`-Routen ohne `requireAdmin()`
  einzeln reviewen; `tsx` fehlt in devDependencies (`npm run test:unit`
  bricht in frischen Clones); `validateIkNummer()` in `getOrgIK()` nachziehen;
  vor erstem Abrechnungslauf `ALLTAGSENGEL_IK`-Env setzen oder Phase-3-
  Migration anwenden.
