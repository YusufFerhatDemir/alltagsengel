from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
import os, sys

# Font
for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
          '/opt/homebrew/share/fonts/dejavu/DejaVuSans.ttf',
          '/Library/Fonts/DejaVuSans.ttf']:
    if os.path.exists(p):
        pdfmetrics.registerFont(TTFont('DJS', p))
        break
for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
          '/opt/homebrew/share/fonts/dejavu/DejaVuSans-Bold.ttf',
          '/Library/Fonts/DejaVuSans-Bold.ttf']:
    if os.path.exists(p):
        pdfmetrics.registerFont(TTFont('DJSB', p))
        break

try:
    pdfmetrics.getFont('DJS')
except:
    print("WARN: DejaVuSans not found, using Helvetica")
    DJS = 'Helvetica'
    DJSB = 'Helvetica-Bold'
else:
    DJS = 'DJS'
    DJSB = 'DJSB'

GOLD = HexColor('#C8A961')
DARK = HexColor('#1a1a2e')
GREEN = HexColor('#2d6a4f')
RED = HexColor('#c1121f')
GRAY = HexColor('#666666')
WHITE = HexColor('#ffffff')
W, H = A4
now = datetime.now().strftime('%Y-%m-%d %H:%M')

out = os.path.expanduser('~/alltagsengel/docs/reports/MASTER_HANDOFF_LATEST.pdf')
os.makedirs(os.path.dirname(out), exist_ok=True)
c = canvas.Canvas(out, pagesize=A4)

def sect(c, y, title):
    c.setFillColor(GOLD)
    c.rect(20*mm, y, W-40*mm, 0.5*mm, fill=1, stroke=0)
    c.setFont(DJSB, 13)
    c.setFillColor(DARK)
    c.drawString(20*mm, y+3*mm, title)
    return y - 5*mm

def rows(c, y, items):
    for label, val in items:
        c.setFont(DJSB, 9); c.setFillColor(DARK)
        c.drawString(22*mm, y, label)
        c.setFont(DJS, 9); c.setFillColor(GRAY)
        c.drawString(58*mm, y, val)
        y -= 5*mm
    return y

# Header
c.setFillColor(DARK)
c.rect(0, H-45*mm, W, 45*mm, fill=1, stroke=0)
c.setFillColor(GOLD)
c.rect(0, H-45*mm, W, 1.5*mm, fill=1, stroke=0)
c.setFont(DJSB, 22); c.setFillColor(WHITE)
c.drawString(20*mm, H-18*mm, 'MASTER-HANDOFF')
c.setFont(DJS, 10); c.setFillColor(HexColor('#aaa'))
c.drawString(20*mm, H-26*mm, f'Stand: {now} | MASTER-MODUS Dispatch')
c.drawString(20*mm, H-33*mm, 'Alltagsengel UG | ChairMatch | efy care')
c.setFont(DJS, 9)
c.drawRightString(W-20*mm, H-18*mm, 'Seite 1/2')

y = H - 52*mm

# P1
y = sect(c, y, 'P1 — Alltagsengel')
y -= 6*mm
y = rows(c, y, [
    ('HEAD:', 'f4231e6 (Vercel deployed)'),
    ('Tests:', '7855/7855'),
    ('Migrationen:', '284 live (letzte: 20260828125757)'),
    ('Track 12:', 'PROVEN_LIVE'),
    ('Track 13:', 'RUNNING (243 Turns)'),
    ('Future-TS:', '7 Dateien dokumentiert, Production OK'),
    ('Ext. Blocker:', '§45a Bayern, DATEV D1/D2, Pilot-Rechnung'),
])
y -= 3*mm

# P2
y = sect(c, y, 'P2 — ChairMatch')
y -= 6*mm
y = rows(c, y, [
    ('HEAD:', '5af4013 (Vercel deployed)'),
    ('Tests:', '1526/1526'),
    ('Migrationen:', '49 live (letzte: 20260828230000)'),
    ('Track 22:', 'PROVEN_LIVE (2026-08-28)'),
    ('Track 23:', 'RUNNING (95 Turns, DSGVO)'),
    ('CM22 Beweis:', 'publish_review_pair + REVOKE + 7 Constraints'),
    ('Ext. Blocker:', 'C1-C5 Preisgestaltung'),
])
y -= 3*mm

# P3
y = sect(c, y, 'P3 — efy care')
y -= 6*mm
y = rows(c, y, [
    ('HEAD:', 'ce9af1b'),
    ('Tests:', '1807'),
    ('Migrationen:', '50 live (letzte: 20260828230000)'),
    ('Track 14:', 'PROVEN_RECONCILED'),
    ('Track 15:', 'PROVEN_LIVE (2026-08-28)'),
    ('Track 16:', 'RUNNING (94 Turns)'),
    ('efy15 Beweis:', '10 Func + 12 Policies + 5 Trigger + 3 Buckets'),
    ('Ext. Blocker:', 'Edge Functions Redeploy'),
])

# PAGE 2
c.showPage()
c.setFillColor(DARK)
c.rect(0, H-18*mm, W, 18*mm, fill=1, stroke=0)
c.setFillColor(GOLD); c.rect(0, H-18*mm, W, 1*mm, fill=1, stroke=0)
c.setFont(DJSB, 14); c.setFillColor(WHITE)
c.drawString(20*mm, H-13*mm, 'MASTER-HANDOFF — Seite 2/2')
c.setFont(DJS, 9); c.drawRightString(W-20*mm, H-13*mm, now)

y = H - 28*mm

# Migration Health
y = sect(c, y, 'Migration Health')
y -= 6*mm
hdr = [('Produkt','Total','Letzte Version','Drift','Status')]
data = [
    ('Alltagsengel','284','20260828125757','7 Future-TS (dok.)','STABLE'),
    ('ChairMatch','49','20260828230000','1 Duplikat','PROVEN_LIVE'),
    ('efy care','50','20260828230000','4 Duplikate','PROVEN_LIVE'),
]
for i, row in enumerate(hdr + data):
    x = 22*mm
    f = DJSB if i == 0 else DJS
    cl = DARK if i == 0 else GRAY
    c.setFont(f, 8); c.setFillColor(cl)
    for j, cell in enumerate(row):
        c.drawString(x, y, cell)
        x += [30*mm, 14*mm, 38*mm, 35*mm, 30*mm][j]
    y -= 4.5*mm

y -= 5*mm

# Track D
y = sect(c, y, 'Track D — Mac Resource Manager')
y -= 6*mm
y = rows(c, y, [
    ('RAM:', '8 GB, ~20 MB frei'),
    ('Swap:', '5.4 / 7.1 GB'),
    ('Pressure:', 'RED'),
    ('Disk Free:', '~18 GB (Ziel: 30 GB)'),
    ('Bereinigt:', 'dotslash, npm, Homebrew, GeoServices, Chrome'),
    ('Blockiert:', 'vm_bundles 11GB, Sessions 4.9GB = untouchable'),
])
y -= 3*mm

# Status-Legende
y = sect(c, y, 'Status-Legende')
y -= 6*mm
for label, desc in [
    ('CODE_COMPLETE', 'Code geschrieben'),
    ('TESTS_GREEN', 'Alle Tests bestanden'),
    ('COMMITTED', 'In Git committed'),
    ('DEPLOYED', 'Push auf main, CI aktiv'),
    ('MIGRATION_PENDING', 'Migration committed, nicht Production'),
    ('MIGRATION_APPLIED', 'Migration auf Production'),
    ('PRODUCTION_VERIFIED', 'DB-Objekte einzeln geprueft'),
    ('PROVEN_LIVE', 'Code + Tests + Migration + DB-Beweis'),
]:
    c.setFont(DJSB, 8); c.setFillColor(DARK)
    c.drawString(22*mm, y, label)
    c.setFont(DJS, 8); c.setFillColor(GRAY)
    c.drawString(65*mm, y, desc)
    y -= 4.5*mm

y -= 5*mm

# Sperren
y = sect(c, y, 'Aktive Sperren')
y -= 6*mm
c.setFont(DJS, 8); c.setFillColor(RED)
for s in [
    'KEINE echten Rechnungen/Mahnungen versenden',
    'KEINE Echtgeld-Zahlungen ausloesen',
    'KEINE ChairMatch-Preise erfinden',
    'KEINE Kunden/Bewerber/Behoerden kontaktieren',
    'KEINE Secrets in Chat/Logs/Commits',
    'supabase db push NIEMALS verwenden',
    'FIRST_REAL_INVOICE_APPROVED = false',
]:
    c.drawString(24*mm, y, '- ' + s)
    y -= 4*mm

# Footer
c.setFillColor(GOLD); c.rect(0, 8*mm, W, 0.5*mm, fill=1, stroke=0)
c.setFont(DJS, 7); c.setFillColor(GRAY)
c.drawString(20*mm, 4*mm, f'MASTER_HANDOFF_LATEST.pdf | {now} | Update nach Track-Abschluss')

c.save()
print(f'OK: {out}')
