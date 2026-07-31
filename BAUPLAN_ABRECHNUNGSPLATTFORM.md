# BAUPLAN: Eigene Abrechnungsplattform „Engel DTA"

**Das KIM-native Abrechnungs-Betriebssystem für die ambulante Pflege — kein Dakota, kein DMRZ, kein Optica. Alles eigen.**

Stand: 31.07.2026 · Alltagsengel UG (IK 460629986) · Frankfurt am Main
Grundlage: [EIGENES_ABRECHNUNGSSYSTEM_ANALYSE.md](./EIGENES_ABRECHNUNGSSYSTEM_ANALYSE.md) (Marktanalyse) — dieses Dokument ist der **konkrete Bauplan**.

---

## 0. Executive Summary (für Investoren)

**Das Zeitfenster:** Ab **01.12.2026** ist die SGB-XI-Abrechnung über KIM/Telematikinfrastruktur Pflicht, ab **01.10.2027** ausschließlich vollelektronisch (inkl. eLNW). **Alle ~18.000 ambulanten Pflegedienste** müssen ihre Abrechnungsstrecke in den nächsten 14 Monaten umbauen. Der Marktstandard (dakota.le) ist eine Windows-Desktop-Software von 2006, deren Übertragungsweg stirbt. Es gibt **keine Zulassungspflicht** — nur ein kostenloses Testverfahren pro Datenannahmestelle. Die Verschlüsselung (SECON/Anlage 16) liegt als Open Source vor ([DieTechniker/secon-tool](https://github.com/DieTechniker/secon-tool), [bitmarck-service/fs2-secon](https://github.com/bitmarck-service/fs2-secon)).

**Die Strategie in einem Satz:** Alltagsengel und efy care rechnen ab Q4/2026 ihre eigenen Leistungen ohne Fremdanbieter ab (Referenzbetrieb), die identische Codebasis wird ab Q1/2027 als Multi-Mandanten-SaaS an externe Pflegedienste verkauft — KIM-nativ, API-first, Flat-Pricing statt Prozent vom Umsatz, mit Migrations-Autobahn aus Excel/Medifox/Snap.

**Warum wir gewinnen:**
1. **Timing** — Zwangsmigration 12/2026, jeder startet bei null, wir bauen Greenfield KIM-nativ.
2. **Eigenbetrieb** — „Wir rechnen selbst damit ab" ist im Pflegemarkt das stärkste Vertriebsargument.
3. **Vorhandene Basis** — Verordnungs-Workflow, Kostenträger-Verwaltung, Leistungspreise, Rechnungserstellung, Monatsabschluss und Zahlungskontrolle existieren **bereits produktiv** in der Alltagsengel-App. Es fehlt nur die letzte Meile: EDIFACT → SECON → Versand.
4. **Kein Prozentmodell** — DMRZ nimmt 0,5 % vom Umsatz, Abrechnungszentren 1–3 %. Wir: Flat.
5. **Zwei Marken, ein Kern** — Alltagsengel (§45a/§45b Betreuung, SGB XI) + efy care (§37 SGB V Pflege) decken beide Verfahren (§105 + §302) mit einer Engine ab.

**Business-Ziel:** 50 zahlende externe Dienste bis Mitte 2027 (~110 T€ ARR), 180 bis Ende 2027 (~390 T€ ARR), >1,4 Mio. € ARR in Jahr 3 mit Software-Partner-API. Grenzkosten pro Mandant nahe null.

---

## 1. Technische Grundlagen (Rechercheergebnis, verifiziert)

### 1.1 Der Abrechnungs-Datenfluss §105 SGB XI / §302 SGB V

```
Leistungsdaten (Einsätze, Leistungskomplexe, Zeiten)
        │
        ▼
EDIFACT-Nachrichten (UN/EDIFACT, Zeichensatz UNOC Version 3)
   §105 SGB XI:  PLGA (Gesamtaufstellung/Rechnungsebene)
               + PLAA (versichertenbezogene Einzeldaten)
   §302 SGB V:   SLGA + SLLA (analog, für HKP §37)
   Struktur: UNB→UNH→[FKT,REC,INV,NAD,ELS/ELP,BES,…]→UNT→UNZ
   Regelwerk: Technische Anlage 1 (aktuell v6.4.0), Anlage 3
   Schlüsselverzeichnisse (Abrechnungscode, Tarifkennzeichen,
   Leistungskomplex-Kataloge JE BUNDESLAND)
        │
        ▼
Nutzdatendatei + Auftragsdatei
        │
        ▼
SECON-Verschlüsselung (Anlage 16 „Security Schnittstelle")
   CMS/PKCS#7-Container: Signatur mit eigenem ITSG-Zertifikat
   + Verschlüsselung mit öffentlichem Zertifikat der Annahmestelle
   AES-256 symmetrisch, RSA ≥4096 Bit asymmetrisch
   Zertifikat: X.509 vom ITSG-Trust-Center, auf das IK ausgestellt,
   ~70–100 €, 3 Jahre gültig, Online-Antrag in Tagen
        │
        ▼
Routing über Kostenträgerdatei (quartalsweise von Kassen publiziert:
   Kassen-IK → zuständige Datenannahmestelle → erlaubter Weg)
        │
        ▼
Übertragung an Datenannahmestelle
   HEUTE:       E-Mail-Anhang / DFÜ  (= das, was Dakota macht)
   AB 12/2026:  KIM-Nachricht in der TI (Pflicht für SGB XI)
        │
        ▼
Rückmeldung: Eingangsbestätigung → Fehlerprotokoll (Stufenprüfung
   1 Übertragung → 2 Syntax → 3 Struktur → 4 Fachinhalt) → Zahlung
```

### 1.2 KIM & TI — was man wirklich braucht

| Komponente | Was | Beschaffung | Kosten |
|---|---|---|---|
| **SMC-B Pflege** (Institutionskarte) | Digitaler Institutionsausweis, identifiziert den Pflegedienst in der TI. Zertifikate bis 5 Jahre gültig | Antrag über **eGBR** (elektronisches Gesundheitsberuferegister), Vorlauf 4–8 Wochen | einmalig + laufend, über TI-Pauschalen der Kassen (§106b SGB XI) **weitgehend refinanziert** |
| **TI-Zugang** | Kein eigener Hardware-Konnektor mehr nötig: **TI-Gateway / Highspeed-Konnektor im Rechenzentrum** („TI as a Service"). Alt-Konnektoren laufen 2026 aus | Vertrag mit TIaaS-Anbieter (akquinet, Telekom Healthcare, RISE, arvato) | monatlich, refinanziert |
| **KIM-Adresse** | Sichere E-Mail in der TI; KIM = verbindliches Transportverfahren für SGB-XI-Abrechnung ab 12/2026. Seit 04/2025 produktiv nutzbar | Vertrag mit zugelassenem KIM-Anbieter; **KIM-Clientmodul hat eine dokumentierte SMTP/POP3-Schnittstelle → programmatisch ansteuerbar** | ~10–25 €/Monat je Adresse |
| **eLNW** | Elektronischer Leistungsnachweis, Pflicht ab 10/2027 | eigene Implementierung (digitale Unterschrift mobil) | — |

**Kernerkenntnis:** KIM ist technisch „nur" sicheres SMTP innerhalb der TI. Unser KIM-Adapter spricht das Clientmodul des KIM-Anbieters über Standard-Mailprotokolle an — kein Hexenwerk, aber wir bauen es nativ statt (wie die Konkurrenz) an 20 Jahre Legacy anzuflanschen.

### 1.3 Datenannahmestellen & Testverfahren

Real existieren **ca. 6–10 zentrale Annahmestellen** (nicht 96 Kassen einzeln):

| Annahmestelle | Kassenarten | Priorität für uns |
|---|---|---|
| **AOK-Rechenzentren** (u. a. kubus IT / AOK Systems) | AOKen (AOK Hessen!) | P1 — größter Kostenträger regional |
| **vdek/DAVASO** | Ersatzkassen (TK, Barmer, DAK, KKH, hkk) | P1 |
| **BITMARCK Service GmbH** | viele BKKn, IKKn, Knappschaft (KBS), SVLFG | P1 |
| **Knappschaft (KBS)** | über BITMARCK | P2 |
| weitere (LKK etc.) | Rest | P3 |

**Ablauf pro Annahmestelle (alles kostenlos, keine Zulassung):**
1. **Testverfahren**: Testdateien mit Testbetriebsnummer/IK einreichen → Stufenprüfung 1–4 bestehen (2–6 Wochen, parallelisierbar).
2. **Erprobungsphase**: Echtdaten elektronisch + Papierrechnung parallel (1–3 Abrechnungsmonate).
3. **Echtbetrieb**: IK wird für DTA freigeschaltet.

Die **ITSG-Systemuntersuchung** betrifft NUR Arbeitgeber-Entgeltabrechnung — für §302/§105-Leistungserbringer-Software **nicht erforderlich**. Die ITSG ist für uns nur relevant als Betreiber des **Trust Centers** (X.509-Zertifikate auf unser IK, Online-Antrag).

### 1.4 Desktop-Framework: Tauri (Entscheidung)

| Kriterium | **Tauri v2** ✅ | Electron |
|---|---|---|
| Bundle-Größe | **~3–10 MB** (96 % kleiner) | ~150 MB+ |
| RAM | ~⅓ von Electron | hoch (eigenes Chromium) |
| Kaltstart | ~3× schneller | langsam |
| Sicherheit | Rust-Backend, kleine Angriffsfläche, granulare Permissions | Node im Main-Process |
| Rendering | System-WebView (WebView2/WKWebView) | gebündeltes Chromium |
| Next.js | Static Export od. Sidecar; Remote-URL-Modus für Cloud-First | ebenso |
| Updates | eingebauter Updater, signierte Releases | electron-updater |

**Entscheidung: Tauri.** Für Pflegedienste mit alten Rechnern ist ein 8-MB-Installer, der sofort startet, ein Verkaufsargument gegen die 150-MB-Konkurrenz. Rust-Backend erlaubt später lokale SQLite-Offline-Queue + krypto-nahe Operationen nativ.

---

## 2. Phase 1: MVP — „Eigene Abrechnung funktioniert" (Woche 1–6)

**Ziel / Definition of Done:** Eine echte Alltagsengel-Monatsabrechnung (§45b Entlastungsbetrag 131 €/Monat, Verhinderungspflege, Sachleistung) wird per Klick als PLGA/PLAA generiert, SECON-verschlüsselt und als Testdatei von mindestens einer Datenannahmestelle strukturell akzeptiert.

**Wo:** Alltagsengel-Web-App (`/Users/work/alltagsengel`) als Hauptplattform — dort existieren bereits `app/admin/verordnungen`, `app/admin/kostentraeger`, `app/admin/leistungspreise`, `app/admin/rechnungserstellung`, `app/admin/monatsabschluss`, `app/admin/zahlungskontrolle` und die Tabellen `verordnungen`, `verordnung_leistungen`, `leistungspreise`, `kostentraeger_kontakte`, `care_recipients`.

### 2.1 Neue Module (Dateiplan)

```
lib/abrechnung/
├── edifact/
│   ├── segments.ts          # UNB/UNH/UNT/UNZ + FKT/REC/INV/NAD/ELS/BES-Builder
│   ├── plga.ts              # PLGA-Generator (Gesamtaufstellung §105)
│   ├── plaa.ts              # PLAA-Generator (Einzelfalldaten §105)
│   ├── slga.ts              # SLGA-Generator (§302, Phase für efy care)
│   ├── slla.ts              # SLLA-Generator (§302)
│   ├── auftragsdatei.ts     # Auftragsdatei-Erzeugung (Anlage 2)
│   ├── parser.ts            # Rückweisungs-/Fehlerprotokoll-Parser
│   └── validate.ts          # Stufenprüfung 1–3 lokal nachgebaut (Syntax/Struktur)
├── stammdaten/
│   ├── schluessel.ts        # Anlage-3-Schlüsselverzeichnisse als typisierte Konstanten
│   ├── lk-katalog-hessen.ts # Leistungskomplexe Hessen (erste Fachdatenbasis)
│   └── kostentraegerdatei.ts# Parser + Quartals-Import der Kostenträgerdatei → Routing
├── crypto/
│   └── secon-client.ts      # Client für SECON-Microservice (signieren+verschlüsseln)
├── transport/
│   ├── email-dta.ts         # Bestandsweg: E-Mail-Anhang an Annahmestelle (Strato-SMTP)
│   └── kim.ts               # KIM-Adapter (Phase 4; Interface ab Tag 1 definieren)
├── runs.ts                  # Abrechnungslauf-Orchestrierung (Monat → Dateien → Versand)
└── status.ts                # Statusmaschine: entwurf→validiert→gesendet→angenommen→bezahlt→abgesetzt

services/secon/              # SECON-Microservice (isoliert, Docker)
├── Dockerfile               # JVM + DieTechniker/secon-tool (Apache-2.0)
├── src/Main.java            # HTTP-Wrapper: POST /encrypt, POST /decrypt, POST /verify
└── keys/                    # NUR Referenzen; private Schlüssel im Supabase Vault/KMS

app/admin/abrechnung/
├── page.tsx                 # Dashboard: Läufe, Status, Fehler
├── neu/page.tsx             # „Abrechnung erstellen"-Flow (Monat wählen → Vorschau → Senden)
├── [runId]/page.tsx         # Detailansicht: EDIFACT-Vorschau, Validierungsreport, Protokolle
└── zertifikate/page.tsx     # ITSG-Zertifikat-Verwaltung (Ablaufdatum, Renewal-Reminder)

supabase/migrations/2026XXXX_abrechnung_dta.sql
```

### 2.2 Datenmodell (neue Tabellen)

```sql
abrechnungslaeufe   (id, organisation_id, zeitraum, verfahren '§105'|'§302',
                     status, plga_datei, plaa_datei, auftragsdatei,
                     annahmestelle_ik, transport 'email'|'kim', created_by, …)
abrechnungsfaelle   (id, lauf_id, care_recipient_id, versichertennr, kasse_ik,
                     pflegegrad, betrag_cents, status, fehler_codes jsonb)
abrechnungspositionen (id, fall_id, verordnung_leistung_id → EXISTIERT,
                     leistungskomplex, datum, menge, einzelpreis_cents)
dta_zertifikate     (id, organisation_id, ik, typ 'itsg'|'annahmestelle',
                     cert_pem, gueltig_bis, key_ref /*Vault*/)
annahmestellen      (ik, name, dta_email, kim_adresse, verfahren[], test_status)
kostentraeger_routing (kasse_ik, annahmestelle_ik, verfahren, gueltig_ab)  -- aus Kostenträgerdatei
dta_protokolle      (id, lauf_id, richtung 'out'|'in', typ, raw, parsed jsonb, ts)
```

Alles mit RLS auf `organisation_id` — **von Tag 1 mandantenfähig**, auch wenn Mandant Nr. 1 nur Alltagsengel selbst ist (Nr. 2 = efy care).

### 2.3 Integration in den bestehenden Verordnungs-Workflow

Der existierende Fluss `Verordnung → verordnung_leistungen → Leistungspreise → Rechnungserstellung → Monatsabschluss` bekommt einen neuen Endpunkt: Im **Monatsabschluss** erscheint der Button **„Kassenabrechnung erstellen"**:

**User Story (der Kern des MVP):**
> Admin öffnet Monatsabschluss Juli → klickt „Abrechnung erstellen" → System zieht alle abrechenbaren Leistungen aus `verordnung_leistungen` + `leistungspreise`, gruppiert nach Kasse → Validation Engine prüft (Pflichtfelder, LK-Katalog Hessen, §45b-Budget 131 €, Genehmigungsstatus) → Vorschau mit Ampel je Fall → Admin bestätigt → EDIFACT PLGA+PLAA werden generiert → SECON-Microservice signiert+verschlüsselt → Versand an zuständige Annahmestelle (Routing via Kostenträgerdatei) → Status-Dashboard zeigt „gesendet", später „angenommen/Fehlerprotokoll" → Zahlungskontrolle gleicht Zahlungseingang ab.

### 2.4 Wochenplan Phase 1

| Woche | Deliverable |
|---|---|
| **W1** (03.–09.08.) | Anlagen fixieren (TA1 6.4.0, Anlage 3, Anlage 16, Kostenträgerdateien herunterladen und ins Repo unter `docs/spezifikationen/`), Migration `abrechnung_dta.sql`, `segments.ts` + `plga.ts` Grundgerüst, ITSG-Zertifikat + SMC-B/KIM beantragen (Vorlauf!) |
| **W2** (10.–16.08.) | `plaa.ts` komplett, `schluessel.ts` + `lk-katalog-hessen.ts`, `validate.ts` (lokale Stufenprüfung), Unit-Tests gegen Beispieldateien aus TA1-Anhang |
| **W3** (17.–23.08.) | SECON-Microservice (Docker, secon-tool), `secon-client.ts`, Auftragsdatei, Ende-zu-Ende: Leistungsdaten → verschlüsselte Datei |
| **W4** (24.–30.08.) | `kostentraegerdatei.ts` + Routing, `email-dta.ts` (Strato-SMTP), Admin-UI `app/admin/abrechnung/` |
| **W5** (31.08.–06.09.) | Interner Testlauf mit echten Juli/August-Daten, Fehlerprotokoll-Parser, **Testdateien bei AOK Hessen, vdek/DAVASO, BITMARCK einreichen** |
| **W6** (07.–13.09.) | Korrekturschleifen Stufenprüfung, Status-Dashboard, Doku. **Meilenstein: Testdatei strukturell akzeptiert** |

---

## 3. Phase 2: Desktop-App mit Tauri (Woche 5–8, parallel)

**Ziel:** Dieselbe Next.js-App als installierbare Windows/macOS-Anwendung — für die Zielgruppe „altbackener Pflegedienst", die eine Software „installieren" will und schlechtes Internet hat.

### 3.1 Architektur

```
desktop/                          # neues Verzeichnis im Alltagsengel-Repo
├── src-tauri/
│   ├── tauri.conf.json           # App-Shell lädt die deployte Web-App (Remote-URL-Modus)
│   ├── Cargo.toml
│   └── src/main.rs               # Rust: lokale SQLite-Queue, Datei-Export, Auto-Update
└── package.json
```

- **Remote-URL-Modus:** Tauri-Shell lädt `app.alltagsengel.care` — ein Deploy, alle Plattformen aktuell. Kein separater Build der UI.
- **Offline-Layer (Rust):** Lokale SQLite-Queue für erfasste Leistungsnachweise/Einsätze; Sync bei Verbindung (Konfliktstrategie: Server gewinnt, lokale Kopie als Draft). Abrechnungsversand selbst bleibt bewusst online-only (Krypto + Versand serverseitig).
- **Native Vorteile:** Auto-Updater (signiert), Datei-Export der EDIFACT/PDF-Belege in lokale Ordner (Wirtschaftsprüfer-Anforderung), Druckintegration, Tray-Benachrichtigung „Abrechnung angenommen".
- **Warum nicht Electron:** 150 MB vs. 8 MB, ⅓ RAM, 3× Kaltstart, kleinere Angriffsfläche — auf den 10 Jahre alten Praxis-PCs der Zielgruppe entscheidend (Details Abschnitt 1.4).

### 3.2 Wochenplan

| Woche | Deliverable |
|---|---|
| W5–6 | Tauri-Scaffold, Remote-URL-Shell, Branding beider Marken (Alltagsengel + efy care als zwei Build-Flavors aus einer Config), Windows-Installer (NSIS/MSI) + macOS DMG |
| W7 | Offline-Queue (SQLite) für Leistungserfassung, Auto-Updater, Code-Signing |
| W8 | Beta an 3 interne Nutzer, Download-Seite `alltagsengel.care/software` |

---

## 4. Phase 3: Multi-Mandant SaaS (Woche 7–12)

**Ziel:** Ein fremder Pflegedienst registriert sich selbst und ist in <1 Stunde abrechnungsfähig (Erprobungsverfahren läuft dann automatisiert an).

### 4.1 Mandanten-Architektur (Supabase)

- Neue Tabelle `organisationen` (id, name, ik, adresse, bundesland, tarif, status) — **alle** Abrechnungstabellen tragen ab Phase 1 `organisation_id` (siehe 2.2), d. h. hier ist nur noch Auth-/UI-Arbeit nötig.
- RLS-Policy-Muster: `organisation_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid` — pro Organisation eigener Kontext im JWT, kein Query kann fremde Mandanten sehen.
- Private Schlüssel je Mandant im Supabase Vault, getrennt referenziert (`dta_zertifikate.key_ref`).
- **Eigenes Supabase-Projekt** für die SaaS-Plattform (strikt getrennt von Alltagsengel-Betriebsdaten `nnwyktkqibdjxgimjyuq` und efy care `nsfbwhpjesmathsrqkfi`) — Sozialdaten-Trennung ist Vertriebs- UND Compliance-Argument. Region: EU (Frankfurt).

### 4.2 Onboarding-Flow (der Wachstumsmotor)

```
1. Registrierung (E-Mail, Firmenname)
2. IK eingeben → Prüfziffern-Validierung → Stammdaten
3. Bundesland wählen → richtiger LK-Katalog + Tarifkennzeichen automatisch
4. ITSG-Zertifikat: geführter Antrag ODER bestehendes Zertifikat hochladen
5. Klienten importieren (siehe 4.3)
6. Erster Testlauf → System reicht automatisch Testdateien bei den
   relevanten Annahmestellen ein → Statusanzeige „Erprobung läuft"
7. Freischaltung Echtbetrieb
```

### 4.3 Migrations-Tool „Umzugshelfer" (USP!)

Die Realität der 18.000 Dienste: Excel-Listen, dakota-Ordner, Medifox/Snap-Exporte.

```
lib/migration/
├── excel-import.ts       # XLSX/CSV: Klienten, Kassen, Leistungen — mit
│                         # KI-gestütztem Spalten-Mapping („Vorname" ≈ „first_name")
├── medifox-import.ts     # MD-Ambulant-Exportformate (CSV/GDT)
├── snap-import.ts        # Snap Ambulant (euregon) Exporte
├── dakota-import.ts      # Bestehende Nutzdatendateien/Stammdaten aus dakota-Ordnern
└── mapping-review.tsx    # UI: Vorschau, Konfliktlösung, Dublettenprüfung
```

Marketing-Versprechen: **„Von Excel zu abrechnungsfähig in einem Nachmittag."**

### 4.4 Wochenplan

| Woche | Deliverable |
|---|---|
| W7–8 | `organisationen` + Org-Kontext in Auth, RLS-Audit, separates SaaS-Supabase-Projekt |
| W9–10 | Onboarding-Flow (Schritte 1–4), Excel/CSV-Import mit KI-Mapping |
| W11 | Medifox-/Snap-/dakota-Import, Test-Automation Annahmestellen (Schritt 6) |
| W12 | Landing `abrechnung.alltagsengel.care` (bzw. eigene Produktdomain), Pricing-Seite, 3–5 Pilotdienste aus dem Netzwerk onboarden (kostenlos) |

---

## 5. Phase 4: Kassen-Integration & KIM (Woche 10–17, parallel ab W10)

**Ziel:** Vollautomatischer Kreislauf Einreichung → Rückmeldung → Zahlung, über beide Transportwege (E-Mail-DTA heute, KIM ab 12/2026).

### 5.1 KIM-Adapter

```
lib/abrechnung/transport/kim.ts
services/kim-bridge/           # Serverseitiger Dienst mit Zugriff auf das
                               # KIM-Clientmodul (SMTP/POP3-Schnittstelle)
                               # + TIaaS-Gateway (Highspeed-Konnektor im RZ)
```

- SMC-B Pflege (beantragt in W1 über eGBR) + KIM-Adresse + TI-Gateway-Vertrag → unser Server sendet KIM-Nachrichten programmatisch über die dokumentierte Clientmodul-Schnittstelle (SMTP mit TI-Auth).
- **Dual-Transport-Design:** `transport`-Feld je Lauf; Routing entscheidet pro Annahmestelle. Fällt der KIM-Stichtag, gewinnen wir trotzdem (E-Mail-DTA läuft); kommt er, sind wir die Einzigen ohne Migrationsschmerz.
- Für SaaS-Mandanten: Jeder Dienst hat eigene SMC-B (hat er wegen §360 SGB XI ohnehin seit 07/2025); wir orchestrieren den Versand über seine KIM-Adresse — oder als Verfahrensvariante über unsere Plattform-KIM-Adresse, je nach Kassenvorgabe aus der Erprobung.

### 5.2 Rückmeldungs-Loop & Dashboard

- `dta_protokolle`-Parser für Eingangsbestätigungen + Fehlernachrichten (Fehlercodes aus Anlage 3 → Klartext + Korrekturvorschlag).
- **Absetzungs-Management:** Rückweisung → automatische Fallkorrektur-Vorschläge → Ein-Klick-Wiedereinreichung.
- Zahlungsabgleich: MT940/CAMT-Bankimport gegen `abrechnungslaeufe` → Status „bezahlt"/„teilbezahlt/abgesetzt".
- Dashboard-Kacheln: „Akzeptiert 98,7 %", „Offene Rückweisungen: 2", „Ø Tage bis Zahlung: 11".

### 5.3 Wochenplan

| Woche | Deliverable |
|---|---|
| W10–11 | KIM-Bridge-Dienst, TIaaS-Vertrag aktiv, erste KIM-Testnachricht |
| W12–13 | Fehlerprotokoll-Parser vollständig (alle Codes Anlage 3), Absetzungs-Modul |
| W14–15 | Zahlungsabgleich (CAMT-Import), Echtzeit-Dashboard, Webhooks für API-Kunden |
| W16–17 | **Erprobungsverfahren-Abschluss eigene Abrechnung** → Echtbetrieb vor dem 01.12.2026-Stichtag; Public Launch „Der Dakota-Ausstieg" |

---

## 6. Phase 5: Kassen-Empfehlung (laufend ab W12)

**Es gibt kein offizielles „Kassen-Siegel"** — Empfehlung entsteht über drei Kanäle: (a) die Datenannahmestellen führen intern Listen problemfreier Software, (b) Kassen-Fachreferenten empfehlen informell, was Rückweisungsquoten senkt, (c) Verbände (bpa, ABVP, VDAB) sprechen Empfehlungen an Mitglieder aus.

**Was die Software dafür können muss (unsere Checkliste):**

| Anforderung | Umsetzung bei uns |
|---|---|
| Fehlerquote < 1 % | Lokale Stufenprüfung 1–4 VOR Einreichung (`validate.ts`) — Fehler werden bei uns abgefangen, nicht bei der Kasse |
| Transparente Leistungsnachweise | eLNW: mobile Erfassung + digitale Unterschrift des Klienten (Expo-Modul in beiden Apps vorhanden → erweitern), PDF/Datenexport für Kassenprüfer |
| Plausibilitätsprüfung | Budget-Engine (§45b 131 €/Monat, Sachleistungsbeträge je Pflegegrad, Verhinderungspflege-Jahresbudget), Dubletten-/Überlappungsprüfung, Genehmigungsabgleich |
| Digitale Unterschrift | Signatur-Pad auf Smartphone/Tablet der Pflegekraft, Zeitstempel + Geo-Plausibilität, revisionssicher gespeichert (Supabase Storage, WORM-Bucket) |
| Aktualität | TA-Versions-Monitoring: automatischer Abgleich gkv-datenaustausch.de, versionierte EDIFACT-Templates |

**Der Weg zur Empfehlung (konkret):**
1. Ab Erprobung: bewusst enge, professionelle Kommunikation mit den Fachabteilungen der Annahmestellen (die kennen jede Software an ihren Fehlerquoten!).
2. Nach 3 Monaten Echtbetrieb: Fallstudie „0,x % Rückweisungsquote" → an AOK Hessen / vdek herantragen mit Angebot: kostenloses Kassen-Prüfportal (Kasse sieht Leistungsnachweise strukturiert statt Papierstapel).
3. Verbandsweg: bpa-Landesgruppe Hessen, Rahmenvertrag „Mitgliedervorteil".
4. Ab 10/2027 (eLNW-Pflicht): Wer dann die sauberste eLNW-Strecke hat, wird faktisch empfohlen — das ist unser Zielfoto.

---

## 7. Phase 6: Monetarisierung & Skalierung

### 7.1 Pricing

| Tarif | Zielgruppe | Preis/Monat |
|---|---|---|
| **Intern** | Alltagsengel + efy care | 0 € (Eigenbetrieb, Referenz) |
| **Free** | Einstieg: Klientenverwaltung, Leistungserfassung, 1 Testabrechnung | 0 € — Lead-Magnet |
| **Starter** | bis 50 Klienten, volle Abrechnung §105 | 99 € |
| **Pro** | bis 150 Klienten, + KI-Prüfung, Absetzungs-Mgmt, eLNW mobil, §302 | 199 € |
| **Scale** | >150 / Multi-Standort, FiBu-Export (DATEV), SLA | 349 € |
| **API/Embedded** | Softwarehersteller (Whitelabel-Engine) | ab 0,99 €/Fall oder Volumenlizenz |

Anti-DMRZ-Rechnung im Vertrieb: Dienst mit 100 T€/Monat zahlt bei DMRZ effektiv 400–600 €/Monat (Prozentmodell), beim Abrechnungszentrum 1.000–3.000 €/Monat — bei uns 199 € flat.

### 7.2 Erweiterte Monetarisierung (ab 2027)

1. **Daten-Insights (DSGVO-konform):** ausschließlich anonymisierte, aggregierte Branchen-Benchmarks (Ø Vergütung je LK je Bundesland, Zahlungsdauer je Kasse, Rückweisungsgründe). Rechtsgrundlage: Anonymisierung vor Auswertung, DSFA, keine Einzelfall-Rückführbarkeit. Käufer: Verbände, Berater, Kassen selbst. 
2. **Marketplace:** Fortbildungen (§45a-Schulungen — eigenes Know-how!), Versicherungen, Arbeitsmittel/Pflegeboxen (Alltagsengel verkauft bereits Hygieneboxen → Cross-Selling).
3. **White-Label:** Pflegesoftware-Anbieter, die bis 12/2026 KIM-fähig werden MÜSSEN, lizenzieren unsere EDIFACT/SECON/KIM-Engine als API statt selbst zu bauen — wir werden Infrastruktur („Billing-Rail") statt Konkurrent.
4. **Später:** Vorfinanzierung mit Bankpartner als Upsell (bewusst NICHT im Kernmodell — kein Kapitalbedarf, kein Factoring-Risiko).

### 7.3 Umsatzplan

| Zeitpunkt | Kunden extern | ARR |
|---|---|---|
| 12/2026 (Launch zum KIM-Stichtag) | 5–10 Piloten | ~0 (kostenlos) |
| 06/2027 | 50 | ~110 T€ |
| 12/2027 (1 % Marktanteil) | 180 | ~390 T€ |
| 12/2028 (3 % + 2 API-Partner) | 540+ | 1,4–1,8 Mio. € |

---

## 8. Gesamtarchitektur (für Entwickler, sofort umsetzbar)

```
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTENDS                                                           │
│ • Next.js 16 Web (Alltagsengel) — Admin/Abrechnung/SaaS-Dashboard   │
│ • Tauri Desktop (Win/macOS) — gleiche Web-App + Offline-Queue       │
│ • Expo/RN (efy care + Alltagsengel Mobile) — eLNW-Erfassung,        │
│   digitale Unterschrift, Einsatzdoku                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Supabase Client / REST / Webhooks
┌──────────────────────────────▼──────────────────────────────────────┐
│ SUPABASE (eigenes SaaS-Projekt, EU-Frankfurt)                       │
│ • Postgres + RLS (organisation_id in jeder Tabelle)                 │
│ • Auth (Org-Kontext im JWT app_metadata)                            │
│ • Storage: Belege/eLNW/EDIFACT-Archive (10 J. Aufbewahrung, WORM)   │
│ • Vault/KMS: private Schlüssel je Mandant                           │
│ • Edge Functions: Abrechnungslauf-Trigger, Webhook-Dispatch,        │
│   Kostenträgerdatei-Sync (Cron je Quartal), TA-Version-Monitor      │
└───────┬──────────────────────────────────────────┬──────────────────┘
        │                                          │
┌───────▼───────────────┐              ┌───────────▼─────────────────┐
│ SECON-MICROSERVICE    │              │ KIM-BRIDGE                  │
│ Docker/JVM,           │              │ TIaaS-Gateway (Highspeed-   │
│ DieTechniker/         │              │ Konnektor im RZ) + SMC-B    │
│ secon-tool:           │              │ + KIM-Clientmodul           │
│ CMS/PKCS#7 signieren  │              │ (SMTP/POP3) → Versand +     │
│ + verschlüsseln       │              │ Empfang von Quittungen/     │
│ (AES-256, RSA 4096)   │              │ Fehlerprotokollen           │
└───────┬───────────────┘              └───────────┬─────────────────┘
        │                                          │
        └───────────────┬──────────────────────────┘
                        ▼
        DATENANNAHMESTELLEN (AOK-RZ, vdek/DAVASO, BITMARCK, KBS)
        heute E-Mail-DTA · ab 12/2026 KIM · Rückkanal → Status-Tracker
```

**Pipeline eines Abrechnungslaufs:** `runs.ts` → Fälle sammeln → `validate.ts` (Stufe 1–4 lokal) → `plga.ts`/`plaa.ts` → `auftragsdatei.ts` → `secon-client.ts` → Routing (`kostentraegerdatei.ts`) → Transport (`email-dta.ts` | `kim.ts`) → `status.ts` (Statusmaschine) → Parser Rückmeldungen → Dashboard/Webhook.

---

## 9. Timeline ab HEUTE (31.07.2026)

| Kalender | Woche | Meilenstein |
|---|---|---|
| 31.07. | W0 | **Heute:** Anlagen downloaden, ITSG-Zertifikat-Antrag, SMC-B/eGBR-Antrag, KIM-Anbieter anfragen, Migration + EDIFACT-Grundgerüst committen |
| 03.–16.08. | W1–2 | EDIFACT-Generator PLGA/PLAA fertig + getestet |
| 17.–30.08. | W3–4 | SECON-Service läuft, Routing, Versand-Adapter, Admin-UI |
| 31.08.–13.09. | W5–6 | **Testdateien bei 3 Annahmestellen eingereicht**; Tauri-Desktop-Beta |
| 14.09.–11.10. | W7–10 | Stufenprüfungen bestehen, **Erprobung eigene Abrechnung startet** (September-Abrechnung elektronisch + Papier parallel); Multi-Mandant + Onboarding |
| 12.10.–08.11. | W11–14 | Migrations-Tool, **erste 3–5 externe Pilotdienste live** (kostenlos), KIM-Bridge produktiv |
| 09.11.–29.11. | W15–17 | Absetzungs-Mgmt, Zahlungsabgleich, Erprobung abgeschlossen → **Echtbetrieb** |
| **01.12.2026** | — | **KIM-Pflicht-Stichtag = unser Public Launch** „Der Dakota-Ausstieg" — wir sind zu diesem Zeitpunkt bereits KIM-nativ im Echtbetrieb |
| Q1/2027 | — | 20–50 zahlende Kunden, Fallstudie Rückweisungsquote → **Gespräche AOK Hessen / vdek / bpa: „empfehlt uns"** |
| Q2–Q3/2027 | — | API/Embedded-Partner, weitere Bundesland-Kataloge nach Nachfrage |
| **01.10.2027** | — | eLNW-Pflicht: unsere mobile Unterschriften-Strecke ist seit Monaten live → zweite Migrationswelle einsammeln |

**Erster externer Pflegedienst nutzbar:** Woche 11–12 (Mitte/Ende Oktober 2026, Pilotbetrieb).
**Kassen-Gespräche „empfehlt uns":** Q1/2027, nach 2–3 Monaten Echtbetrieb mit belegbarer Fehlerquote.

---

## 10. Was SOFORT gebaut werden kann (heute/morgen, ohne auf Zertifikate zu warten)

Alles Folgende braucht **null Genehmigung** — die Spezifikationen sind öffentlich, das Testverfahren ist kostenlos, Zertifikate kommen parallel per Antrag:

1. **`supabase/migrations/2026XXXX_abrechnung_dta.sql`** — komplettes Datenmodell aus 2.2 (mandantenfähig ab Tag 1).
2. **`lib/abrechnung/edifact/segments.ts` + `plga.ts` + `plaa.ts`** — Generator gegen TA1 v6.4.0; Testfälle mit den Beispieldateien aus der Technischen Anlage. Reine Fleißarbeit, sofort startbar.
3. **`lib/abrechnung/stammdaten/schluessel.ts` + `lk-katalog-hessen.ts`** — Anlage-3-Schlüssel + Hessen-Leistungskomplexe als typisierte Daten (Quelle: eigene Vergütungsvereinbarung + gkv-datenaustausch.de).
4. **`lib/abrechnung/edifact/validate.ts`** — lokale Stufenprüfung; das spätere Qualitäts-USP.
5. **`services/secon/`** — SECON-Microservice mit secon-tool; mit selbst­signierten Testzertifikaten voll testbar, ITSG-Zertifikat wird später nur eingesteckt.
6. **`lib/abrechnung/stammdaten/kostentraegerdatei.ts`** — Parser für die öffentlich verfügbaren Kostenträgerdateien.
7. **Admin-UI `app/admin/abrechnung/`** — Lauf-Erstellung, Validierungsreport, EDIFACT-Vorschau (menschenlesbar gerendert).
8. **Tauri-Scaffold `desktop/`** — Remote-URL-Shell, beide Marken-Flavors.
9. **Excel/CSV-Import `lib/migration/excel-import.ts`** — nützt sofort auch intern.
10. **Anträge (heute rausschicken):** ITSG-Trust-Center-Zertifikat für IK 460629986 (online, Tage), SMC-B Pflege via eGBR (4–8 Wochen Vorlauf!), KIM-Anbieter + TIaaS-Angebote (akquinet, Telekom, RISE), TI-Finanzierungspauschale §106b SGB XI beantragen.

**Reihenfolge morgen früh:** 1 → 2 → 4 → 5 (parallel: 10). Nach ~2 Wochen existiert eine Datei, die eine Annahmestelle strukturell prüfen kann — ab da ist alles Iteration.

---

## 11. Risiken

| Risiko | Schwere | Gegenmaßnahme |
|---|---|---|
| KIM-Stichtag verschiebt sich | mittel | Dual-Transport: E-Mail-DTA + KIM — wir gewinnen in beiden Welten |
| Erprobung zieht sich bei einzelnen Annahmestellen | mittel | Früh (W5) starten, parallelisieren, mit den 3 größten beginnen (>80 % Abdeckung) |
| Sozialdaten-Vorfall | hoch (Impact) | Eigenes SaaS-Projekt, RLS, Vault/KMS, WORM-Storage, Pentest vor Public Launch, ISO-27001-Roadmap 2027 |
| 16 Bundesland-LK-Kataloge unterschätzt | mittel | Start nur Hessen (Eigenbedarf), Ausbau strikt nach zahlender Nachfrage |
| DMRZ kontert mit API | mittel | First-Mover KIM-nativ + Flat-Pricing + Embedded-Strategie; deren Prozentmodell können sie nicht kannibalisieren |
| Kapazität (Ein-Entwickler-Risiko) | mittel | Spezifikationen öffentlich, Doku-first, KI-gestützte Entwicklung; kritischer Pfad ist W1–6 |

---

## 12. Quellen (Recherche 31.07.2026)

- SECON Open Source: [DieTechniker/secon-tool](https://github.com/DieTechniker/secon-tool) · [bitmarck-service/fs2-secon](https://github.com/bitmarck-service/fs2-secon)
- §105-Spezifikation: [Technische Anlage 1 (aktuell)](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/pflege/technische_anlagen_aktuell_2/TA1_6.2.0_20240403_oAe.pdf) · [GKV-Datenaustausch Pflege](https://www.gkv-datenaustausch.de/leistungserbringer/pflege/pflege.jsp) · [Info-Broschüre TP6 04/2026](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/pflege/20260424_Broschuere_TP6.pdf) · [KBS §105](https://www.kbs.de/DE/Services/FuerLeistungserbringer/Datenaustausch/105/datenaustausch_node)
- KIM/TI-Pflicht: [medisign: Ab 2026 vollelektronisch via KIM](https://www.medisign.de/blog/ab-2026-pflegeleistungen-vollelektronisch-via-kim-abrechnen/) · [Parto: KIM-Pflicht 12/2026](https://www.goparto.com/artikel/kim-pflege-abrechnung-telematikinfrastruktur-2026) · [AOK: KIM](https://www.aok.de/gp/e-health/kim) · [gematik Leitfaden Pflege](https://www.gematik.de/media/gematik/Medien/Sektoren/Dokumente/gematik_Leitfaden-Checkliste_Pflegeeinrichtungen_RGB.pdf)
- TI-Ausstattung: [akquinet: TI-Gateway FAQ](https://ehealthblog.akquinet.de/ehealth-blog/blogbeitrag-details/faq-ti-anschluss-fuer-pflegeeinrichtungen-mit-ti-gateway) · [LfP Bayern: TI-Anbindung](https://www.lfp.bayern.de/pflege-digital/anbindung-an-die-ti/) · [telekonnekt: SMC-B](https://www.telekonnekt.de/artikel/smc-b-elektronischer-praxisausweis)
- ITSG: [Trust Center Zertifikat beantragen](https://www.itsg.de/produkte/trust-center/zertifikat-beantragen/) · [Öffentliche Zertifikate/Verzeichnisse](https://www.itsg.de/produkte/trust-center/oeffentliche-zertifikate-und-verzeichnisse/) · [GKV TrustCenter](https://www.gkv-datenaustausch.de/trustcenter/trustcenter.jsp)
- Desktop: [Tauri vs Electron 2026 (tech-insider)](https://tech-insider.org/tauri-vs-electron-2026/) · [PkgPulse: Electron vs Tauri 2026](https://www.pkgpulse.com/guides/electron-vs-tauri-2026) · [buildmvpfast: Tauri v2 vs Electron](https://www.buildmvpfast.com/blog/tauri-v2-vs-electron-desktop-apps-2026)
- Markt: [Medifox DAN Test/Preise](https://www.ki-syndikat.de/tools/medifox-dan/) · [Handelsblatt: Medifox Dan](https://www.handelsblatt.com/technik/thespark/gesundheitsbranche-pflegesoftwareanbieter-medifox-dan-steht-zum-verkauf/28220880.html) · [Pflegesoftware-Vergleich 2026](https://privates-pflegeinstitut.de/2026/04/28/pflegesoftware-im-vergleich-2026/)
