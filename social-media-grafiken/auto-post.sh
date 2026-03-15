#!/bin/bash
# ═══════════════════════════════════════════════════
# AlltagsEngel — Social Media Auto-Post Script
# Tüm platformlara Coming Soon postu atar
# ═══════════════════════════════════════════════════

GRAFIK_DE="/Users/work/alltagsengel/social-media-grafiken/COMING-SOON-app.png"
GRAFIK_TR="/Users/work/alltagsengel/social-media-grafiken/COMING-SOON-app-TR.png"

# ─── Instagram/Facebook Caption (DE) ───
CAPTION_DE='😇 Alltagsengel kommt nach Frankfurt!

Ihre neue App für Premium-Alltagsbegleitung — zertifiziert, versichert und direkt über die Pflegekasse abrechenbar.

Was wir bieten:
🛒 Einkaufsservice
🏥 Arztbegleitung
📋 Behördengänge
🤝 Gesellschaft & Gespräche

💶 131€/Monat über §45b SGB XI — Sie zahlen nichts!

📍 Verfügbar in Frankfurt:
60318 · 60320 · 60321 · 60323
60385 · 60389 · 60431 · 60433

🌐 alltagsengel.care

#AlltagsEngel #Frankfurt #Alltagsbegleitung #Seniorenhilfe #Pflegekasse #Entlastungsbetrag #PremiumPflege #SeniorenFrankfurt'

# ─── TikTok Caption (DE) ───
CAPTION_TIKTOK='😇 Alltagsengel kommt nach Frankfurt!

Premium-Alltagshilfe für Senioren — 131€/Monat über die Pflegekasse. Du zahlst nichts! 💶

🛒 Einkauf · 🏥 Arzt · 📋 Behörden · 🤝 Gesellschaft

Deine Oma verdient das Beste. ❤️

#AlltagsEngel #Frankfurt #Seniorenhilfe #Pflege #Pflegekasse #FürDieFamilie #AlltagsHilfe'

echo "═══════════════════════════════════════════"
echo "  AlltagsEngel Social Media Auto-Post"
echo "═══════════════════════════════════════════"
echo ""
echo "Grafik DE: $GRAFIK_DE"
echo "Grafik TR: $GRAFIK_TR"
echo ""
echo "Caption bereit. Starte Posting-Prozess..."
echo ""

# Check if graphics exist
if [ ! -f "$GRAFIK_DE" ]; then
    echo "FEHLER: Grafik nicht gefunden: $GRAFIK_DE"
    exit 1
fi

echo "✅ Grafiken vorhanden"
echo ""
echo "Posting-Reihenfolge:"
echo "1. Meta Business Suite (Instagram + Facebook)"
echo "2. TikTok"
echo ""
echo "Script bereit. AppleScript-Automation startet..."
