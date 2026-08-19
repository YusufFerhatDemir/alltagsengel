# Track 5 — KIM / Telematikinfrastruktur: Statusbericht

**Stand:** 19.08.2026
**Umfang:** `lib/kim/`, `lib/fhir/`, `app/api/admin/kim/`, `app/api/billing/kim/`, `app/admin/kim/`, KIM-Migrationen und Tests
**Kurzfassung:** Es gibt keine Verbindung zur Telematikinfrastruktur und es wird keine vorgetäuscht. Der Nachrichtenpfad läuft vollständig gegen Simulatoren. Track 5 hat behoben, dass eine simulierte Zustellung in der Datenbank **nicht von einer echten unterscheidbar** war.

---

## 1. Bestandsaufnahme — zwei parallele Pfade

Das Modul ist in zwei Ausbaustufen entstanden, die nebeneinander bestehen:

### Pfad A — Block 18 (Stammdaten + Schnittstellendefinition)

| Datei | Zweck | Zustand |
|---|---|---|
| `config.ts` | Postfach-Konfiguration | vollständig, **stellt keine Verbindung her** |
| `versionen.ts` | Formatversionsregister (TA5) | vollständig, fail-closed |
| `karten.ts` | SMC-B/eHBA-Register | vollständig, **kein Kartenzugriff** |
| `nachrichten.ts` | Warteschlange | vollständig, **kein Versand** |
| `versand.ts` | Versand | **wirft bedingungslos** (`KimSpecFehltError`) |
| `adapter.ts` | Provider-Schnittstelle + `NULL_ADAPTER` | fail-closed; ohne registrierten Adapter wirft jede Operation |
| `readiness.ts` | Blockerliste intern/extern | vollständig |

### Pfad B — WS3 (echter Nachrichtenbetrieb gegen Simulatoren)

| Datei | Zweck | Zustand |
|---|---|---|
| `provider-interface.ts` | `IKimProvider` — der Vertrag | vollständig |
| `provider-factory.ts` | einziger Konstruktionspunkt | `kim_plus`/`kim_basis` **werfen** |
| `mock-provider.ts` | Simulation mit zeitbasierter Statusalterung | vollständig |
| `test-provider.ts` | deterministischer Testdoppel | vollständig |
| `message-service.ts`, `outbox-service.ts`, `inbox-service.ts` | Entwurf → Warteschlange → Versand → Zustellstatus → Eingang | vollständig **(Track 5 erweitert)** |
| `address-book-service.ts`, `attachment-service.ts`, `audit-service.ts` | Adressbuch, Anhänge (privater Bucket), Audit | vollständig |
| `versandmodus.ts` | **neu in Track 5** | Betriebsmodus + Simulationskennzeichnung |

**FHIR** (`lib/fhir/`, 883 Z.): Mapper, Import, `OperationOutcome`, Audit — als Nutzdatenformat unabhängig von KIM nutzbar.

**Migrationen — alle live bestätigt** (PostgREST gegen Produktion, 19.08.2026):
`kim_konfiguration`, `kim_karten`, `kim_formatversionen` (1 Zeile), `kim_addresses`, `kim_provider_config`, `kim_messages`, `kim_attachments`, `kim_audit_log` — alle vorhanden, alle **außer** `kim_formatversionen` leer.
Die eine Formatversion (TA5 1.2.0, gültig ab 02/2027) steht auf `spec_bestaetigt = false`.

---

## 2. Der Befund, den Track 5 behoben hat

### 2.1 Simulierte Zustellungen waren von echten nicht unterscheidbar

Der WS3-Pfad kann heute vollständig durchlaufen: `resolveOrgProvider()` liefert **ohne jede Konfiguration** den Mock-Provider (Zeile 87 in `provider-config-service.ts`), `processOutbox()` setzt danach `kim_messages.status = 'gesendet'`, und `pollDeliveryStatuses()` zieht dieselbe Zeile über `'zugestellt'` bis `'gelesen'` weiter.

An der gespeicherten Nachricht war **nicht erkennbar**, dass diese Zustellung simuliert war. Eine Zeile mit `status = 'zugestellt'` sah exakt aus wie eine echte KIM-Zustellung an eine Arztpraxis — in einem Postfach, das im Gesundheitswesen als Zustellnachweis gilt. `getProviderInfo().isSimulated` existierte, wurde aber nirgends persistiert.

Weder `outbox-service.ts` noch `inbox-service.ts` prüften das Gate `KIM_AKTIV`. Der WS3-Pfad war komplett am Freigabe-System vorbeigebaut, das Pfad A benutzt.

### 2.2 Zwei Regeln, umgesetzt in `lib/kim/versandmodus.ts`

**Regel 1 — Kennzeichnen.** Jede über einen simulierten Provider erzeugte oder abgeholte Nachricht trägt in `kim_messages.metadata.kim_simulation` fest, womit sie verarbeitet wurde: Providertyp, Bezeichnung, Zeitpunkt und der Klartext

> „SIMULIERT — kein echter KIM-Versand, keine Verbindung zur Telematikinfrastruktur. Zustellstatus stammt von einem Simulator und ist KEIN Zustellnachweis."

Die Kennzeichnung entsteht **im selben `UPDATE` wie der Statuswechsel** — es gibt keinen Zwischenzustand, in dem `'gesendet'` ohne Herkunft steht. Ein einmal gesetzter Marker wird nie entfernt: dass eine Zeile durch einen Simulator gelaufen ist, bleibt Teil ihrer Geschichte.

`metadata` ist eine bestehende `jsonb`-Spalte — **kein DDL nötig**, für das in dieser Session ohnehin kein Zugang besteht.

**Regel 2 — Nicht mischen.** Steht `KIM_AKTIV` auf `true`, behauptet der Betreiber Echtbetrieb (gematik-Zulassung, Provider-Vertrag, Konnektor). Ein simulierter Provider darf dann **nicht mehr senden**: `pruefeVersandModus()` wirft `KimBetriebsmodusError`, bevor der Provider überhaupt angefasst wird. Sonst liefen echte Arztbriefe in einen Simulator, der Erfolg meldet.

Eingehängt an allen drei zustandsschreibenden Stellen: `sendQueuedMessage()`, `pollDeliveryStatuses()`, `fetchAndStoreInbound()`.

### 2.3 API und Oberfläche

- `GET /api/admin/kim/outbox` liefert zusätzlich `betriebsmodus` — wer die Liste ansieht, erkennt, ob die Status echt sind.
- `POST` auf Outbox und Inbox antworten bei `KimBetriebsmodusError` mit **409** statt 500 (bewusster Abbruch, kein Serverfehler) und geben den Modus zurück.
- `/admin/kim/outbox`: Warnbanner im Simulationsbetrieb, Spalte **„Herkunft"** mit `SIMULIERT`-Kennzeichen je Zeile, gesperrter Verarbeitungs-Button bei unzulässiger Kombination.

### 2.4 Was ausdrücklich **nicht** gemacht wurde

Kein Verbindungsversuch, kein erfundenes Envelope-Format, keine Konnektor-Emulation, kein hinterlegtes Zertifikat, keine Behauptung einer gematik-Zulassung. `createKimProvider()` wirft für `kim_plus`/`kim_basis` unverändert, `lib/kim/versand.ts` wirft unverändert bedingungslos. Track 5 erlaubt nichts Neues — es verhindert, dass eine Simulation wie Echtbetrieb aussieht.

---

## 3. EXTERNAL_BLOCKER — nicht wegprogrammierbar

| # | Blocker | Zuständige Stelle | Blockiert |
|---|---|---|---|
| **EB-1** | **gematik-Zulassung** als Leistungserbringer | gematik GmbH | Alles Weitere |
| **EB-2** | **KIM-Provider-Vertrag** (liefert Postfachadresse + Zugang) | KIM-Anbieter (z. B. Fachdienst-Betreiber) | `kim_konfiguration.postfachadresse`, Freischaltungsstatus |
| **EB-3** | **Konnektor-Anbindung** (Hardware/Middleware für SMC-B/eHBA) | Konnektor-Anbieter | Jeder Kartenzugriff. Das Projekt implementiert **kein** eigenes Kartenprotokoll. |
| **EB-4** | **SMC-B (Institutionskarte)** und eHBA | gematik-zugelassener Kartenherausgeber | Signatur/Authentifizierung; `kim_karten` ist live leer |
| **EB-5** | **Technische Anlage 5** (KIM-Client-Spezifikation) | gematik Fachportal | Envelope-Format, Zustellquittungen. Wird **nicht** aus dem Gedächtnis rekonstruiert. |

**Reihenfolge:** EB-1 → EB-2 → EB-3/EB-4 → EB-5. Erst danach: Provider-Implementierung, Testnachricht, dann `KIM_AKTIV=true`.

---

## 4. Interne Restarbeit (nach Eintreffen von EB-1…EB-5)

1. Echte `IKimProvider`-Implementierung anlegen (`isSimulated: false`) und in `provider-factory.ts` als zusätzlicher `case` registrieren — Services, Routen und UI ändern sich dadurch **nicht**.
2. Für Pfad A zusätzlich `registriereKimAdapter()` in `adapter.ts` (z. B. aus `instrumentation.ts`).
3. `kim_formatversionen.spec_bestaetigt = true` **mit** `spec_quelle`.
4. `kimVersandImplementiert()` auf `true`, Sperre in `lib/kim/versand.ts` entfernen.
5. Testnachricht gegen die echte TI belegen.
6. Erst dann `KIM_AKTIV=true`. **Achtung:** ab diesem Moment verweigern Outbox und Inbox jeden Simulator-Betrieb (Regel 2) — das ist beabsichtigt.

**Offen und nicht in diesem Track behoben:** die beiden Pfade A und B sind nicht zusammengeführt. Pfad A hat ein Adapter-Register und eine Kartenverwaltung, Pfad B den funktionierenden Nachrichtenbetrieb. Eine Zusammenführung wäre ein Umbau an fremden Kernmodulen und war für diesen Durchlauf ausgeschlossen.

---

## 5. Tests

Neu:
- `__tests__/kim/versandmodus.test.ts` — 11 Tests: Modusermittlung für Mock/Test/echten Provider, Werfen im Echtbetrieb, Marker-Erzeugung, Metadaten-Zusammenführung ohne Datenverlust, Erkennung nicht gekennzeichneter Zeilen
- `__tests__/kim/simulation-kennzeichnung.test.ts` — 6 Integrationstests gegen den In-Memory-Supabase-Doppelgänger: Kennzeichnung bei Erfolg, bei Fehlschlag, bei Zustellstatus, Abbruch der Warteschlange im Echtbetrieb **ohne die Nachricht anzufassen**, Kennzeichnung eingehender Nachrichten, kein Abruf im Echtbetrieb

Bestand: `kim-block18.test.ts` (241 Z.), `message-service.test.ts`, `provider-interface.test.ts`, `inbox-service.test.ts`, `retry-logic.test.ts`, FHIR-Tests (516 Z.)

**Lauf 19.08.2026:** `__tests__/kim/` + `__tests__/fhir/` → **95 Tests grün**. Volle Suite: 3091 grün. Typecheck fehlerfrei.

---

## 6. Was NICHT geprüft ist (UNVERIFIZIERT)

- **Es gab nie eine Verbindung zur TI.** Alles, was über KIM „gesendet" wurde, lief gegen Mock- oder Test-Provider. Es existiert kein Beleg, dass ein KIM-Postfach dieses Systems erreichbar wäre.
- **Live wurde keine Nachricht verarbeitet:** `kim_messages` ist leer (0 Zeilen), ebenso `kim_provider_config`, `kim_addresses`, `kim_konfiguration`, `kim_karten`, `kim_audit_log`. Der Nachrichtenbetrieb ist bisher nur in Tests gelaufen.
- **TA5 Version 1.2.0 / gültig ab 02/2027** stammt aus der Projekt-Roadmap, nicht aus einem eingesehenen gematik-Dokument. Platzhalter mit `spec_bestaetigt = false`.
- **Die Marker-Kennzeichnung ist nicht rückwirkend.** Sollten vor dem 19.08.2026 in einer anderen Umgebung Nachrichten über einen Simulator verarbeitet worden sein, tragen sie keine Kennzeichnung. In der Produktionsdatenbank ist `kim_messages` leer — dort gibt es nichts nachzutragen.
- **Die Kennzeichnung schützt gegen Verwechslung, nicht gegen Manipulation.** `metadata` ist eine gewöhnliche Spalte; wer Schreibrechte auf `kim_messages` hat, kann den Marker entfernen. Ein unveränderlicher Nachweis wäre ein Trigger — das braucht DDL-Zugang.
