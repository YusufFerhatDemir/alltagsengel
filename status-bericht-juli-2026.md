# Status-Bericht — 2. Juli 2026

## 1. iOS App

Die Alltagsengel iOS App v2.0.0 (Build 26) mit iPad-Support wurde erfolgreich bei Apple eingereicht.
Status: **Warten auf Prüfung**. Technisch ist alles korrekt konfiguriert.

Kleines Risiko: 2 von 3 App-Store-Screenshots zeigten zuletzt 404-Seiten. Falls Apple das bemängelt, müssen neue Screenshots hochgeladen werden.

## 2. Zadarma

Zadarma (my.zadarma.com) zeigt die Login-Seite. Es ist keine aktive Session vorhanden. Login nötig um den Status zu prüfen.

## 3. Verbesserungsmöglichkeiten

Beide Projekte sind technisch überdurchschnittlich reif. Keine akute Krise.

### Alltagsengel — Kritisch

1. **DSGVO: Admin-Bereich öffentlich zugänglich!** — /admin/dashboard, /admin/records, /admin/budgets, /admin/invoices zeigen echte Klientennamen, Krankenkassen und Rechnungsbeträge ohne Login. Sofort absichern!
2. **Desktop-Scrolling kaputt** — Im Hero-Bereich reagiert das Mausrad nicht. Desktop-Besucher sehen nur den Splash-Screen.
3. **WhatsApp-Webhook unsicher** — prüft keine Meta-Signatur (`x-hub-signature-256`). Jeder mit der URL kann gefälschte Nachrichten posten und KI-Kosten auslösen.
4. **Kein CI-Gate** — deploy.sh pusht autonom mit warn-only Typecheck. Kein Lint/Test in GitHub Actions.
5. **Klienten können nicht angelegt werden** — Admin-Bereich ist read-only. Blocker für Produktivbetrieb.
6. **§45b-PDF + Abtretungserklärung fehlt** — ohne formkonforme Belege fließt kein Geld von der Pflegekasse.

### Alltagsengel — Wichtig

- hilfe-icon.png = 1,4 MB (komprimieren auf ~80 KB WebP)
- Blog-Querverlinkung fehlt (nur 1/28 Posts nutzt RelatedArticles)
- Rate-Limiter für KI-Chat auf Vercel umgehbar (In-Memory statt verteilt)
- InstallPrompt-Text für iOS falsch ("App installieren" statt "Zum Home-Bildschirm")
- offline.html lädt Google Fonts (schlägt offline fehl)
- RLS der neuen Betriebssystem-Tabellen nicht auditiert

### ChairMatch — Kritisch

1. **Stripe Connect / Auszahlungen = Stub** — Checkout und Webhook funktionieren, aber Salon-Betreiber können nicht ausgezahlt werden.
2. **Double-Booking nur App-Level** — kein DB-Constraint gegen Doppelbuchungen.

### ChairMatch — Wichtig

- /nachrichten ist Mock-Daten (echter Chat lebt im ChatWidget, polling alle 15s)
- Search/Explore mischt Demo-Daten bei leerer DB
- Canonical fehlt auf category/[categoryId] (Duplicate-Content-Risiko)
- Kein next/image (0 Nutzung, alle img sind roh)

### Feature-Lücken vs. Wettbewerb

**Alltagsengel:** Angehörigen-Portal, digitale Einsatzdokumentation pro Termin, Matching-Algorithmus Klient-Kraft

**ChairMatch:** Echte Stripe-Auszahlungen, Realtime-Messaging, DB-Level Booking-Constraints

## Empfohlene nächste Schritte

1. WhatsApp-Webhook-Signatur einbauen (schneller Fix, echtes Risiko)
2. hilfe-icon.png komprimieren (10 Min Arbeit)
3. Klienten-Anlage im Betriebssystem bauen
4. CI-Pipeline aufsetzen
5. §45b-PDF-Generierung implementieren
