# SECON-Architekturentscheidung: zentrale Übermittlung über Alltagsengel

**Status:** entschieden · **Datum:** 2026-08-01 · **Betrifft:** Alltagsengel (Next.js) + efy care (Expo/React Native)

## Entscheidung

**efy care baut kein eigenes SECON (Security Container, Anlage 16 der Technischen
Anlagen zum GKV-Datenaustausch) für die Pflegekassen-Übermittlung.** Jede efy-care-
Organisation, die EDIFACT-Abrechnungsdateien an eine Datenannahmestelle übermitteln
will, tut dies über die zentrale SECON-Implementierung im Alltagsengel-Backend
(`lib/abrechnung/secon.ts`). efy care selbst erzeugt nur die unverschlüsselte
Nutzdatendatei (PLGA/PLAA) und die Auftragsdatei — das war bereits so vorgesehen
(s. Code-Kommentar in `efy-care/app/src/features/abrechnung/edifact.ts:16-20`) und
wird hiermit als verbindliche Architekturentscheidung dokumentiert.

## Begründung

1. **node-forge ist Node.js-spezifisch, nicht React-Native-kompatibel.**
   Die bestehende SECON-Implementierung (`lib/abrechnung/secon.ts`) baut auf
   `node-forge` (CMS SignedData/EnvelopedData, RSASSA-PSS, RSAES-OAEP,
   AES-256-CBC) und Node-Core-`zlib` (CMS CompressedData). Beide setzen die
   Node.js-Laufzeit voraus (Buffer-Internals, native Crypto-Bindings über
   `node-forge`s Fallback-Implementierungen, `zlib`-Bindings). React Native
   (Hermes/JSC) stellt weder `node:zlib` noch die von `node-forge` benötigte
   Node-Buffer-Semantik bereit — ein Port auf das Handy wäre kein Config-
   Problem, sondern eine komplette Neuimplementierung der CMS-Schicht mit
   RN-tauglichen Krypto-Primitiven (z. B. WebCrypto/expo-crypto), inklusive
   eigener ASN.1-DER-Kodierung. Das Verfahren ist zudem zertifizierungspflichtig
   (Erstattungstest mit der Datenannahmestelle) — zwei unabhängige
   Implementierungen zu pflegen und beide zu zertifizieren wäre doppelter
   Aufwand für ein identisches Protokoll.

2. **X.509-Zertifikate sind IK-gebunden, nicht Client-gebunden.**
   Das ITSG-Trust-Center-Zertifikat trägt die IK-Nummer im Subject
   (`OU=IK<Nummer>`) und gehört der Organisation (dem Leistungserbringer),
   nicht einer bestimmten App. Ob eine Organisation über die Alltagsengel-
   Weboberfläche oder die efy-care-App arbeitet, ändert nichts daran, unter
   welcher IK sie gegenüber der Datenannahmestelle auftritt — die
   Verschlüsselung/Signatur ist deshalb konzeptionell ein Server-seitiger
   Dienst je Organisation, kein Client-Feature.

3. **Private Schlüssel gehören nicht auf ein Mobilgerät.**
   Das PKCS#12-Zertifikat (privater Schlüssel + Zertifikatskette) liegt
   verschlüsselt in Supabase Storage und wird ausschließlich serverseitig
   entschlüsselt (`lib/abrechnung/zertifikate.ts`). Es auf Mobilgeräte zu
   verteilen vergrößert die Angriffsfläche (Gerät verloren/gestohlen,
   Backup-Extraktion) ohne funktionalen Gegenwert — die Übermittlung an die
   Datenannahmestelle passiert ohnehin nicht in Echtzeit vom Handy aus.

4. **Ein SFTP-Client auf dem Handy ist kein sinnvoller zweiter Übertragungsweg.**
   Der tatsächliche Versand an die Datenannahmestelle läuft über SFTP
   (`datenannahmestellen`-Tabelle: `sftp_host`/`sftp_port`/`sftp_key_url`).
   SFTP-Zugangsdaten je Kostenträger auf Mobilgeräten zu spiegeln wäre ein
   weiterer Satz Geheimnisse außerhalb der Server-Umgebung, für einen
   Übertragungsweg, der ohnehin zentral gebündelt werden soll (eine
   Nutzdatendatei pro Kassenart/Monat, nicht eine pro Organisation und Gerät).

## Zielarchitektur

```
efy-care-Organisation                 Alltagsengel-Backend                 Kasse
──────────────────────                ──────────────────────              ──────
Einsätze erfassen
Leistungsnachweis prüfen
        │
        ▼
generateEDIFACT() (Client)   ──POST──►  /api/… (Organisation authentifiziert
  → PLGA/PLAA, unverschlüsselt            über organization_id + Rolle)
                                                │
                                                ▼
                                        lib/abrechnung/secon.ts
                                        (Signieren → Komprimieren →
                                         Verschlüsseln, Zertifikat der
                                         jeweiligen Organisation aus
                                         abrechnung_zertifikate)
                                                │
                                                ▼
                                        SFTP-Übermittlung an die
                                        Datenannahmestelle             ──►  Kasse
                                        (datenannahmestellen-Tabelle)
```

Die efy-care-App erzeugt weiterhin lokal die EDIFACT-Rohdaten (das ist reine
Textformatierung, kein Kryptografie-Bedarf) und schickt sie an einen noch zu
bauenden Alltagsengel-API-Endpunkt zur Verschlüsselung + Übermittlung. Dieser
Endpunkt existiert heute noch nicht (efy care hat aktuell keinen SECON-Aufruf,
s. Code-Suche — kein Treffer für „secon" in `efy-care/app/src/`) — das ist der
konkrete nächste Schritt, sobald efy care in den Echtbetrieb mit
Kassenübermittlung geht. Bis dahin bleibt der EDIFACT-Export in efy care ein
manueller Download (Datei-Weitergabe an die Alltagsengel-Buchhaltung), analog
zum heutigen Stand vor der SECON-Automatisierung.

## Konsequenzen für zukünftige Arbeit

- **Kein `node-forge`/`zlib`-Port nach React Native.** Wird SECON-Funktionalität
  in efy care gebraucht, geht der Aufruf über einen Alltagsengel-API-Endpunkt,
  nicht über eine lokale Neuimplementierung.
- **Ein API-Endpunkt, mehrere Organisationen.** Der geplante Übermittlungs-
  Endpunkt muss `organization_id`-bewusst sein (welches Zertifikat, welche
  Datenannahmestellen-Zugangsdaten) — Vorarbeit dazu ist bereits durch P0-2/P0-5
  gelegt (`organization_id` auf allen relevanten Tabellen, `getOrgIK()`/
  `is_org_member()`).
- **Zertifikatsverwaltung bleibt zentral.** Neue Organisationen laden ihr
  ITSG-Zertifikat weiterhin über die Alltagsengel-Admin-Oberfläche
  (`app/admin/abrechnung/einstellungen`) hoch, nicht über die efy-care-App.
