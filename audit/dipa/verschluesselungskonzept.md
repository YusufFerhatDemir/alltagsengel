# Verschlüsselungskonzept — „Digitaler PflegeCoach"

**Stand:** 2026-08-12 · **Block:** 15b
**Geltungsbereich:** alle Daten des DiPA-Produkts (`coach_*`), nicht der Betriebsteil.

> **Ehrlichkeitsgebot dieses Dokuments:** Es unterscheidet strikt zwischen
> **umgesetzt**, **konfigurationsabhängig** und **geplant**. Ein Konzept, das den
> Ist-Zustand schönt, ist im Zulassungsverfahren wertlos — und schlimmer als keines.
> Alle Angaben zu Plattformleistungen (Hosting, Datenbank) sind vor einer Antragstellung
> gegen die dann gültigen Auftragsverarbeitungsverträge und technischen Zusicherungen zu
> **verifizieren**; sie sind hier als Anforderung formuliert, nicht als Nachweis.

---

## 1. Schutzziel und Bedrohungsmodell

Die Daten sind Gesundheitsdaten nach Art. 9 DSGVO. Zu schützen ist gegen:

| Bedrohung | Primäre Maßnahme |
|---|---|
| Mitlesen auf dem Transportweg | TLS, HSTS |
| Zugriff durch andere Nutzer | RLS (nutzer-eigen), Grants |
| Zugriff durch eigene Administratoren | Produkttrennung: keine Admin-Policies auf `coach_*` |
| Entwendung von Datenbank-Backups | Verschlüsselung im Ruhezustand beim Betreiber |
| Re-Identifikation aus Auswertungsdaten | Pseudonymisierung mit separatem Schlüssel |
| Kompromittierte Zugangsdaten | offen — MFA fehlt (GAP-MFA) |

## 2. Transport (in transit)

| Punkt | Zustand |
|---|---|
| Browser ↔ Anwendung | **umgesetzt** — HTTPS/TLS über die Hosting-Plattform, HTTP wird umgeleitet |
| Anwendung ↔ Datenbank | **umgesetzt** — TLS-gesicherte Verbindung zum Datenbankdienst |
| HSTS, sichere Cookie-Attribute | **zu verifizieren** — plattform-/konfigurationsabhängig, vor Antrag im Original prüfen |

## 3. Ruhezustand (at rest)

| Punkt | Zustand |
|---|---|
| Datenbank und Backups | **konfigurationsabhängig** — Verschlüsselung durch den Datenbankbetreiber; Zusicherung ist im AVV nachzuweisen (offen, siehe AK-DS-04) |
| Dateiablage | für den PflegeCoach derzeit **nicht genutzt** — das Produkt speichert keine Dateien |
| Client-Speicher (Browser) | nur Darstellungseinstellungen (Schriftgrad, Kontrast) in `localStorage`; **keine** Gesundheitsdaten |

## 4. Pseudonymisierung als eigenständige Schutzschicht

Für die Nachweisdaten (`coach_nutzungsereignisse`) und die Verbindung zur Betriebsseite
wird nicht der Personenbezug gespeichert, sondern ein **HMAC-SHA256** über die
auth-User-ID mit einem 32-Byte-Zufallsschlüssel.

* Der Schlüssel liegt in `coach_pseudonym_key` — **ohne Policy und ohne Grants**. Weder
  `anon` noch `authenticated` kommen heran; nur die `SECURITY DEFINER`-Funktion.
* `coach_pseudonym(uuid)` (beliebige Person) ist ausschließlich dem Systemkontext
  zugänglich. Nutzer erhalten nur `coach_mein_pseudonym()` — sonst könnte man das
  Pseudonym eines anderen berechnen und dessen Nachweise lesen.
* **Löschen des Schlüssels anonymisiert alle Nachweisdaten unwiderruflich.** Das ist ein
  bewusstes Werkzeug des Löschkonzepts (siehe `loeschkonzept.md`).

Analog werden Freischaltcodes nie im Klartext gespeichert, sondern als SHA-256 über
(normalisierter Code + serverseitiger Pfeffer `COACH_CODE_PEPPER`).

## 5. „Ende-zu-Ende-Verschlüsselung" — Bewertung und Entscheidung

Echte Ende-zu-Ende-Verschlüsselung bedeutet: Der Server kann die Inhalte nicht lesen,
weil der Schlüssel nur beim Nutzer liegt. Für den PflegeCoach ist das **derzeit nicht
umgesetzt**, und dieses Dokument behauptet nichts anderes.

**Was dagegen spricht (bewusste Produktentscheidung):**

| Funktion | Bricht bei echter E2E |
|---|---|
| Freigabe an Angehörige/Pflegedienst (`coach_shares`) | Schlüsselverteilung an Dritte nötig |
| Serverseitige Auswertung (Verlauf, Berichte, Empfehlungen) | Server sieht nur Chiffrat |
| Passwort-Reset ohne Datenverlust | Schlüsselverlust = Totalverlust der Daten |
| Barrierefreier Zugang von mehreren Geräten | Schlüsselsynchronisation für die Zielgruppe kaum zumutbar |

Die Zielgruppe sind teils hochbetagte Menschen. Ein Verfahren, bei dem ein vergessenes
Passwort die gesamte Pflegedokumentation vernichtet, wäre für diese Gruppe ein größerer
realer Schaden als das Risiko, gegen das es schützt.

**Stattdessen umgesetzt (Verteidigung in der Tiefe):**

1. RLS als einzige Zugriffswahrheit — kein Umgehen über Anwendungslogik.
2. Keine Admin-Policies auf `coach_*` — der Betreiber kann die Daten fachlich nicht
   einsehen, auch nicht versehentlich über ein Admin-Werkzeug.
3. `anon` auf Grant-Ebene vollständig entzogen.
4. Pseudonymisierung mit separatem, nicht lesbarem Schlüssel für alle Auswertungsdaten.
5. Append-only-Audit ohne Datenwerte.

**Offen und zu entscheiden (nicht erfunden, sondern benannt):**

* Ob eine Zulassung E2E-Verschlüsselung ausdrücklich fordert, ist gegen den maßgeblichen
  Anforderungskatalog zu prüfen (AK-SEC-01, GAP-TR03161).
* Falls gefordert: Ein feldweiser Ansatz für Freitextfelder (Notizen) mit
  nutzergebundenem Schlüssel wäre der kleinste Schnitt — die Freigabefunktion müsste dann
  auf strukturierte Felder beschränkt werden. Aufwand und Nutzenverlust sind vor einer
  Entscheidung gegenüberzustellen.

## 6. Schlüsselverwaltung

| Schlüssel | Ablage | Rotation |
|---|---|---|
| Pseudonym-HMAC (`coach_pseudonym_key`) | Datenbank, ohne Lesezugriff | Rotation macht bestehende Pseudonyme ungültig — nur bewusst und dokumentiert; anschließend sind Alt-Nachweise anonym |
| Code-Pfeffer (`COACH_CODE_PEPPER`) | Umgebungsvariable | Änderung entwertet ausgegebene Codes — nur mit Ankündigung |
| Datenbank-/Transportschlüssel | beim Betreiber | nach dessen Verfahren, **zu verifizieren** |

## 7. Offene Punkte

| ID | Punkt |
|---|---|
| GAP-MFA | Kein zweiter Faktor — die stärkste Verschlüsselung hilft nicht gegen gestohlene Zugangsdaten |
| GAP-TR03161 | Kein Zertifikat, keine Prüfstelle beauftragt |
| AK-DS-04 | AVV-Kette produktbezogen nicht dokumentiert |
| GAP-TRENNUNG | Gemeinsame Infrastruktur mit dem Betriebsteil |
