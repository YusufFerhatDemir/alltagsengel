# Datenflüsse — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — vollständig aus dem Quellcode abgeleitet
**Ergänzt:** `verarbeitungsverzeichnis_pflegecoach.md` (Was wird verarbeitet)
um die Frage **wohin fließt es**

---

## 0. Die vier Sätze, auf die es ankommt

1. Alle Gesundheitsdaten fließen **nur zwischen dem Browser der nutzenden Person
   und der Datenbank** — über genau eine Zwischenstation, die eigene
   Schnittstelle.
2. Es gibt **keinen ausgehenden Datenfluss zu Dritten**. Der PflegeCoach ruft
   keinen externen Dienst auf.
3. Daten verlassen das System nur auf ausdrückliche Veranlassung der betroffenen
   Person: als Datei (Export) oder als Ausdruck (Bericht).
4. Zwischen Gesundheitsdaten und Betriebsdaten existiert **keine** technische
   Verbindung außer einem nicht auflösbaren Pseudonym.

---

## 1. Gesamtbild

```
┌──────────────────────────────────────────────────────────────────────┐
│  GERÄT DER NUTZENDEN PERSON                                          │
│                                                                      │
│   Browser ── app/pflegecoach/**  (Oberfläche)                        │
│      │                                                               │
│      │  localStorage: NUR pc_schriftgrad, pc_kontrast                │
│      │  (keine Gesundheitsdaten, kein Token-Cache des Produkts)      │
└──────┼───────────────────────────────────────────────────────────────┘
       │ HTTPS, JSON
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ANWENDUNGSSCHICHT (Node-Laufzeit)                                    │
│                                                                      │
│   app/api/coach/**   16 Routen — Session-Client, kein service_role   │
│      │                 └─ Whitelisting, Längen-/Wertebereichsprüfung │
│      │                                                               │
│   app/api/dipa/**    4 Routen — Verwaltung, nie Gesundheitsdaten     │
│      │                                                               │
│   lib/coach/**       reine Funktionen, keine Ein-/Ausgabe            │
└──────┼───────────────────────────────────────────────────────────────┘
       │ PostgreSQL-Verbindung, Nutzersession durchgereicht
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DATENBANK (PostgreSQL, Row Level Security aktiv)                     │
│                                                                      │
│   ┌── Gesundheitsdaten ──────────┐  ┌── Betriebsdaten ────────────┐  │
│   │ coach_users, _consents,      │  │ coach_freischaltcodes       │  │
│   │ _shares, _assessments,       │  │ coach_abrechnungswege       │  │
│   │ _goals, _activities,         │  │ eul_erbringungen            │  │
│   │ _activity_log, _measurements,│  │ eul_qualifikationen         │  │
│   │ _reports, _freischaltungen,  │  │                             │  │
│   │ _anspruchspruefungen,        │  │ Zugriff: Verwaltung         │  │
│   │ _audit_log                   │  │ + Mandantengrenze           │  │
│   │                              │  │                             │  │
│   │ Zugriff: NUR die Person      │  │ KEIN Gesundheitsdatenbezug  │  │
│   │ selbst + eigene Freigaben    │  │                             │  │
│   └──────────────────────────────┘  └─────────────────────────────┘  │
│               ╎                                    ╎                 │
│               ╎  HMAC-Pseudonym (nicht auflösbar)  ╎                 │
│               └──────── coach_nutzungsereignisse ──┘                 │
│                         coach_pseudonym_key (für niemanden lesbar)   │
└──────────────────────────────────────────────────────────────────────┘

Ausgehend: KEINE Verbindung zu Dritten.
Verlassen das System nur: Export-Datei und Bericht-Ausdruck, beide vom Nutzer ausgelöst.
```

---

## 2. Die Flüsse im Einzelnen

### F1 — Erfassung von Pflegedaten (Assessment, Ziele, Aktivitäten, Messungen)

```
Nutzer füllt Formular
   └─► POST /api/coach/{assessments|ziele|aktivitaeten|messungen}
         ├─ requireCoachUser()  ── Session gültig? Profil vorhanden?
         ├─ Feld-Whitelist      ── nur bekannte Felder werden übernommen
         ├─ Wertebereichs- und Längenprüfung serverseitig
         ├─ coach_user_id kommt aus dem Auth-Kontext, NIE aus dem Body
         └─► INSERT über Session-Client
               ├─ RLS WITH CHECK: Zeile muss der eigenen Person gehören
               └─ Trigger coach_audit_trigger() ─► coach_audit_log
                     (Tabelle, Aktion, Zeilen-ID, Feldnamen — KEINE Werte)
```

Zwei Besonderheiten:

* Der Summenwert der Belastungs-Selbsteinschätzung wird **serverseitig** aus den
  Antworten berechnet (`app/api/coach/messungen`). Ein manipulierter Client kann
  ihn nicht setzen.
* Die Zuordnung zur Person entsteht ausschließlich serverseitig. Selbst ein Body
  mit fremder `coach_user_id` ändert daran nichts — die Regel greift zusätzlich
  in der Datenbank.

### F2 — Anzeige und Auswertung

```
Seitenaufruf
   └─► GET /api/coach/{...}
         ├─ requireCoachUser()
         └─► SELECT über Session-Client
               └─ RLS USING: eigene Zeilen + über coach_shares freigegebene
   ◄── JSON

Hinweise:
GET /api/coach/empfehlungen
   ├─ liest Ziele, Aktivitäten, Erledigungen (14 Tage), Assessments,
   │  Messungen (belastung_kurz, sturzereignis)
   ├─► berechneEmpfehlungen()   REINE FUNKTION, kein Schreibvorgang
   └─◄ Liste organisatorischer Hinweise + fester Hinweistext
```

Die Hinweisberechnung **speichert nichts**. Es entsteht kein Profil, kein Score,
keine abgeleitete Eigenschaft, die irgendwo bestehen bliebe.

### F3 — Einwilligung

```
Onboarding / Einstellungen
   └─► POST /api/coach/consents
         ├─ Bei Widerruf: UPDATE setzt widerrufen_am (Zeile bleibt bestehen)
         ├─ Bei Erteilung: INSERT mit Typ, Textversion, Zeitstempel
         └─► coach_consents   (kein DELETE — Grant entzogen)
```

Kein Fluss ohne vorherige Einwilligung: Ohne die Einwilligung
`gesundheitsdaten_art9` entsteht kein `coach_users`-Datensatz, und ohne diesen
weist `requireCoachUser()` jede Datenroute mit `NO_COACH_PROFILE` ab. Die
Einwilligung ist damit nicht nur Text, sondern das technische Tor.

Details: `einwilligungslogik.md`.

### F4 — Freigabe an Angehörige oder Pflegedienst

```
Freigabe erteilt (coach_shares, widerrufen_am IS NULL)
   │
   └─► empfangende Person ruft Daten ab
         └─ RLS-Policy *_share_select:
              coach_user_id IN (SELECT owner_coach_user_id FROM coach_shares
                                WHERE grantee_user_id = auth.uid()
                                  AND widerrufen_am IS NULL)
```

Merkmale dieses Flusses:

* **nur lesend** — es existiert keine Schreib-Policy für Empfangende
* **sofort wirksamer Widerruf** — `widerrufen_am` setzen genügt, es gibt keinen
  Zwischenspeicher und keine Kopie
* `coach_users` selbst bleibt privat: Stammdaten der freigebenden Person
  (Geburtsjahr, Pflegegrad) sind auch bei aktiver Freigabe **nicht** sichtbar
* keine Weitergabe an Dritte durch die empfangende Person — sie kann nur lesen,
  was sie ohnehin sieht

### F5 — Export durch die betroffene Person

```
GET /api/coach/export
   ├─ liest 7 Tabellen der eigenen Person
   ├─► buildExport()   REINE FUNKTION
   │     ├─ entfernt interne Kennungen und die Plattform-Nutzer-ID
   │     └─ ergänzt Format, Version, Produktversion, Feld-Erläuterungen
   └─◄ JSON-Datei ─► Gerät der Person
```

Ab dem Download liegt die Datei außerhalb des Systems und außerhalb der
Verantwortung des Herstellers. Darauf wird in der Oberfläche hingewiesen.
Details: `exportfunktionen.md`.

### F6 — Bericht

```
POST /api/coach/berichte
   ├─ liest Assessments, Ziele, Erledigungen und Messungen des Zeitraums
   ├─► buildVerlaufsbericht()   REINE FUNKTION
   └─► INSERT coach_reports (unveränderlicher Snapshot)
         └─ kein UPDATE, kein DELETE — weder Policy noch Grant

/pflegecoach/bericht ─► Druckansicht ─► Papier oder PDF (lokal beim Nutzer)
```

Der Ausdruck ist ein bewusster Ausgang: Er ist dafür gedacht, in ein Gespräch
mitgenommen zu werden. Was danach damit geschieht, entscheidet die Person.

### F7 — Nutzungsereignisse (nur wenn zweifach freigegeben)

```
Ereignis in der Oberfläche
   └─► POST /api/coach/nutzung
         ├─ Ereignisart gegen feste Liste geprüft ─ sonst 400
         ├─ Schalter COACH_NUTZUNGSNACHWEIS_AKTIV?  nein ─► { erfasst: false }
         ├─ Einwilligung 'wissenschaftliche_auswertung' gültig?
         │                                            nein ─► { erfasst: false }
         ├─ RPC coach_mein_pseudonym()   ─ liefert NUR das eigene Pseudonym
         └─► INSERT coach_nutzungsereignisse
               pseudonym | ereignis | modul_key | rolle | auswertungswoche
               (KEIN coach_user_id, KEIN Zeitstempel, KEINE Inhalte)
```

Die Route antwortet bei fehlender Grundlage **weich** (`erfasst: false`), nicht
mit einem Fehler — die Erfassung darf keinen Nutzerablauf abbrechen. Beides
zusammen ist die doppelte Absicherung: Betriebsentscheidung **und** individuelle
Einwilligung.

### F8 — Auswertung für die Evaluation

```
GET /api/dipa/nachweise   (Verwaltung)
   ├─ requireOpsAdmin()
   ├─ Systemkontext-Lesezugriff auf coach_nutzungsereignisse
   │    (nötig, weil die Tabelle bewusst KEINE Verwaltungs-Policy hat)
   ├─► werteNutzungAus()   REINE FUNKTION
   │     ├─ < 5 Teilnehmende ─► alles unterdrückt
   │     └─ sonst: Summen je Ereignisart, je Modul, je Woche, Anteil regelmäßig
   └─◄ NUR Aggregate — nie Einzelzeilen, nie Pseudonyme
```

Dies ist die **einzige** Stelle im Produkt, an der jemand anderes als die
betroffene Person Daten aus dem Nutzerbereich liest. Sie ist auf eine Tabelle
ohne Personenbezug beschränkt, aggregiert sofort und unterdrückt kleine Gruppen.

### F9 — Freischaltung (nur bei aktiviertem Verfahren)

```
Nutzer gibt Code ein
   └─► POST /api/coach/freischaltung
         ├─ requireCoachUser()   ── Identität aus der Session
         ├─ Code normalisieren, SHA-256 mit Pfeffer bilden
         ├─ Systemkontext: SELECT coach_freischaltcodes WHERE code_hash = ?
         │     (Nutzer dürfen diese Tabelle NICHT lesen — sonst wären gültige
         │      Codes auslesbar)
         ├─ UPDATE ... WHERE status = 'ausgegeben'   ── genau einer gewinnt
         ├─► INSERT coach_freischaltungen (Nutzer-Seite)
         └─ schlägt der zweite Schritt fehl: Code wird zurückgesetzt
```

Was **nicht** fließt: In `coach_freischaltcodes` landet keine `coach_user_id`,
nur `eingeloest_pseudonym`. Die Verwaltung sieht „Code eingelöst", kann aber
weder Person noch Daten zuordnen.

### F10 — Löschung

```
DELETE /api/coach/loeschung
   ├─ Bestätigungswort geprüft
   ├─ 1. DELETE coach_nutzungsereignisse WHERE pseudonym = eigenes Pseudonym
   │      (zuerst — danach wäre das Pseudonym nicht mehr ermittelbar)
   └─ 2. DELETE coach_users
          └─ ON DELETE CASCADE ─► consents, shares, assessments, goals,
             activities, activity_log, measurements, reports,
             freischaltungen, anspruchspruefungen
          └─ Trigger schreibt die Löschung ins coach_audit_log
```

Was bewusst bleibt: Audit-Einträge (Metadaten ohne Werte), der Status
„eingelöst" eines Codes (Missbrauchsschutz) und eUL-Leistungsnachweise
(Betriebsdaten ohne Gesundheitsdatenbezug). Die Löschseite listet das vorher auf.
Details: `loeschkonzept.md`.

---

## 3. Flüsse, die es nicht gibt

| Vermuteter Fluss | Tatsächlich |
|------------------|-------------|
| Coach-Daten → Werbe-/Auswertungsdienste | existiert nicht; im Produktpfad sind Tracker technisch abgeschaltet (`components/ClientSideProviders.tsx`, `GoogleTagManager.tsx`) |
| Coach-Daten → operative Tabellen der Plattform (Kunden, Buchungen, Rechnungen) | existiert nicht; keine Fremdschlüssel, keine Abfrage, kein Schreibweg |
| Coach-Daten → Support oder Verwaltung | existiert nicht; für `coach_*` gibt es keine Verwaltungs-Policy |
| Coach-Daten → Sprachmodell / KI-Dienst | existiert nicht; der Beratungs-Chat der Plattform ist im Produktbereich abgeschaltet |
| Coach-Daten → E-Mail, Push, SMS | existiert nicht; das Produkt versendet nichts |
| Betriebsdaten → Gesundheitsdaten (Rückrichtung) | existiert nicht; die Brücke ist einseitig und pseudonym |
| eUL-Daten ↔ Coach-Daten | existiert nicht; `eul_erbringungen` enthält keine Inhalte aus `coach_*` |

## 4. Verarbeitung durch Dienstleister

Der Betrieb der Anwendung findet auf einer Hosting-Plattform und einer
Datenbankplattform statt. Beide verarbeiten die Daten technisch mit.

**Was hier nicht steht und bewusst nicht behauptet wird:** welche Dienste das im
Einzelnen sind, wo sie verarbeiten, welche Verträge bestehen und welche
Aufbewahrungsfristen für Sicherungskopien gelten. Diese Angaben lassen sich aus
dem Quellcode nicht ableiten. Sie gehören in ein Dossier zur
Auftragsverarbeitung — offener Punkt AK-DS-04, Vorlage in `docs/AVV_VORLAGE.md`,
Aktionsplan in `docs/DIPA_EXTERNAL_ACTIONS.md`.

## 5. Daten auf dem Gerät der nutzenden Person

| Speicher | Inhalt | Gesundheitsdaten? |
|----------|--------|-------------------|
| `localStorage` | `pc_schriftgrad`, `pc_kontrast` | nein — nur Darstellungseinstellungen |
| Sitzungs-Cookie der Plattform | Anmeldung | nein |
| heruntergeladene Export-Datei | vollständige eigene Daten | ja — ab dem Download in der Verantwortung der Person |
| Ausdruck / erzeugtes PDF des Berichts | Auszug der eigenen Daten | ja — dito |

Ein Zwischenspeicher der Fachdaten im Browser existiert nicht; jede Seite lädt
ihre Daten bei Aufruf neu.

## 6. Fluss-Matrix

Legende: **S** = Schreiben, **L** = Lesen, **–** = kein Zugriff

| Wer | Eigene Gesundheitsdaten | Fremde Gesundheitsdaten | Nutzungsereignisse | Betriebsdaten | Audit-Protokoll |
|-----|------------------------|-------------------------|--------------------|---------------|-----------------|
| Nutzende Person | S + L | – | S + L (nur eigene, pseudonym) | – | L (nur eigene) |
| Person mit erteilter Freigabe | – | L (nur freigegebene Bereiche) | – | – | – |
| Verwaltung / Support | – | – | nur aggregiert, über eine begründete Ausnahmeroute | S + L (mit Mandantengrenze) | – |
| Nicht angemeldete Besucher | – | – | – | – | – |
| Auswertungspartner | – | – | Aggregate bzw. pseudonyme Daten ohne Schlüssel | – | – |

Grundlage der Zeilen: `rollen_rechtekonzept.md`, verifiziert durch die
Datenbanktests in `supabase/shadow/50_pflegecoach_tests.sql`.

---

## 7. Offene Punkte

| Punkt | Status |
|-------|--------|
| Auftragsverarbeiter-Kette produktbezogen dokumentiert | offen — AK-DS-04 |
| Verarbeitungsort und Aufbewahrungsdauer von Sicherungskopien verifiziert | offen — siehe `loeschkonzept.md` §6 |
| Datenbanktests für die sieben Tabellen aus `20260826010000` | offen — GAP-SHADOW-15 |
| Laufzeitprüfung der Flüsse gegen die Produktionsdatenbank | offen — E2E-Test fehlt (GAP-E2E) |
