# Kassenabrechnung — Freischaltung

**Stand:** 2026-09-02 · **Betrifft:** § 105 SGB XI (Pflege), § 302 SGB V (häusliche Krankenpflege), KIM/TI

Dieses Dokument beantwortet eine Frage: **Was ist zu tun, wenn die Unterlagen von aussen ankommen?**

Die Architektur ist gebaut. Was fehlt, ist ausschliesslich extern beschaffbar. Für jeden der
drei Kanäle steht unten, wer die Freigabe erteilt, was einzutragen ist und welcher Schalter
umgelegt wird.

**Aktueller Stand jederzeit abrufbar:** `GET /api/billing/dta/freigaben`

---

## Die drei Schalter

| Env-Variable | Kanal | Status | Ohne ihn gesperrt |
|---|---|---|---|
| `ITSG_ZERTIFIZIERT` | § 105 SGB XI (Pflegekassen) | **zu** | Übertragung an die Datenannahmestelle + Antwortabruf |
| `SGB_V_302_FREIGABE` | § 302 SGB V (Krankenkassen) | **zu** | Erzeugung *und* Versand von § 302-Dateien |
| `KIM_AKTIV` | KIM / Telematikinfrastruktur | **zu** | Jeder KIM-Versand und -Abruf |

Nur der exakte String `true` schaltet frei. `1`, `TRUE`, `yes` oder ein Leerzeichen zu viel
bedeuten **gesperrt** — bei einem Kanal, über den echte Forderungen an Kostenträger gehen, ist
ein versehentlich offener Schalter der teurere Fehler.

Die Schalter liegen bewusst in der Umgebung (Vercel) und nicht in `kf_feature_flags`: sie
behaupten, dass ein externer Dritter (ITSG, GKV-Spitzenverband, gematik) etwas erteilt hat.
Ein Admin-Klick kann das nicht wahr machen.

---

## Kanal 1 — § 105 SGB XI (Pflegekassen)

**Fertigungsgrad: vollständig bis auf Zertifikat und Zugang.** Erzeugung, Validierung,
SECON-Verschlüsselung, Auftragsdatei, Übertragung, Statustracking, Rückläuferverarbeitung und
Audit sind gebaut und laufen im Testmodus heute schon durch.

### Vor dem Umlegen des Schalters

| # | Schritt | Bei wem |
|---|---|---|
| 1 | Anerkennung nach § 45a SGB XI im Bundesland nachweisen | Landesbehörde |
| 2 | IK-Nummer beantragen (falls nicht vorhanden) | ARGE·IK |
| 3 | SECON-Zertifikat beantragen — kostenpflichtig, mehrere Tage Vorlauf | ITSG Trust Center |
| 4 | SFTP-Zugang beantragen, öffentlichen SSH-Key registrieren | jeweilige Datenannahmestelle |
| 5 | Testübertragung mit Dateiindikator `0` vereinbaren und durchführen | Datenannahmestelle |
| 6 | **Erst danach** `ITSG_ZERTIFIZIERT=true` | Vercel |

### Was einzutragen ist

| Was | Wohin | Hinweis |
|---|---|---|
| PKCS#12-Zertifikat | Admin → Abrechnung → Einstellungen | landet im privaten Bucket `abrechnung`, **nie** in der DB |
| Zertifikat-Passwort | Env `SECON_ZERT_PASSWORT` (Vercel) | ohne sie ist der Private Key nicht lesbar |
| SSH Private Key | `POST /api/admin/abrechnung/sftp-key` (Admin → Annahmestellen) | Bucket, nie in der DB |
| SFTP-Zugang | `datenannahmestellen`: `sftp_host`, `sftp_port`, `sftp_user`, `sftp_verzeichnis`, `antwort_verzeichnis` | |
| Bundesland-Freigabe | `state_settings.dakota_export_enabled` | Admin → Expansion Deutschland |
| Empfänger-Zertifikate | werden aus dem öffentlichen ITSG-Verzeichnis geladen | Einstellungen → Empfänger-Zertifikate |

### Ablauf im Betrieb

```
Rechnung  →  DTA-Lauf anlegen   POST /api/billing/dta/create
          →  validieren         POST /api/billing/dta/[id]/validate
          →  freigeben          POST /api/billing/dta/[id]/freigabe
          →  exportieren        POST /api/billing/dta/[id]/export      ← EDIFACT + SECON-Auftragsdatei
          →  VERSENDEN          POST /api/billing/dta/[id]/versand     ← neu
          →  Antworten holen    POST /api/billing/dta/antworten        ← neu
          →  Rückläufer         automatisch importiert + klassifiziert
          →  Wiedervorlage      GET/POST /api/billing/dta/wiedervorlage
          →  Wiedereinreichung  POST /api/billing/dta/wiedervorlage/einreichen
```

### Testmodus — heute schon nutzbar

```
POST /api/billing/dta/[id]/versand
{ "testmodus": true }
```

Durchläuft alles bis unmittelbar vor die Leitung: Readiness, Nutzdaten, SECON-Verschlüsselung,
Hash- und Grössenberechnung. Überträgt nichts, verändert den Auftragsstatus nicht. Das Ergebnis
sagt, was der Echtversand tun würde und woran er derzeit hängt.

### Reihenfolge der Sperren

Das Feature-Gate steht bewusst **nach** Erzeugung und Verschlüsselung:

1. Doppelversand-Schutz — ein übermittelter Auftrag geht nicht erneut hinaus
2. Readiness (`pruefeVersandbereitschaft`) — Stammdaten, Zertifikate, Anerkennung, Routing
3. Nutzdaten aus dem Bucket
4. SECON-Verschlüsselung — **unverschlüsselt geht nie etwas hinaus**
5. **GATE `ITSG_ZERTIFIZIERT`**
6. SFTP-Übertragung

So lässt sich die gesamte Kette heute echt durchspielen, und es fehlt am Ende genau ein Schritt,
der von aussen kommt. Stünde das Gate vorne, wäre unbewiesen, ob der Rest funktioniert.

---

## Kanal 2 — § 302 SGB V (häusliche Krankenpflege)

**Fertigungsgrad: alles ausser der Datei selbst.** Positionsaufbereitung, Verordnungsprüfung,
Routing, Versionsauflösung, Lauf, Statusmodell, Protokoll und Audit stehen. Der **Generator ist
gesperrt** — und bleibt es, bis die Technische Anlage 1 vorliegt.

> **Segmentstrukturen werden nicht geraten.** Eine aus dem Gedächtnis rekonstruierte Datei sähe
> gültig aus, würde den Validator passieren und erst bei der Krankenkasse auffallen — oder dort
> falsch verarbeitet. Für einen Kanal, über den echte Abrechnungen gehen, ist „plausibel" nicht
> gut genug.

### Vor dem Umlegen des Schalters

| # | Schritt | Bei wem |
|---|---|---|
| 1 | Technische Anlage 1 zur § 302-Vereinbarung + Schlüsselverzeichnisse beschaffen | gkv-datenaustausch.de |
| 2 | Segment-Builder nach TA1 implementieren | `lib/abrechnung/sgb-v/generator.ts` |
| 3 | Validator implementieren (analog `edifact-validator.ts`) | |
| 4 | `sgb_v_formatversionen.spec_bestaetigt = true` mit `spec_quelle` setzen | Admin |
| 5 | `exportImplementiert()` auf `true` und Sperre in `erzeugeSgbVDatei()` entfernen | Code |
| 6 | Testübertragung durchführen | Datenannahmestelle |
| 7 | **Erst danach** `SGB_V_302_FREIGABE=true` | Vercel |

### Was einzutragen ist

| Was | Wohin |
|---|---|
| Formatversion | `sgb_v_formatversionen`: `ta_version`, `gueltig_von`, `spec_bestaetigt`, `spec_quelle` |
| Routing je Kasse | `sgb_v_routing`: Kassen-IK → Datenannahmestelle-IK + `annahme_format` |
| Transportweg | derselbe wie § 105 — kein zweiter SFTP-Zugang nötig, sofern die Annahmestelle beide Verfahren annimmt |

### Was heute passiert

`POST /api/billing/sgb-v/versand` legt einen echten Lauf an, füllt ihn mit echten Positionen,
prüft Version und Routing — und endet planmässig im Status `gesperrt_extern` mit
Klartext-Begründung. Kein Versand, keine Datei, keine Forderung. Der Lauf bleibt als Nachweis
stehen, dass der Versuch stattgefunden hat.

Kanalstatus: `GET /api/billing/sgb-v/versand`

---

## Kanal 3 — KIM / Telematikinfrastruktur

**Fertigungsgrad: Schnittstelle definiert, kein Provider angebunden.**
Postfachverwaltung, Kartenregister, Versionsregister und Nachrichten-Warteschlange stehen.

### Drei unabhängige Sperren

1. **Env-Gate** `KIM_AKTIV`
2. **Registrierter Adapter** — ohne ihn greift `NULL_ADAPTER`, der bei *jeder* Operation wirft, auch bei `status()`
3. **Versandpfad** `lib/kim/versand.ts` — fail-closed, bis TA5 vorliegt

Alle drei müssen offen sein. Kein Zustand erlaubt einen unbeabsichtigten Versand.

### Vor dem Umlegen des Schalters

| # | Schritt | Bei wem |
|---|---|---|
| 1 | Zulassung als Leistungserbringer | gematik |
| 2 | KIM-Provider-Vertrag (liefert Postfachadresse + Zugang) | KIM-Provider |
| 3 | Konnektor-Anbindung für SMC-B/eHBA einrichten | Konnektor-Anbieter |
| 4 | Technische Anlage 5 beschaffen | gematik Fachportal |
| 5 | Provider-Adapter implementieren und registrieren | Code |
| 6 | Testnachricht | Provider |
| 7 | **Erst danach** `KIM_AKTIV=true` | Vercel |

### Adapter anbinden

```ts
// z.B. in instrumentation.ts, einmalig beim Serverstart
import { registriereKimAdapter } from '@/lib/kim/adapter'

registriereKimAdapter({
  name: 'provider-xy',
  senden:    async (auftrag) => { /* KimSendeErgebnis */ },
  empfangen: async (auftrag) => { /* KimEingang[]    */ },
  status:    async (anfrage) => { /* KimStatusErgebnis */ },
})
```

Die Schnittstelle ist bewusst schmal — drei Operationen, keine Konfigurationsmethoden. Was ein
Adapter über Postfach, Karte und Zugang wissen muss, liest er aus `kim_konfiguration` und
`kim_karten`; die Schnittstelle bleibt dadurch unabhängig davon, wie ein Provider sich
authentifiziert.

Kanalstatus: `GET /api/billing/kim/adapter` · Selbsttest der Sperre: `POST` auf dieselbe Route.

---

## Rückläufer und Wiedervorlage

### Vier Kategorien

Kassen verwenden je eigene Fehlercodes. Für die Sachbearbeitung zählt nur: *was tue ich jetzt?*

| Kategorie | Bedeutung | Massnahme |
|---|---|---|
| `verarbeitungsfehler` | Datei/Technik — Format, Struktur, Verschlüsselung | Nichts am Fall ändern, Ursache in der Datei beheben, erneut übertragen |
| `datenfehler` | Feld fehlt oder unplausibel | Stammdaten korrigieren, als Korrekturlauf einreichen |
| `tarifabweichung` | Betrag/Position weicht vom Vertrag ab | Tarif gegen den Landesrahmenvertrag prüfen — sonst wiederholt sich die Kürzung monatlich |
| `versicherter_unbekannt` | Versichertennummer/Kassenzugehörigkeit/Zeitraum | Daten abgleichen; bestand kein Schutz → privat berechnen, **nicht** erneut einreichen |
| `unbekannt` | Code nicht im Katalog | absichtlich kein Rateergebnis — bleibt sichtbar im Arbeitsvorrat |

### Der Katalog ist leer — und das ist Absicht

`dta_fehlercode_katalog` wird **nicht** mit angeblichen Codes ausgeliefert. Die echten Codes
stehen in den Fehlerverzeichnissen der jeweiligen Annahmestelle. Eine geratene Zuordnung würde
eine echte Ablehnung still in die falsche Schublade sortieren — sie verschwände aus dem
Arbeitsvorrat, ohne dass es jemandem auffällt.

Jeder Eintrag braucht `spec_quelle` (Dokument + Stand). Bis dahin greift eine Heuristik, die sich
ausschliesslich auf projekteigene Konventionen stützt (das `T`-Präfix des eigenen SLGA-Parsers)
und im Zweifel `unbekannt` liefert.

Pflege: `POST /api/billing/dta/fehlercodes`

### Wiedervorlage-Queue

Eine Zeile je abgelehnter/gekürzter Position. Die Rückmeldung der Kasse selbst wird dabei **nicht**
verändert — sie ist Beleg.

```
offen → in_korrektur → korrigiert → eingereicht → erledigt
                                 ↘ verworfen (nur mit Begründung)
```

Zwei Regeln, die verhindern, dass ein Betrag lautlos verschwindet:

- **`erledigt` nur nach `eingereicht`** — erledigt heisst, es war wirklich etwas bei der Kasse
- **`verworfen` nur mit Begründung** — ein bewusstes Fallenlassen muss nachlesbar sein

Der Unique-Index auf `ruecklaeufer_position_id` verhindert, dass dieselbe Position zweimal in die
Queue kommt und derselbe Betrag doppelt nachgefordert wird.

Beim Import eines Rückläufers werden betroffene Positionen automatisch eingereiht. Schlägt das
fehl (z. B. weil die Migration noch nicht angewendet ist), bleibt der Import gültig — der
Arbeitsvorrat lässt sich per `POST /api/billing/dta/wiedervorlage` nachziehen.

---

## Audit und Nachweis

Jeder Übermittlungsversuch erzeugt eine Zeile in `dta_versand_protokoll` — **auch die
abgebrochenen**. Genau die sind der interessante Fall: ein leeres Protokoll hiesse „niemand hat
etwas getan", während in Wahrheit die Pipeline am Gate oder an der Readiness gestoppt hat.

Protokolliert werden Kanal, Phase, Ergebnis, Dateihash und -grösse, Empfänger-IK, Zielhost, Dauer,
auslösende Person und der Stand aller drei Feature-Gates zum Zeitpunkt des Versuchs.

**Keine Zugangsdaten:** Host ja, Benutzername/Key/Passwort nein — `entferneZugangsdaten()`
bereinigt die Transportprotokolle vor dem Schreiben.

Parallel schreibt jede Aktion in `billing_audit_trail` (`dta_versand`, `dta_wiedervorlage`,
`dta_fehlercode`): wer wann was gesendet, korrigiert oder erneut eingereicht hat.

Abruf: `GET /api/billing/dta/versand-protokoll?lauf_id=…&kanal=…`

---

## Migrationen

| Datei | Inhalt | Status |
|---|---|---|
| `20260902010000_dta_versand_pipeline.sql` | `dta_versand_protokoll`, `dta_fehlercode_katalog`, `dta_wiedervorlage`, Audit-Entity-Typen | **wartet auf Live-Apply** |
| `20260902020000_sgb_v_302_laeufe.sql` | `sgb_v_laeufe` | **wartet auf Live-Apply** |

Reihenfolge beim Rollback umgekehrt: erst `20260902020001`, dann `20260902010001` — der Trigger
auf `sgb_v_laeufe` nutzt die Funktion aus der ersten Migration.

---

## Was hier bewusst NICHT steht

- Keine erfundenen Kassen-Endpunkte, Hosts oder Zugangsdaten
- Keine geratenen Fehlercodes der Kostenträger
- Keine rekonstruierten Segmentstrukturen für § 302 oder KIM
- Keine Simulation eines erfolgreichen Versands

Wo eine Angabe fehlt, ist sie zu beschaffen — nicht zu ergänzen.
