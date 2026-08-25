# Audit: Signierte Storage-URLs

Stand: 25.08.2026 · Auslöser: „Signed URLs für Rechnungs-PDFs sind teilweise 30 Tage gültig."

## Warum die Laufzeit die einzige Grenze ist

Eine signierte Supabase-Storage-URL ist ein **Inhabertoken**. Sie trägt ihre
Berechtigung selbst, wird am Storage-Dienst geprüft und läuft dabei an RLS
vorbei. Sie kennt deshalb weder

- die **Rolle** des Nutzers (Rollenwechsel wirkt nicht),
- den **Kontostatus** (Deaktivierung/Löschung wirkt nicht),
- noch die **Organisation** (`org_fence` greift nicht).

Wer den Link hat, kommt an die Datei — bis sie abläuft. Es gibt keinen Widerruf.
Deshalb ist jede Frage nach „wer darf das sehen?" bei signierten URLs immer eine
Frage nach der Laufzeit.

Zusätzlich verschärfend: wo die URL in der Datenbank abgelegt wird, steht sie in
jedem Backup und jedem Datenbank-Export.

## Bestand

| # | Stelle | Bucket | Zweck | Laufzeit | Wer bekommt die URL | Gespeichert? |
|---|--------|--------|-------|----------|---------------------|--------------|
| 1 | `lib/pdf/rechnung-paket.ts` | `service-proofs` | Rechnungs-/Belegpaket-PDF nach Erzeugung | **10 Min** (vorher 30 Tage) | Ops-Admin mit `abrechnung.schreiben`, unmittelbar nach Erzeugung | ja → `invoice_packages.pdf_url` |
| 2 | `app/api/rechnungen/[id]/pdf/route.ts` | `service-proofs` | Download durch Kunde/Admin | **10 Min** | eigener Kunde (`clients.user_id`) oder Admin derselben Organisation | nein |
| 3 | `app/api/ops/rechnungen/[id]/zugferd/route.ts` | `service-proofs` | serverinterner Fetch für ZUGFeRD-Einbettung | 120 s | niemand — die URL verlässt den Server nicht | nein |
| 4 | `lib/billing/core/tarif-belege.ts` | Beleg-Bucket | Tarifbeleg ansehen | 300 s (Parameter) | Aufrufer der Beleg-Ansicht | nein |
| 5 | `lib/akten/dokumente.ts` | Parameter | Aktendokument-Download | 300 s (Parameter) | Aufrufer | nein |
| 6 | `lib/wunden/fotos.ts` | `wound_photos.bucket` | Wundfotos in der Ansicht | 300 s (Parameter) | Pflegekraft/Admin mit Zugriff auf die Wunde | nein |
| 7 | `lib/kim/attachment-service.ts` | KIM-Bucket | KIM-Anhänge | 300 s (Parameter) | Empfänger der KIM-Nachricht | nein |
| 8 | `app/admin/verordnungen/page.tsx` | Verordnungs-Bucket | Verordnungsscan öffnen | 3600 s | Admin | nein |
| 9 | `app/mis/documents/page.tsx` | `mis-documents` | MIS-Dokument öffnen | 3600 s | MIS-Nutzer | nein |
| 10 | `lib/upload-document.ts` | `documents` | Ausweis, Führungszeugnis, Versicherung | **7 Tage** | hochladender Nutzer + jeder Leser von `documents.file_url` | ja → `documents.file_url` |
| 11 | `lib/upload-service-proof.ts` | `service-proofs` | Leistungsnachweis-Foto | **7 Tage** | Aufrufer; Rückgabewert wandert in die DB | ja (durch Aufrufer) |
| 12 | `app/api/native/leistungsnachweis-upload/route.ts` | `service-proofs` | OCR-Vorlage | **7 Tage** | Admin-Ansicht `/admin/leistungsnachweis-upload` | ja → `ocr_results.image_url` |

Positiv: nirgends wird `getPublicUrl()` benutzt — alle Buckets sind privat.

## Geändert (technisch ableitbar)

**Zeilen 1 + 2: Rechnungs-PDF von 30 Tagen auf 10 Minuten.**

Die 30 Tage brachten keinen Nutzen: Der einzige dauerhafte Zugriffsweg auf ein
Rechnungs-PDF ist `GET /api/rechnungen/[id]/pdf`, und diese Route signiert bei
**jedem** Aufruf frisch — nachdem sie Eigentümerschaft bzw.
Organisationszugehörigkeit geprüft hat. Der bei der Erzeugung entstehende Link
wird nur unmittelbar an den Browser des Admins gereicht
(`POST /api/admin/invoices/[id]/generate-pdf` → sofortiges `window.open`).
Danach dient der gespeicherte Wert nur noch als „PDF existiert"-Marke
(`has_pdf` in `/api/billing/invoices`, `app/kunde/rechnungen`) — dafür genügt
die bloße Anwesenheit eines Wertes.

Beide Stellen ziehen jetzt dieselbe Konstante
`RECHNUNGS_PDF_URL_TTL_SEKUNDEN` (`lib/pdf/rechnung-paket.ts`); vorher standen
zwei verschiedene Zahlen an zwei Stellen, und genau die eine war 30 Tage.

Regressionsschranke: `lib/__tests__/signierte-urls.test.ts`.

## Offen — BUSINESS_INPUT_REQUIRED

**Zeilen 10–12: die drei 7-Tage-Stellen.** Sie sind im Quelltext an Ort und
Stelle als `BUSINESS_INPUT_REQUIRED` markiert.

Kürzen ist hier **nicht** technisch ableitbar: Bei allen drei wandert die
erzeugte URL in eine Datenbankspalte und wird von der Oberfläche direkt
geöffnet. Eine kürzere Frist macht die abgelegten Nachweise unerreichbar,
solange es keine Re-Signier-Route nach dem Muster von
`GET /api/rechnungen/[id]/pdf` gibt (prüft Zugriff → signiert den gespeicherten
Pfad neu).

Zu entscheiden — je Stelle dieselbe Alternative:

1. **Re-Signier-Route bauen** und die Leser darauf umstellen, dann Laufzeit auf
   Minuten. Für `documents` existiert `getSignedDocumentUrl()` bereits; es
   benutzt sie nur keine Oberfläche.
2. **7 Tage bewusst als Restrisiko tragen** — mit dem Wissen, dass ein Link auf
   einen Personalausweis (Zeile 10) einen Rollenwechsel und eine
   Konto-Deaktivierung um bis zu sieben Tage überdauert.

Empfehlung: Für `documents` (Zeile 10) Variante 1 — der Bucket führt die
sensibelsten Daten im ganzen System, und der Umbau ist klein, weil die
Signier-Funktion schon da ist.
