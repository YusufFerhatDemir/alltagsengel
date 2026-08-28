# AE Track 10 — Subjekt- und Objektbindung innerhalb des Mandanten

**Datum:** 28.08.2026
**Auditor:** Claude (autonom)
**Angriffsfläche:** Autorisierung auf **Objektebene** (BOLA/IDOR) und
**Urheberschaft** — also die Frage, wer innerhalb *derselben* Organisation
auf *dieses* Objekt zugreifen und in *dessen* Namen schreiben darf.

---

## Warum diese Fläche (Abgrenzung zu Tracks 1–9)

Track 6 und Track 7 haben die **Mandantengrenze** systematisch geschlossen:
`organization_id` in jedem Dienstschlüssel-Insert, `org_fence` auf jedem
Lese- und Schreibweg, eine CI-Lint-Regel je Klasse. Track 9 hat die
**Rollenmatrix** und die Personalwege geprüft.

Was in keinem der neun Tracks systematisch geprüft wurde, steht in der
Codebasis selbst als Satz: *„org_fence trennt Mandanten, NIE Rollen."*
Innerhalb einer Organisation entscheidet ausschließlich der Routen- und
Modulcode, wer welches einzelne Objekt sehen und beschreiben darf. Genau
dort setzt dieser Track an.

**Methode:** Ein Scanner über alle 411 Routen suchte Handler, die einen
`require*User()`-Guard (angemeldetes Konto, KEINE Berechtigungsprüfung)
mit `createAdminClient()` (umgeht RLS) verbinden — 16 Treffer, alle von
Hand nachgelesen. Zweiter Durchgang: Urheber- und Fremdschlüsselfelder,
die aus dem Request-Rumpf übernommen werden (`erhobenVon`,
`aufgenommenVon`, `hinzugefuegt_von`, `clientId`, `caregiverId`,
`dokumentId`), gehalten gegen die Prüfhelfer, die es dafür bereits gibt
(`clientGehoertZuOrg`, `assertCaregiverInOrg`).

---

## Befunde

### B1 (P1) — Jedes angemeldete Konto konnte in jeden fremden internen Nachrichtenverlauf schreiben

**Datei:** `lib/ops/nachrichten.ts` (`createAntwort`),
`app/api/ops/nachrichten/[id]/antworten/route.ts`

**WAS:** `createAntwort` prüfte nur, ob die Eltern-Nachricht existiert
**und** zur Organisation gehört. Ob der Absender an dem Verlauf beteiligt
ist, wurde nicht gefragt — obwohl `getNachricht` für das **Lesen** genau
das verlangt (`isSender || isRecipient`, sonst `null`). Lesen und
Schreiben beantworteten dieselbe Frage verschieden.

**WER kam durch:** `requireOpsUser()` lässt jedes Konto mit einem
profiles-Datensatz und einer auflösbaren Organisation durch —
`resolveUserOrgId()` löst die Organisation ausdrücklich auch über
`clients.user_id` auf. Damit erfüllt ein **Kundenkonto** den Guard.

**Exploit-Pfad:**
1. Anmeldung als `kunde` (oder `angehoerige`, `fahrer`, `engel`).
2. `POST /api/ops/nachrichten/<uuid>/antworten` mit
   `{ betreff, inhalt, empfaenger_ids: [<beliebige Konten der Org>] }`.
3. Die Antwort wird unter `eltern_id = <uuid>` eingefügt.

**WIRKUNG:** Die Antwort erscheint bei **jedem echten Beteiligten** unter
`GET /api/ops/nachrichten/[id]` als Teil des Verlaufs — mit aus `profiles`
aufgelöstem Absendernamen. Ein Kunde konnte damit Inhalt in einen internen
Dienstvorgang einschleusen („Bitte den Einsatz bei Frau M. streichen"),
der dort wie eine reguläre Wortmeldung im Vorgang steht. Über
`empfaenger_ids` ließ sich dieselbe Antwort zusätzlich in beliebige
Postfächer der Organisation legen; die vorhandene Prüfung
`assertEmpfaengerGehoerenZuOrg` erlaubt jedes Konto der Organisation.

**Ausdrücklich NICHT bewiesen:** ein *Lesen* fremder Verlaufsinhalte. Der
Lesepfad (`getNachricht`) verlangt Beteiligung an der Eltern-Nachricht;
wer nur eine Antwort einschleust, wird dadurch nicht Beteiligter der
Wurzel. Deshalb P1 und nicht P0.

**FIX:** Neue exportierte Funktion `istThreadTeilnehmer()` — beteiligt
ist, wer Absender oder Empfänger **irgendeiner** Nachricht des Verlaufs
ist (Wurzel + alle Antworten, nicht nur die unmittelbare
Eltern-Nachricht; sonst würde jemand, der berechtigt auf eine Antwort
geantwortet hat, in derselben Kette weiter unten ausgesperrt).
`createAntwort` ruft sie vor jeder anderen Arbeit auf und antwortet sonst
mit 403. Fail-closed: ein Datenbankfehler wird geworfen, nicht als
„beteiligt" oder „nicht beteiligt" gedeutet.

---

### B2 (P1) — `kunde` und `angehoerige` hatten Zugang zum internen Postfach

**Datei:** `lib/ops/api-auth.ts`, neu `lib/ops/postfach-rollen.ts`,
vier Routen unter `app/api/ops/nachrichten/**`

**WAS:** Dieselbe Ursache wie bei B1, aber eigenständig: `requireOpsUser()`
ist ein reiner „ist angemeldet und hat eine Organisation"-Guard. Er
bewachte auch `GET`/`POST /api/ops/nachrichten` und
`PATCH .../gelesen`. Ein Kundenkonto konnte damit interne Nachrichten
**anlegen** und an beliebige Mitarbeitende der Organisation adressieren.

**WARUM das keine gewollte Funktion ist:** Es gibt für Kundschaft keine
Oberfläche dafür. Das Kundenpostfach (`app/kunde/nachrichten`) läuft über
`care_notes` (RLS-basiert, eigener Weg) und ruft `/api/ops/nachrichten`
nirgends auf — nachgeprüft. Die einzigen Aufrufer sind
`app/admin/nachrichten/**` und `app/engel/nachrichten`.

**FIX:** `requireOpsPostfachUser()` mit der Erlaubnisliste
`OPS_POSTFACH_ROLLEN` (`superadmin, admin, pdl, qm, buchhaltung, engel,
fahrer`). Geprüft werden **beide** Rollenquellen; eine leere `appRolle`
schränkt nicht ein (bei den meisten Konten ist `app_metadata.role` nie
geschrieben worden), eine leere `profilRolle` ist ein Nein. Die reine
Regel liegt in einem eigenen Modul ohne `next/headers`, damit sie ohne
Sitzung prüfbar ist.

**Bewusst NICHT geändert:** `/api/ops/praeferenzen`,
`/api/ops/benachrichtigungen*` bleiben auf `requireOpsUser()`. Sie sind
durchgehend auf `auth.userId` selbst-bezogen (siehe N3) — dort ist der
weitere Guard richtig.

---

### B3 (P2) — Urheberschaft in der Pflegedokumentation war frei wählbar

**Dateien:** `lib/sis/assessments.ts` (`erhoben_von`),
`lib/pflege/aufnahmen.ts` (`aufgenommen_von`),
`lib/ops/anhaenge.ts` (`hinzugefuegt_von`)

**WAS:** Drei Schreibwege übernehmen die Urheber-ID aus dem Request-Rumpf
(`body.erhobenVon ?? userId`, `body.aufgenommenVon ?? userId`,
`body.hinzugefuegt_von || auth.ctx.userId`). Die Spalten sind
`uuid REFERENCES auth.users(id)` — `auth.users` ist mandantenübergreifend,
die Fremdschlüsselbedingung sagt also nur „irgendein Konto der Plattform"
und gerade nicht „ein Konto dieser Organisation". Geschrieben wird mit dem
Dienstschlüssel, RLS greift nicht.

**WARUM das zählt:** Die SIS nach § 113 SGB XI und die Kundenaufnahme sind
Instrumente der Pflegedokumentation; „erhoben von" bzw. „aufgenommen von"
ist die Person, die für die Erhebung einsteht. Bei einer MD-Prüfung ist
das Teil des Nachweises. Ein Feld, das der Aufrufer frei setzt, ist als
Nachweis wertlos — und im schlechteren Fall wird eine fremde Person als
Urheber ausgewiesen.

**FIX:** Neuer Helfer `lib/organizations/benutzer-guard.ts`
(`benutzerGehoertZuOrg` / `assertBenutzerInOrg`). Er löst die
Zugehörigkeit über dieselben drei Wege auf wie `resolveUserOrgId`:
`organization_members` → `caregivers.user_id` → `clients.user_id`.
Fail-closed: leere ID ist ein Nein, ein Datenbankfehler wird geworfen und
nicht als „gehört dazu" gedeutet. Aufgerufen in `createAssessment`,
`createAufnahme` und `createAnhang`.

---

### B4 (P2) — Akten: `clientId`/`caregiverId`/`dokumentId` aus dem Rumpf ohne Mandantenprüfung

**Dateien:** `app/api/akten/dokumente/route.ts`,
`app/api/akten/vertraege/route.ts`, neu `lib/akten/zuordnung-guard.ts`

**WAS:** Beide Routen übernehmen `clientId` und `caregiverId` unverändert
aus dem Rumpf und schreiben mit dem Dienstschlüssel. Acht Schwesterrouten
unter `app/api/pflege/**` stellen diese Frage bereits über
`clientGehoertZuOrg`, die Personalwege über `assertCaregiverInOrg` — die
beiden Akten-Wege waren die Ausnahme. Bei den Verträgen kam
`dokumentId` hinzu, eine einfache FK auf `akten_dokumente(id)` ohne
Mandantenbedingung.

**Wirkung — genau benannt, weil sie geringer ist als sie klingt:** Ein
Lesen über die Mandantengrenze entsteht **nicht**. `listDokumente` und
`listVertraege` selektieren `*` ohne PostgREST-Embed des Klienten, und die
Zeile trägt `organization_id` aus dem Auth-Kontext — nachgelesen, nicht
angenommen. Auch die Datei landet nicht beim fremden Mandanten: der
Storage-Pfad ist `${organizationId}/${scope}/…`. Was entsteht, ist eine
Akte, deren Zuordnung ins Leere bzw. auf einen fremden Mandanten zeigt:
sie erscheint in keiner Kunden- oder Mitarbeiterakte, die Übersichten
(`akten_kunden_uebersicht`, `akten_mitarbeiter_uebersicht`) zählen sie
nicht mit, und bei Verträgen hängt daran die Fristenüberwachung. Deshalb
P2 und nicht P1.

**FIX:** `assertZuordnungInOrg()` prüft Klient und Betreuungskraft gegen
die Organisation und lehnt „Kunde und Mitarbeiter gleichzeitig" mit 400
ab. Im Dokumenten-Weg läuft die Prüfung **vor** dem Upload — sonst läge
die Datei bereits im Bucket, wenn die Zuordnung abgelehnt wird. Im
Vertrags-Weg wird zusätzlich `dokumentId` über `getDokument(..., orgId)`
geprüft.

---

### B5 (P2) — Aufgaben-Anhang: `aufgabe_id` ungeprüft aus dem Pfad

**Datei:** `lib/ops/anhaenge.ts` (`createAnhang`)

**WAS:** Ein früherer Audit hatte bereits `dokument_id` gegen den
Mandanten gefencet (der Kommentar steht im Code). Die andere Seite
derselben Verknüpfung — `aufgabe_id` aus dem Pfad — blieb ungeprüft. Mit
einer fremden Aufgaben-UUID entstand eine Anhangszeile mit
`organization_id` des Aufrufers, deren Verknüpfung aus dem Mandanten
hinauszeigt.

**FIX:** `ops_aufgaben` wird gegen `id` + `organization_id` geladen; ohne
Treffer 404. Gleiche Stelle: die Urheberprüfung aus B3.

---

## Negativbefunde — was ausdrücklich **kein** Fehler ist

Ein Audit muss auch sagen, was es geprüft und *nicht* gefunden hat.

### N1 — `X-Forwarded-For`-Fälschung ist auf Vercel wirkungslos (live geprüft)

13 Stellen lesen die Client-IP als `x-forwarded-for.split(',')[0]`
(`lib/rate-limit.ts:getClientIp`, `lib/middleware/rate-limit.ts`,
`lib/audit-log.ts`, `lib/signaturen/signaturen.ts`,
`app/api/auth/check-rate-limit`, u. a.). Die naheliegende Vermutung war:
ein selbst gesetzter Header verschiebt den Rate-Limit-Schlüssel (und
fälscht die IP im Audit-Log und in `signaturen.ip_adresse`).

**Gegen die Produktion geprüft**, GET auf den eigenen
`/api/client-ip`-Endpunkt:

| Anfrage | Antwort |
| --- | --- |
| ohne Header | `{"ip":"93.249.131.9"}` |
| `X-Forwarded-For: 203.0.113.77` | `{"ip":"93.249.131.9"}` |
| `X-Forwarded-For: 198.51.100.5, 203.0.113.9` | `{"ip":"93.249.131.9"}` |

Vercel **überschreibt** den Header mit der echten Client-IP; er wird nicht
angehängt. Die Vermutung ist damit widerlegt, es wurde nichts geändert.
Der Befund gilt genau für diese Betriebsart — hinter einem anderen Proxy
(oder bei Direktzugriff auf den Node-Prozess) wäre er wieder da.

### N2 — `/api/sync` ist auf der Serverseite sauber gebunden

Der Batch-Endpunkt nimmt `OfflineQueueItem[]` aus dem Rumpf entgegen,
verwendet aber **nicht** das mitgeschickte `endpoint`, sondern löst den
Ziel-Endpunkt aus `SYNC_ENTITY_REGISTRY` auf. `user_id` und
`organization_id` jedes Items werden gegen den Auth-Kontext geprüft
(„Ein Gerät darf nur seine eigene Queue synchronisieren"), die Idempotenz
läuft über `sync_audit_log`, der Batch ist auf 50 begrenzt. Kein Befund.

### N3 — `/api/ops/praeferenzen` und `/api/ops/benachrichtigungen*` sind selbst-bezogen

Alle fünf Handler setzen `empfaengerId`/`benutzerId` ausschließlich auf
`auth.userId`; keiner nimmt eine Benutzer-ID aus Rumpf oder Query. Der
Dienstschlüssel ist dort ohne Wirkung auf fremde Zeilen. Kein Befund.

### N4 — `GET /api/akten/dokumente/[id]/download` macht es richtig

Trotz `requireAktenUser()` (nur „angemeldet") + Dienstschlüssel: der
Datensatz wird **zuerst** mit dem RLS-Client des Nutzers gelesen; kommt
keine Zeile zurück, ist Schluss. Der Dienstschlüssel erzeugt erst danach
die signierte URL, weil die Buckets keine eigenen Client-Policies haben.
Zusätzlich `darfAusgeliefertWerden()` fail-closed gegen unbekannte
Status. Das ist das Muster, das die anderen Routen haben sollten.

### N5 — `GET /api/ops/nachrichten/[id]` liest subjektgebunden

`getNachricht(..., userId)` gibt `null` zurück, wenn der Aufrufer weder
Absender noch Empfänger ist; die anschließende Antwortenliste ist damit
bereits gedeckt. Der Lesepfad war korrekt — genau deshalb fiel der
Schreibpfad auf.

### N6 — Wund-Fotoupload validiert Dateien serverseitig gegen Magic-Bytes

`lib/wunden/fotos.ts` prüft MIME-Erlaubnisliste, 0 Byte, 10 MB und die
tatsächliche Dateisignatur (JPEG/PNG/WebP/HEIC). Der Pfad wird über
`sanitizeStorageName()` gebildet, das `/` und `\` ersetzt — kein
Pfad-Traversal. Kein Befund.

### N7 — Storage-Buckets tragen Größen- und MIME-Grenzen

`uploadDokumentDatei` (Akten) prüft selbst weder MIME noch Größe, die
Buckets `kunden-dokumente`, `mitarbeiter-dokumente` und `vertraege` tragen
aber `file_size_limit = 20 MB` und eine `allowed_mime_types`-Liste
(PDF/JPEG/PNG/WebP) aus Migration `20260809010000`; die fünf in Phase 5
nachgehärteten Buckets ebenso (`20260825_security_org_fence_storage_hardening`).
Ein aktiver Inhalt (HTML/SVG) wird an der Bucket-Grenze abgewiesen. Der
Anwender sieht dabei allerdings einen rohen Storage-Fehler statt einer
Meldung — als Ergonomie-Restposten benannt, nicht als Sicherheitsbefund.
Weiter offen und bereits in Phase 5 bewusst so entschieden:
`kim-attachments` hat ein Größenlimit, aber keine MIME-Erlaubnisliste.

### N8 — Medikamentengabe ist mehrfach gebunden

`erfasseEingabe` prüft Mandant, Zugehörigkeit des Medikaments zum
angegebenen Klienten, Status `aktiv`, den Verordnungszeitraum und eine
bereits dokumentierte Gabe (fail-closed bei nicht lesbarem Bestand). Der
Client-Wechsel (Dienstschlüssel nur bei `pflege.lesen`, sonst RLS-Client)
ist über **beide** Rollenquellen entschieden. Kein Befund.

### N9 — `/api/ops/workflow/processing` ist superadmin-gebunden

Der einzige `/api/ops`-Handler ohne `require*`-Marker: er prüft entweder
das Cron-Geheimnis (konstantzeitig, fail-closed) oder `superadmin` über
beide Rollenquellen, mit ausdrücklicher Begründung
(„verarbeitet organisationsübergreifende Daten"). Kein Befund.

---

## Restposten — benannt, nicht behoben

### R1 (P2, latent) — Offline-Ablage: Konflikt- und Audit-Speicher unverschlüsselt

`lib/offline/offline-store.ts` verschlüsselt Queue-Einträge mit AES-GCM
und einem nicht-exportierbaren `CryptoKey` — ausdrücklich, weil dort
Pflegedaten nach Art. 9 DSGVO liegen (der Kommentar an `encrypt()` sagt
das wörtlich). `saveConflict()` und `saveAuditLog()` schreiben dagegen
**roh** in die IndexedDB. `KonfliktLogEintrag.lokale_daten` ist exakt die
`payload` des Queue-Eintrags (Pflegebericht, Medikamentengabe,
Vitalwerte, Wunddoku), `server_daten` zusätzlich der Serverstand. Der
Konfliktspeicher wird zudem nie geleert — `clearSynced()` räumt nur die
Queue. Damit steht dieselbe Datenklasse im Klartext neben dem Chiffrat.

Weitere Punkte im selben Modul, gleiche Klasse:
* `syncAll()` setzt `status: 'syncing'` vor dem `fetch`. Bricht der Prozess
  dazwischen ab, bleibt der Eintrag auf `syncing` — `syncAll` liest nur
  `pending` und `error`. Die Dokumentation wird nie gesendet, und die
  Oberfläche meldet dauerhaft „wird synchronisiert".
* Bei `last_write_wins` setzt `handleConflict()` den Eintrag auf `pending`
  zurück; die pending-Auswahl beachtet weder `retry_count` noch
  `naechster_retry`. Ein dauerhafter 409 (z. B. „Für diese Gabe ist
  bereits … dokumentiert") wiederholt sich damit alle 30 s unbegrenzt und
  verdrängt über `batch_size = 10` neue Einträge.
* `resolveConflict()` aktualisiert nur den Konflikteintrag; das Queue-Item
  bleibt auf `conflict` und wird nie wieder angefasst. Es schreibt
  außerdem die **Konflikt**-ID als `queue_item_id` ins Audit-Log und setzt
  `entity_typ` fest auf `'leistungsnachweis'`.

**Warum nicht in diesem Track behoben:** `lib/offline/offline-queue.ts`
und `offline-store.ts` werden von **keinem** laufenden Codepfad
importiert — geprüft über das gesamte Repo; nur `lib/offline/types.ts`
wird von `/api/sync` und `lib/sync/**` genutzt. Die Befunde sind damit
latent. Für eine belastbare Korrektur fehlt außerdem ein
IndexedDB-Prüfstand (kein `fake-indexeddb` im Projekt); die bestehende
Testdatei `__tests__/offline/offline.test.ts` prüft die reinen
Validierer und einen fail-closed-Fall ohne IndexedDB. Eine Änderung an
der Verschlüsselung ohne Test wäre gegen die Prüfdisziplin dieses Repos.
Der Punkt gehört vor der Inbetriebnahme des Offline-Modus abgearbeitet.

### R2 (gering) — Bucket-Fehler erreichen den Anwender roh

Siehe N7: `uploadDokumentDatei` sollte MIME und Größe selbst prüfen,
damit ein abgelehnter Upload eine lesbare Meldung ergibt statt eines
Storage-400. Keine Sicherheitswirkung, die Bucket-Grenze hält.

---

## Nebenbefund (behoben)

`lib/pilot/pre-pilot-snapshot.ts` führte in `JUENGSTE_MIGRATIONEN` noch
den Stand vor Track 9; der zugehörige Regressionstest war auf `main`
**rot**. Liste nachgezogen — der Test hält sie gegen das echte
Verzeichnis, genau dafür ist er da.

---

## Tests

**44 neue Tests** in `__tests__/security/subjektbindung-track10.test.ts`,
gebaut auf dem filterprotokollierenden Doppelgänger
`__tests__/helpers/supabase-fake.ts` — nicht auf dem einfachen ops-Mock:
mehrere der geprüften Fehler *sind* Fehler in den Filtern, ein Stub, der
Filter verschluckt, kann sie prinzipiell nicht finden.

| Block | Tests | Inhalt |
| --- | --- | --- |
| `istThreadTeilnehmer` | 9 | Absender/Empfänger von Wurzel und Antwort, Unbeteiligter, fremder Mandant, leere ID ohne DB-Zugriff, fail-closed bei DB-Fehler, Mandantenfence auf jeder Abfrage |
| `createAntwort` | 5 | erlaubter Weg + **3 Gegenproben** |
| Postfach-Erlaubnisliste | 7 | `kunde`/`angehoerige` ausgeschlossen, Betriebsrollen enthalten, Liste ⊆ `ROLLEN`, beide Quellen |
| `benutzerGehoertZuOrg` | 8 | drei Auflösungswege, fremde Org, leere ID ohne DB-Zugriff, fail-closed, 404 mit Feldnamen, Fence auf allen drei Abfragen |
| SIS + Aufnahme | 5 | **3 Gegenproben** (fremder Urheber → abgewiesen **und** kein Insert) |
| Akten-Zuordnung | 6 | **2 Gegenproben**, Organisationsablage ohne DB-Zugriff, 400 bei Doppelzuordnung |
| Aufgaben-Anhang | 4 | **2 Gegenproben**, Bestandsschutz der Dokumentprüfung |

**Neun Gegenproben** stellen den ALTEN Zustand nach: der Aufruf, der
vorher durchging, muss jetzt scheitern **und** darf nichts geschrieben
haben. Ein grüner Test, der nur den erlaubten Weg abgeht, belegt nicht,
dass der verbotene gesperrt ist.

**Drei Bestandstests** mussten an die neue Regel gezogen werden (nicht
umgekehrt):
* `__tests__/ops/nachrichten.test.ts` „setzt eltern_id für Threading" —
  der Absender ist jetzt Beteiligter des Verlaufs.
* `lib/ops/__tests__/nachrichten.test.ts` „lehnt fremde Empfänger ab" —
  der Doppelgänger kennt jetzt die Beteiligung, sonst scheiterte der Test
  schon an der neuen Prüfung und hätte nicht mehr geprüft, was sein Name
  sagt.
* `lib/sis/__tests__/sis.test.ts` und `lib/pflege/__tests__/aufnahmen.test.ts`
  — die Stubs kennen jetzt die Urheber-Abfrage.

---

## Prüfläufe

| Lauf | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | 0 Fehler |
| `npx vitest run` | 341 Dateien, **7741 bestanden**, 38 übersprungen, 0 rot (vorher 7697 bestanden + 1 rot) |
| `npm run test:unit` (node:test) | 2513 bestanden, 0 rot (vorher 4 rot) |
| `npm run lint:forbidden` | 0 Treffer (24788 Dateien) |
| `npm run lint:route-auth` | 0 Treffer (411 Routen) |
| `npm run lint:org-id` | 0 Treffer (1413 Dateien) |

**Keine Migration nötig** — alle fünf Befunde liegen im Anwendungscode.
Die Datenbank sagt an diesen Stellen bereits das Richtige; zu ändern war
der Code, der ihr mit dem Dienstschlüssel vorausläuft.

**Wahrheitsstand:** IMPLEMENTIERT und GETESTET (lokal grün). CI-GRÜN und
DEPLOYED erst nach dem Push; LIVE_VERIFIZIERT ist für diesen Track nicht
beansprucht — die Befunde sind Code-Befunde ohne Datenbankanteil, und ein
Live-Nachweis würde einen Testnutzer mit Kundenrolle voraussetzen, der
hier nicht angelegt wurde. Ausnahme: N1 ist **LIVE_VERIFIZIERT** (drei
Anfragen gegen die Produktion, oben protokolliert).
