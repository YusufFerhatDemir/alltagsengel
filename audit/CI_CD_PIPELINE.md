# CI/CD-Pipeline — Dokumentation

Stand: 2026-08-01 · Branch: `audit/phase3-production-readiness`

## Was die Pipeline macht

`.github/workflows/ci.yml` läuft bei jedem Push nach `main` und bei jedem
Pull Request gegen `main`. Sie deployt nichts (Deployment läuft über
Vercel), sondern ist ein reines Qualitäts-Gate: rot = Merge blockiert.

Schritte, in Reihenfolge (schnell/billig zuerst, teuer zuletzt):

| Schritt | Command | Blockiert bei |
|---|---|---|
| Install | `npm ci` | kaputtem Lockfile / fehlender Dependency |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | TS-Fehlern |
| Lint | `npm run lint` (`eslint`) | Lint-Fehlern |
| Unit-Tests (vitest) | `npx vitest run` | rotem Test |
| Unit-Tests (node:test) | `npm run test:unit` | rotem Test |
| Secret-Scan | `scripts/ci-secret-scan.sh` | erkanntem Secret-Pattern |
| IK-Hardcoding-Check | `scripts/ci-ik-check.sh` | hartcodierter IK 460629986 in app/lib |
| Forbidden-Strings | `npm run lint:forbidden` | bekannten Falsch-Angaben (Rechtsform, Beträge, …) |
| Production-Build | `npm run build` (`next build --webpack`) | Build-Fehlern |

## Gefundene und behobene Blocker

Beim Aufsetzen der Pipeline sind drei bestehende, bis dahin unbemerkte
Probleme aufgefallen — alle wurden auf diesem Branch mitbehoben, weil die
Pipeline sonst nie grün geworden wäre:

1. **`middleware.ts` + `proxy.ts` gleichzeitig vorhanden.**
   Next.js 16 hat `middleware.ts` zugunsten von `proxy.ts` deprecatet und
   bricht den Build hart ab, wenn beide Dateien existieren
   (`middleware-to-proxy`-Fehler). `middleware.ts` war nur ein
   Re-Export-Shim von `proxy.ts` aus dem P0-1-Fix (Commit `6f41d87`) —
   `proxy.ts` ist bereits die vollständige, korrekt benannte
   Implementierung. `middleware.ts` wurde entfernt, `__tests__/security/
   p0-1-admin-auth.test.ts` importiert ohnehin direkt aus `proxy.ts` und
   ist unverändert grün.

2. **`tsx` wurde verwendet, war aber keine Dependency.**
   `package.json`-Scripts (`test:unit`, `lint:forbidden`, `audit:rls`, …)
   riefen `tsx` direkt auf, ohne dass es in `devDependencies` stand. Lokal
   fiel das nie auf, weil `npx tsx` fehlende Pakete automatisch nachlädt —
   in einer frischen `npm ci`-Umgebung (genau das, was CI macht) hätte
   jeder dieser Scripts sofort mit `tsx: command not found` abgebrochen.
   Fix: `tsx@^4.23.1` als `devDependency` ergänzt.

3. **`test:unit`-Glob lief nur einen Teil der Tests.**
   `"test:unit": "tsx --test lib/**/*.test.ts"` matchte über `npm run`
   (POSIX-`sh`, kein Bash-`globstar`) nur Testdateien in
   Unterverzeichnissen von `lib/` — `lib/hessen-plz.test.ts` und
   `lib/password-validation.test.ts` (direkt in `lib/`) wurden NIE
   ausgeführt, nur `lib/abrechnung/secon.test.ts`. Das lief lokal (in
   einer interaktiven Bash/Zsh-Shell mit `npx tsx --test lib/**/*.test.ts`
   direkt getippt) unbemerkt durch, weil Bash dort `**` selbst expandiert.
   Fix: `"test:unit": "tsx --test $(find lib -name '*.test.ts')"` —
   findet alle Testdateien unabhängig von der Verzeichnistiefe, robust in
   `sh`, `bash` und `zsh`.

## Bewusste Ausnahme im Secret-Scan

`scripts/ci-secret-scan.sh` schließt `chairmatch-landing/**` explizit aus.
Diese statischen, buildlosen Ads-Landingpages (eigener Deploy via
`deploy-chairmatch.yml`, kein Next.js-Build) rufen die Supabase-REST-API
direkt aus dem Browser auf und enthalten dafür zwangsläufig den
Supabase-**Anon**-Key (`role: anon`, kein `service_role`!) im Klartext —
ohne Build-Schritt gibt es keine andere Möglichkeit, ihn einzubetten. Der
Anon-Key ist per Supabase-Design öffentlich (er steht in jedem
Client-seitigen Aufruf); Schutz kommt über RLS-Policies auf der
Zieltabelle (`lead_inquiries`), nicht über Geheimhaltung des Keys. Das ist
kein Fund, der behoben werden muss — es ist aber nicht verifiziert worden,
ob die RLS-Policy auf `lead_inquiries` tatsächlich nur `INSERT` für
`anon` erlaubt (kein SELECT/UPDATE/DELETE). **Offener Punkt**, falls das
noch nicht geprüft wurde.

## Offene Punkte (nicht Teil dieses Branches)

- **`app/kunde/home/page.tsx` hat einen eigenen, hartcodierten
  Umkreis-Filter** (`[5, 10, 25, 50]` km, Default 10 km, eigene
  `haversineDistance`-Berechnung) — komplett unabhängig von
  `lib/plz-radius.ts` (`ENGEL_MATCH_RADIUS_KM = 25`,
  `RADIUS_OPTIONEN = [10, 25, 50, 100]`), das `app/api/engel/match/route.ts`
  und `app/kunde/buchen-service/page.tsx` nutzen. Zwei verschiedene
  Radius-Konzepte mit unterschiedlichen Defaults/Stufen für denselben
  Anwendungsfall (Engel-Suche). Nicht in diesem Branch behoben — Fix würde
  eine echte Produktentscheidung brauchen (welcher Default ist richtig?)
  und UI-Verhalten auf einer produktiven Kundenseite ändern.
- **`app/einzugsgebiet/page.tsx` und `native/.../einzugsgebiet.tsx`
  kommunizieren "30 km Umkreis"** als Marketing-Aussage zum Servicegebiet.
  Das ist konzeptionell etwas anderes als der 25-km-Matching-Radius
  (Servicegebiet vs. Kunde↔Engel-Distanz) und wahrscheinlich kein Bug,
  aber die beiden Zahlen sollten nicht ohne Rücksprache angeglichen
  werden.
- **RLS auf `lead_inquiries`** (s. o.) — Verifikation empfohlen, aber
  nicht Teil dieses Branches.

## Radius-Konsistenz-Check (Schritt 2 des Auftrags)

`ENGEL_MATCH_RADIUS_KM = 25` (`lib/plz-radius.ts`) ist die einzige Quelle
für den Kunde↔Engel-Matching-Radius und wird konsistent verwendet in:
- `lib/plz-match.ts` (`matchPlz`, `matchPlzOffline` — Default-Parameter)
- `app/api/engel/match/route.ts` (Server-Filter, Default wenn kein
  `?radius=`-Query-Parameter gesetzt)
- `app/kunde/buchen-service/page.tsx` (Buchungsflow, inkl. `RADIUS_OPTIONEN`
  für die Umkreis-Auswahl)

Der Radius wurde in Commit `c4195df` von 15 km auf 25 km geändert —
gleichzeitig wurde von reiner Zonen-Zentroid-Näherung (grob, immer 5 km
Unschärfe-Puffer) auf exakte PLZ-Koordinaten (wo vorhanden) umgestellt.
Beide Änderungen zusammen führten dazu, dass zwei Testfälle in
`lib/hessen-plz.test.ts` veraltete Assertions hatten (65207↔65933 matcht
jetzt korrekt bei exakter 21-km-Distanz, während das Wiesbadener Zentrum
65183↔65933 bei 25,16 km weiterhin knapp NICHT matcht — beides jetzt
präzise statt grob approximiert). Details und die exakte
Distanzberechnung stehen als Kommentare direkt bei den aktualisierten
Assertions in `lib/hessen-plz.test.ts`.

Die einzige gefundene Inkonsistenz ist der oben genannte, unabhängige
Radius-Filter in `app/kunde/home/page.tsx` — siehe "Offene Punkte".
