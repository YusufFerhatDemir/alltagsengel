-- ═══════════════════════════════════════════════════
-- AlltagsEngel — Meta Business Suite Auto-Post
-- Instagram + Facebook Coming Soon Post
-- ═══════════════════════════════════════════════════

-- Caption Text
set captionText to "😇 Alltagsengel kommt nach Frankfurt!

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

#AlltagsEngel #Frankfurt #Alltagsbegleitung #Seniorenhilfe #Pflegekasse #Entlastungsbetrag #PremiumPflege #SeniorenFrankfurt"

set graphicPath to "/Users/work/alltagsengel/social-media-grafiken/COMING-SOON-app.png"

tell application "Google Chrome"
    activate

    -- Find Meta Business Suite tab
    set metaTab to missing value
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "business.facebook.com" then
                set metaTab to t
                set active tab index of w to (index of t)
                exit repeat
            end if
        end repeat
        if metaTab is not missing value then exit repeat
    end repeat

    if metaTab is missing value then
        -- Open Meta Business Suite
        open location "https://business.facebook.com/latest/composer/"
        delay 3
        set metaTab to active tab of front window
    end if

    -- Navigate to composer
    set URL of metaTab to "https://business.facebook.com/latest/composer/"
    delay 3

    -- Type caption into the text area
    tell metaTab
        execute javascript "
            // Find and click the text area
            var textboxes = document.querySelectorAll('[role=\"textbox\"]');
            if (textboxes.length > 0) {
                textboxes[0].focus();
                textboxes[0].click();
            }
            'found ' + textboxes.length + ' textboxes';
        "
    end tell

    delay 1

    -- Use clipboard to paste caption
    set the clipboard to captionText

    tell application "System Events"
        tell process "Google Chrome"
            keystroke "v" using command down
        end tell
    end tell

    delay 2

    -- Now click "Foto/Video hinzufügen" button
    tell metaTab
        execute javascript "
            var buttons = document.querySelectorAll('button, [role=\"button\"]');
            var found = false;
            for (var i = 0; i < buttons.length; i++) {
                var text = buttons[i].textContent.trim();
                if (text.indexOf('Foto') !== -1 || text.indexOf('Video') !== -1 || text.indexOf('Medien') !== -1) {
                    buttons[i].click();
                    found = true;
                    break;
                }
            }
            'clicked media button: ' + found;
        "
    end tell

    delay 2

    return "Caption eingefügt. Bitte Grafik manuell auswählen: " & graphicPath

end tell
