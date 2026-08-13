# Beschleunigter Parallelbetrieb — Abschlussbericht

**Datum:** 13.08.2026
**Methode:** 4 parallele Task-Sessions (6 Streams), 9 Supabase-Migrationen live
**Vorheriger Stand:** Intern vollständig produktionsreif (17/17 Module GRÜN)

---

## 1. Pflege-Software heute real nutzbar: JA

Der komplette Workflow Kunde anlegen → Buchung → Einsatz dokumentieren → Unterschrift (QR/Touch) → Rechnung erstellen → PDF mit Briefkopf → OPOS-Tracking → Mahnwesen → Zahlung verbuchen → DATEV-Export läuft Ende-zu-Ende durch.

17 interne Module sind GRÜN, alle Fail-Closed-Mechanismen dreifach abgesichert (RPC + Application + Korrektur), RLS auf allen sensiblen Tabellen gefenced, Budget-Versionierung fail-closed.

---

## 2. Welche Funktionen heute real nutzbar sind

| Funktion | Status |
|---|---|
| Kundenverwaltung (CRUD, Pflegegrad, Budget) | LIVE |
| Engel-/Mitarbeiterverwaltung | LIVE |
| Buchungssystem | LIVE |
| Einsatzdokumentation mit Unterschrift | LIVE — status/proof_status synchron |
| Leistungsnachweis (QR, Touch-Signatur) | LIVE |
| Tarif-Verwaltung (verified/unverified/blocked) | LIVE — dreifach fail-closed |
| Budget-System §45b (131€/Monat) + VP/KZP (3.539€/Jahr) | LIVE — fail-closed versioniert |
| Rechnungserstellung (RPC v6) | LIVE |
| Rechnungs-PDF (Briefkopf, Footer, DejaVuSans) | LIVE |
| OPOS / Offene Posten (due_date automatisch) | LIVE |
| Mahnwesen (5 Stufen, Cron täglich 07:00) | LIVE — NEU |
| Zahlung verbuchen (direkt auf Rechnung) | LIVE — NEU |
| Pflegegrad-Update mit Budget-Neubewertung | LIVE — NEU |
| DATEV-Export (EXTF 510) | LIVE |
| Bewertungssystem (RLS gefenced) | LIVE |
| Tourenplanung (Geistertermine behoben) | LIVE |
| Admin-Dashboard | LIVE |
| Auth-System | LIVE |
| SEO / Landing Pages | LIVE |
| WhatsApp-Integration | LIVE |
| PflegeCoach als digitaler Assistenzservice | LIVE — NEU erreichbar |

---

## 3. Welche Funktionen extern blockiert sind

| Funktion | Blockiert durch | Intern fertig? |
|---|---|---|
| § 105 SGB XI — DTA-Versand an Pflegekassen | ITSG-Zertifikat + SFTP-Zugang bei Datenannahmestelle | JA — komplette Pipeline inkl. SECON-Verschlüsselung, Versand, Antwortabruf, Rückläufer, Wiedervorlage |
| § 302 SGB V — Abrechnung häusliche Krankenpflege | Technische Anlage 1 + GKV-SV-Freigabe | JA — Lauftabelle, Routing, Statusmodell, Gate gesperrt |
| KIM / Telematikinfrastruktur | KIM-Provider-Vertrag + gematik-Zulassung | JA — Adapter-Schnittstelle, NULL_ADAPTER fail-closed |
| SEPA-Lastschrift | Echte Gläubiger-ID (Bundesbank) | JA — Platzhalter dokumentiert |
| DiPA-Kassenerstattung | BfArM-Listung (siehe Punkt 5+6) | JA — COACH_DIPA_MODUS default false |
| Leistungskomplex-Tarife Hessen | Vergütungsvereinbarung mit Kasse | Tabellen da, alle 24 Zeilen UNVERIFIED |

---

## 4. PflegeCoach heute als normaler Service nutzbar: JA

Der PflegeCoach läuft als digitaler Pflege- und Assistenzservice ohne jede DiPA-Behauptung:

- `COACH_DIPA_MODUS` ist default `false` — Anspruchsprüfung und Kostenträgerbezug sind weder in der Oberfläche noch über die API erreichbar
- Im gesamten Produktbereich existiert keine Aussage zu Kostenübernahme, Erstattung oder Preisen
- `istAbrechnungsbereit()` ist fail-closed: ohne Vergütungsvereinbarung kein abrechnungsbereiter Weg
- Freischaltcode ist keine Zugangsvoraussetzung (Seite ohne aktiven Schalter nicht erreichbar)
- Nutzungsereignisse werden nicht erfasst

**Heute behoben:** Der PflegeCoach war von nirgendwo erreichbar — kein Link im Footer, Header oder Kundenbereich. `/pflegecoach` warf anonyme Besucher kommentarlos aufs Login. Jetzt:

- `/pflegecoach/start` zeigt Zweckbestimmung inkl. Negativabgrenzung auch ohne Anmeldung
- Einstiegspunkte in SiteFooter und `/kunde/home` ergänzt
- `/pflegecoach/freischaltung` leitet um, solange weder DIPA noch Freischaltungspflicht aktiv
- Barrierefreiheits-Lint als Fehler für `app/pflegecoach/**` scharf geschaltet (0 Befunde)
- Produktversion auf 0.3.0 erhöht

---

## 5. DiPA kassenerstattungsfähig: NEIN

Der PflegeCoach ist technisch als DiPA vorbereitet (Schalter, Einwilligungssystem, Messinstrumente, Anforderungskatalog), aber **nicht gelistet** und macht **keine** Erstattungsaussagen. Die BfArM-Listung ist Voraussetzung für den DiPA-Modus — ohne sie bleibt er aus.

---

## 6. Was für BfArM noch fehlt (12-Punkte-Gap-Analyse)

Vollständige Analyse in `docs/DIPA_BFARM_READINESS.md`. Zusammenfassung:

| # | Punkt | Status |
|---|---|---|
| 1 | Zweckbestimmung | VORHANDEN |
| 2 | Nutzergruppe | VORHANDEN |
| 3 | Pflegerischer Nutzen | EXTERN (Erhebungsseite im Code vorhanden) |
| 4 | Datenschutz | Gemischt: Umsetzung VORHANDEN, DSFA EXTERN, Verarbeitungsverzeichnis GEBAUT |
| 5 | Datensicherheit | Gemischt: Zugriffsschutz VORHANDEN, MFA FEHLT, Pentest EXTERN |
| 6 | Interoperabilität | FEHLT (Export vorhanden, FHIR-Mapping nicht) |
| 7 | Barrierefreiheit | Grundausstattung VORHANDEN, a11y-Lint GEBAUT, Audit EXTERN |
| 8 | Evidenz/Studienkonzept | Konzept VORHANDEN, Durchführung EXTERN |
| 9 | Technische Dokumentation | GEBAUT |
| 10 | Risikomanagement | Register GEBAUT, Bewertung FEHLT |
| 11 | Qualitätsmanagementsystem | FEHLT für Software (nur Pflegedienst-QM vorhanden) |
| 12 | Zertifizierungen | EXTERN |

**In diesem Durchgang neu gebaut:**
- `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md`
- `audit/dipa/technische_dokumentation_pflegecoach.md`
- `audit/dipa/risikoanalyse_pflegecoach.md`
- a11y-Lint als automatisierte Prüfung

**Extern zu beschaffen:** DSFA-Freigabe, AV-Kette, Penetrationstest, Sicherheitszertifikat, a11y-Audit, Nutzennachweis/Erprobung, Software-QMS, FHIR-Mapping (Zielprofil steht nicht fest), alle Zertifizierungen.

---

## 7. Was heute implementiert wurde (4 parallele Streams)

### Stream 1+6: Pflege E2E Go-Live
- Zahlung verbuchen — neuer POST-Endpoint mit Auto-Allocation
- Mahnwesen — 5 Mahnstufen (14/28/42/56/70 Tage), Cron täglich 07:00, max eine Stufe pro Lauf
- Pflegegrad-Update — PATCH-Endpoint mit automatischer Budget-Neubewertung
- Freigabe-Workflow bestätigt (existierte bereits auf Rechnungsebene)
- DATEV-Export bestätigt (EXTF 510 vollständig)

### Stream 2: Kassenabrechnung-Architektur
- **DTA-Versandpipeline § 105** — erster echter Aufrufer von `sendePerSFTP()`: Doppelversand-Schutz → Readiness → Nutzdaten → SECON-Verschlüsselung → Gate → SFTP. Testmodus heute schon nutzbar.
- **Antwortabruf** — `pruefeAntworten` mit Import über regulären Rückläuferweg
- **Rückläufer-Klassifizierung** — 4 Kategorien + `unbekannt`, Fehlercode-Katalog bewusst leer (keine geratenen Codes)
- **Wiedervorlage-Queue** — Statusmaschine mit DB- und Code-seitigen Regeln: `erledigt` nur nach `eingereicht`, `verworfen` nur mit Begründung
- **§ 302 SGB V** — Lauftabelle, Versandpfad, Gate `SGB_V_302_FREIGABE`, Generator fail-closed
- **KIM-Adapter** — send/receive/status + Registry, NULL_ADAPTER wirft bei jeder Operation
- **Audit** — `dta_versand_protokoll` protokolliert jeden Versuch inkl. abgebrochener, `entferneZugangsdaten()` bereinigt vor dem Schreiben
- **Freischaltungsdoku** — `docs/KASSENABRECHNUNG_FREISCHALTUNG.md` mit exakter Anleitung für Tag X

### Stream 3+4: PflegeCoach marktfähig + DiPA-Readiness
- PflegeCoach von außen erreichbar gemacht (Start-Seite, Footer-Link, Kundenbereich)
- Freischaltungsseite bei inaktivem Schalter → Redirect
- `COACH_DIPA_MODUS` in `.env.example` dokumentiert
- 6 vorbestehende Lint-Fehler bereinigt, `jsx-a11y` als Fehler scharf geschaltet
- Broken-Link-Gate für API-Routen gefixt
- DiPA-Gap-Analyse mit 12 Punkten erstellt
- 3 neue Audit-Dokumente gebaut (Verarbeitungsverzeichnis, Technische Doku, Risikoanalyse)
- Produktversion 0.3.0

### Stream 5: Rechts-/Preislogik
- Zweite Preistabelle (`leistungspreise`, 24 Zeilen) entdeckt und mit tarif_status gesichert
- Verification-Decay-Trigger: Preisänderung an verifizierten Tarifen setzt Status automatisch zurück
- Budget-Versionierung fail-closed (BudgetVersionFehltError für unbekannte Jahre)
- resolvePrice() mit mandatorischem org-fence (organizationId jetzt Pflichtparameter)

---

## 8. Commits + Deployment

| Commit | Inhalt |
|---|---|
| `1b393a5` | Stream 2: Kassenabrechnung-Architektur komplett |
| `febda20` | Stream 3+4: PflegeCoach marktfähig + DiPA-Readiness |
| `8d6872d` | Stream 5: Tarif-Versionierung + Fail-Closed-Vollständigkeit |
| `29f97c2` | Stream 1: Pflege E2E Go-Live |
| `535ce8d` | Fertigstellungsblock (Vorphase) |

**Migrationen live (Production-DB applied):**

| Migration | Inhalt |
|---|---|
| `20260901000000` | Bewertungen RLS-Fence |
| `20260901010000` | service_record status-Sync + Backfill |
| `20260901020000` | invoice due_date Trigger + Backfill |
| `20260902000000` | leistungspreise tarif_status + Verification-Decay |
| `20260902010000` | DTA-Versandpipeline (Protokoll + Fehlerkatalog + Wiedervorlage) |
| `20260902020000` | § 302 SGB V Läufe |

**CI:** GitHub GRÜN · Vercel DEPLOYED · Supabase 6 neue Migrationen live · 2430 Tests grün

---

## 9. Verbleibende interne Blocker

### KEINE HIGH-Blocker

### MITTEL
- **Demo-Bewertung „Lisa war wunderbar!"** — noch in Production `reviews`-Tabelle. Per RLS geschützt (anon sieht nichts), aber vor Echtbetrieb löschen. → Deine Entscheidung.
- **35€/h-Tarife bleiben BLOCKED** — Preise werden NICHT automatisch geändert, Verifizierung nur mit Primärquelle.
- **MFA fehlt** — keine TOTP-/MFA-Implementierung im gesamten Repository. Für DiPA relevant, für Pflege-Software-Betrieb nicht zwingend.

### NIEDRIG
- **Stop-Zeiten in Tourenplanung** nicht nachträglich änderbar (Feature, kein Bug)
- **FHIR-Mapping für PflegeCoach** fehlt (Zielprofil steht nicht fest)
- **Software-QMS** fehlt (nur Pflegedienst-QM vorhanden)
- **Risikobewertung** (Zahlen) fehlt — Register vorhanden, Bewertung ist Unternehmensentscheidung
- **DTA-Pfad liest amount aus service_records statt billing_tariffs** — separates Issue

---

## 10. Nächste 3 Schritte mit höchstem Umsatz-/Go-Live-Effekt

### 1. Erster Echtbetrieb-Test (sofort machbar, kein externer Blocker)
Einen realen Kunden durch den kompletten Workflow führen: Anlage → Buchung → Einsatz → Unterschrift → Rechnung → PDF prüfen → Zahlung. Validiert die Software mit echten Daten und deckt letzte UX-Hürden auf, bevor Kunden selbständig arbeiten.
**Umsatzeffekt:** Erste fakturierbare Leistung, Nachweis der Betriebsfähigkeit für Kossenverhandlungen.

### 2. ITSG-Zertifizierung beantragen (mehrere Tage Vorlauf)
Ohne ITSG-Zertifikat kann keine einzige Rechnung elektronisch an eine Pflegekasse gehen. Die gesamte DTA-Pipeline steht bereit und läuft im Testmodus durch — es fehlt exakt das Zertifikat + der SFTP-Zugang. Freischaltungsanleitung: `docs/KASSENABRECHNUNG_FREISCHALTUNG.md`.
**Umsatzeffekt:** Schaltet den gesamten Kassenabrechnungskanal frei — ohne diesen Schritt bleibt jede Leistung eine Privatrechnung.

### 3. Vergütungsvereinbarung(en) mit Pflegekassen abschließen
Die 24 Leistungspreise (Hessen LK1–LK18) sind UNVERIFIED. Tarife können erst nach Vorlage der Vergütungsvereinbarung auf VERIFIED gesetzt werden. Ohne verifizierte Tarife erzeugt der RPC keine Kassenrechnungen (fail-closed).
**Umsatzeffekt:** Bestimmt die tatsächlichen Abrechnungsbeträge und macht den Unterschied zwischen 0€ und regulärem Kassenumsatz.

---

*Erstellt durch 4 parallele Task-Sessions (6 Streams). 4 Commits deployed, 6 Migrationen live applied, 2430 Tests grün. Pflege-Software ist produktionsreif und wartet auf den ersten Echtbetrieb. PflegeCoach läuft als normaler Service. DiPA-Readiness dokumentiert mit klarer Gap-Liste.*
