-- ═══════════════════════════════════════════════════
-- AlltagsEngel — TikTok Auto-Post
-- Coming Soon Post
-- ═══════════════════════════════════════════════════

set captionText to "😇 Alltagsengel kommt nach Frankfurt!

Premium-Alltagshilfe für Senioren — 131€/Monat über die Pflegekasse. Du zahlst nichts! 💶

🛒 Einkauf · 🏥 Arzt · 📋 Behörden · 🤝 Gesellschaft

Deine Oma verdient das Beste. ❤️

#AlltagsEngel #Frankfurt #Seniorenhilfe #Pflege #Pflegekasse #FürDieFamilie #AlltagsHilfe"

set graphicPath to "/Users/work/alltagsengel/social-media-grafiken/COMING-SOON-app.png"

tell application "Google Chrome"
    activate

    -- Find TikTok upload tab
    set tiktokTab to missing value
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "tiktok.com" and URL of t does not contain "login" then
                set tiktokTab to t
                set active tab index of w to (index of t)
                exit repeat
            end if
        end repeat
        if tiktokTab is not missing value then exit repeat
    end repeat

    if tiktokTab is missing value then
        open location "https://www.tiktok.com/upload"
        delay 3
        set tiktokTab to active tab of front window
    else
        set URL of tiktokTab to "https://www.tiktok.com/upload"
        delay 3
    end if

    delay 2

    -- Type caption
    tell tiktokTab
        execute javascript "
            // Find caption input
            var editors = document.querySelectorAll('[contenteditable=\"true\"], [data-text=\"true\"], .DraftEditor-root, [role=\"textbox\"]');
            if (editors.length > 0) {
                editors[0].focus();
                editors[0].click();
            }
            'found ' + editors.length + ' editors';
        "
    end tell

    delay 1

    -- Paste caption via clipboard
    set the clipboard to captionText

    tell application "System Events"
        tell process "Google Chrome"
            keystroke "v" using command down
        end tell
    end tell

    delay 2

    return "TikTok Caption eingefügt. Bitte Video/Grafik manuell hochladen: " & graphicPath

end tell
