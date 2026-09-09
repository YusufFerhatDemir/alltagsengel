#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Erzeugt die beiden Master-PDFs vom 09.09.2026.

SCHRIFT: ausschliesslich DejaVuSans / DejaVuSans-Bold aus public/fonts.
Helvetica ist verboten — das Skript bricht ab, wenn irgendein Stil darauf
zurueckfaellt (siehe pruefe_keine_helvetica()).

Statusampeln: DejaVuSans enthaelt KEINE Emoji (U+1F7E2 & Co. faenden kein
Glyph und wuerden als leeres Kaestchen gesetzt). Stattdessen wird U+25CF
(BLACK CIRCLE) eingefaerbt — dasselbe Signal, aber mit vorhandenem Glyph.
"""

import os
import subprocess
import sys

# ══ REIHENFOLGE IST HIER WICHTIG ══════════════════════════════════════════
# reportlab.platypus friert beim Import die Basisschrift als Klassenattribut
# von CellStyle ein. Wird sie erst danach umgestellt, traegt jede Tabelle
# still Helvetica in die Seitenressourcen — sichtbar in `pdffonts`, obwohl
# kein Zeichen damit gesetzt wird. Deshalb: Schrift registrieren, Basisschrift
# setzen, DANN platypus importieren.
from reportlab import rl_config
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

REPO = "/Users/work/alltagsengel"
FONT_DIR = os.path.join(REPO, "public", "fonts")
OUT_DIR = os.path.join(REPO, "docs", "reports")

NORMAL, FETT = "DejaVuSans", "DejaVuSans-Bold"
pdfmetrics.registerFont(TTFont(NORMAL, os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont(FETT, os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily(NORMAL, normal=NORMAL, bold=FETT, italic=NORMAL, boldItalic=FETT)
rl_config.canvas_basefontname = NORMAL

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas as _Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ── Farben ────────────────────────────────────────────────────────────────
TINTE = colors.HexColor("#1c1c1c")
GRAU = colors.HexColor("#5a5a5a")
LINIE = colors.HexColor("#d8d8d8")
KOPF_BG = colors.HexColor("#f2efe9")
ZEBRA = colors.HexColor("#faf8f5")
AKZENT = colors.HexColor("#8a6d3b")

GRUEN = colors.HexColor("#1a7f37")
GELB = colors.HexColor("#b8860b")
ROT = colors.HexColor("#c0392b")
SCHWARZ = colors.HexColor("#444444")

AMPEL = {
    "gruen": (GRUEN, "VERIFIZIERT"),
    "gelb": (GELB, "TEILWEISE"),
    "rot": (ROT, "BLOCKIERT"),
    "schwarz": (SCHWARZ, "NICHT VERIFIZIERT"),
}


def amp(schluessel, text=None):
    """Farbiger Kreis + Text als Paragraph-Markup."""
    farbe, standard = AMPEL[schluessel]
    return '<font color="#%s">●</font> %s' % (farbe.hexval()[2:], text if text else standard)


# ── Stile ─────────────────────────────────────────────────────────────────


def stil(name, **kw):
    basis = dict(
        name=name, fontName=NORMAL, fontSize=9.2, leading=13.2,
        textColor=TINTE, alignment=TA_LEFT, spaceBefore=0, spaceAfter=0,
    )
    basis.update(kw)
    return ParagraphStyle(**basis)


S = {
    "titel": stil("titel", fontName=FETT, fontSize=23, leading=27, spaceAfter=5),
    "untertitel": stil("untertitel", fontSize=11.5, leading=15.5, textColor=GRAU, spaceAfter=13),
    "h1": stil("h1", fontName=FETT, fontSize=14.2, leading=18, spaceBefore=17, spaceAfter=7, textColor=AKZENT),
    "h2": stil("h2", fontName=FETT, fontSize=10.8, leading=14.5, spaceBefore=11, spaceAfter=5),
    "p": stil("p", spaceAfter=6),
    "klein": stil("klein", fontSize=8.1, leading=11.4, textColor=GRAU, spaceAfter=5),
    "code": stil("code", fontSize=7.7, leading=10.4, textColor=colors.HexColor("#2c2c2c")),
    "zelle": stil("zelle", fontSize=8.4, leading=11.6),
    "zellef": stil("zellef", fontName=FETT, fontSize=8.4, leading=11.6),
    "fuss": stil("fuss", fontSize=7.4, leading=9.6, textColor=GRAU),
}


def P(text, s="p"):
    return Paragraph(text, S[s])


def tabelle(kopf, zeilen, breiten, klein=False):
    st = "zelle" if not klein else "code"
    daten = [[Paragraph(c, S["zellef"]) for c in kopf]]
    for z in zeilen:
        daten.append([Paragraph(c, S[st]) for c in z])
    t = Table(daten, colWidths=breiten, repeatRows=1, hAlign="LEFT")
    stilliste = [
        ("FONTNAME", (0, 0), (-1, -1), NORMAL),
        ("BACKGROUND", (0, 0), (-1, 0), KOPF_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, AKZENT),
        ("GRID", (0, 0), (-1, -1), 0.28, LINIE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for i in range(1, len(daten)):
        if i % 2 == 0:
            stilliste.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(stilliste))
    return t


def codeblock(text):
    zeilen = [[Paragraph(z.replace("&", "&amp;").replace("<", "&lt;") or "&nbsp;", S["code"])]
              for z in text.strip("\n").split("\n")]
    t = Table(zeilen, colWidths=[17.0 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), NORMAL),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f4f0")),
        ("BOX", (0, 0), (-1, -1), 0.4, LINIE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 0.8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8),
    ]))
    return t


def legende():
    return P(
        "Legende: %s &nbsp;&nbsp; %s &nbsp;&nbsp; %s &nbsp;&nbsp; %s"
        % (amp("gruen"), amp("gelb"), amp("rot"), amp("schwarz")),
        "klein",
    )


# ── Seitengeruest ─────────────────────────────────────────────────────────
class Dok(BaseDocTemplate):
    def __init__(self, pfad, kopfzeile):
        BaseDocTemplate.__init__(
            self, pfad, pagesize=A4,
            leftMargin=2.1 * cm, rightMargin=2.1 * cm,
            topMargin=2.0 * cm, bottomMargin=1.7 * cm,
            title=kopfzeile, author="Alltagsengel",
        )
        self.kopfzeile = kopfzeile
        rahmen = Frame(self.leftMargin, self.bottomMargin,
                       self.width, self.height, id="haupt")
        self.addPageTemplates([PageTemplate(id="std", frames=rahmen, onPage=self._rand)])

    def _rand(self, c, doc):
        c.saveState()
        c.setFont(NORMAL, 7.4)
        c.setFillColor(GRAU)
        c.drawString(self.leftMargin, A4[1] - 1.32 * cm, self.kopfzeile)
        c.drawRightString(A4[0] - self.rightMargin, A4[1] - 1.32 * cm, "09.09.2026")
        c.setStrokeColor(LINIE)
        c.setLineWidth(0.4)
        c.line(self.leftMargin, A4[1] - 1.5 * cm, A4[0] - self.rightMargin, A4[1] - 1.5 * cm)
        c.line(self.leftMargin, 1.32 * cm, A4[0] - self.rightMargin, 1.32 * cm)
        c.drawString(self.leftMargin, 1.0 * cm, "Alltagsengel — interner Bericht")
        c.drawRightString(A4[0] - self.rightMargin, 1.0 * cm, "Seite %d" % doc.page)
        c.restoreState()


def pruefe_keine_helvetica():
    for name, s in S.items():
        if "elvetica" in (s.fontName or ""):
            raise SystemExit("ABBRUCH: Stil '%s' nutzt %s statt DejaVuSans." % (name, s.fontName))
    for f in (NORMAL, FETT):
        if f not in pdfmetrics.getRegisteredFontNames():
            raise SystemExit("ABBRUCH: Schrift %s nicht registriert." % f)


def dejavu_canvas(*args, **kw):
    """Canvas, dessen ANFANGSschrift DejaVuSans ist.

    Ohne das legt ReportLab Helvetica als Basisschrift in die Ressourcen jeder
    Seite — sichtbar in `pdffonts`, nicht eingebettet, und damit ein Verstoss
    gegen die Vorgabe, auch wenn nie ein Zeichen damit gesetzt wird.
    """
    kw["initialFontName"] = NORMAL
    return _Canvas(*args, **kw)


def pruefe_pdf_ohne_helvetica(pfad):
    """Liest das FERTIGE PDF und bricht ab, wenn Helvetica darin vorkommt."""
    roh = open(pfad, "rb").read()
    if b"Helvetica" in roh:
        raise SystemExit("ABBRUCH: %s enthaelt Helvetica." % os.path.basename(pfad))
    if b"DejaVuSans" not in roh:
        raise SystemExit("ABBRUCH: %s enthaelt kein DejaVuSans." % os.path.basename(pfad))
    print("   geprueft: keine Helvetica, DejaVuSans eingebettet")


def git_log(repo, n=10, breite=104):
    roh = subprocess.run(["git", "-C", repo, "log", "--oneline", "-%d" % n],
                         capture_output=True, text=True).stdout.strip().split("\n")
    aus = []
    for z in roh:
        z = z.replace("&", "&amp;").replace("<", "&lt;")
        aus.append(z if len(z) <= breite else z[: breite - 1] + "…")
    return "\n".join(aus)


def git_head(repo):
    return subprocess.run(["git", "-C", repo, "rev-parse", "HEAD"],
                          capture_output=True, text=True).stdout.strip()


AE, EFY, CM = REPO, "/Users/work/efy-care", "/Users/work/chairmatch"
H_AE, H_EFY, H_CM = git_head(AE), git_head(EFY), git_head(CM)
B = 17.0 * cm


# ══════════════════════════════════════════════════════════════════════════
#  PDF 1 — MASTER ENTWICKLUNGSSTATUS
# ══════════════════════════════════════════════════════════════════════════
def entwicklungsstatus():
    e = []
    e.append(P("Master-Entwicklungsstatus", "titel"))
    e.append(P("Drei Projekte, ein Stand — 09.09.2026<br/>"
               "Alltagsengel · efy care · ChairMatch", "untertitel"))
    e.append(P(
        "<b>Beweispflicht aktiv.</b> Jede Aussage steht auf einer Kommandoausgabe, einer HTTP-Antwort "
        "der laufenden Instanz oder einer Codestelle aus den vier Quellberichten dieses Tages. "
        "Wo nicht gemessen werden konnte, steht das ausdrücklich — als Aussage, nicht als "
        "vorsichtige Formulierung für „wahrscheinlich in Ordnung“.", "p"))
    e.append(legende())
    e.append(Spacer(1, 7))
    e.append(tabelle(
        ["Projekt", "Stand (HEAD)", "Produktion"],
        [["Alltagsengel", "<font name='%s'>%s</font>" % (NORMAL, H_AE[:12]), "alltagsengel.care"],
         ["efy care", "<font name='%s'>%s</font>" % (NORMAL, H_EFY[:12]), "Supabase nsfbwhpjesmathsrqkfi"],
         ["ChairMatch", "<font name='%s'>%s</font>" % (NORMAL, H_CM[:12]), "www.chairmatch.de"]],
        [4.2 * cm, 5.2 * cm, 7.6 * cm]))

    # 1 ────────────────────────────────────────────────────────────────────
    e.append(P("1. Executive Summary", "h1"))
    e.append(P(
        "Alle drei Projekte sind <b>technisch weit gebaut und technisch grün</b>. Kein einziger "
        "der harten Blocker ist ein Codefehler — es sind durchweg fehlende Umgebungsvariablen, "
        "nicht angewendete Migrationen, externe Behördenvorgänge und fehlender echter Inhalt. "
        "Das ist die zentrale Erkenntnis dieses Tages.", "p"))
    e.append(tabelle(
        ["Bereich", "Status", "Kernaussage"],
        [
            ["Alltagsengel", amp("gruen", "~89 %"),
             "12.780 Tests grün, Build 620/620 Seiten, lokal = Remote = Produktion. "
             "Verdrahtungsreife ~89 %. Betrieb im Pilotstadium: 4 Klienten, 3 Rechnungen."],
            ["efy care", amp("rot", "NICHT produktionsreif"),
             "<b>Nicht wegen der Software.</b> 2.444 Tests grün, 48/48 Tabellen mit RLS, "
             "CI auf HEAD grün. Blockiert von vier externen Einrichtungsschritten."],
            ["ChairMatch", amp("gelb", "Technik grün / Inhalt rot"),
             "1.821 Tests grün, 342/342 Seiten, 21/21 Sicherheitssonden erfüllt — aber "
             "<b>alle 15 Salons sind Seed-Daten</b> und jede Geldstrecke ist tot."],
            ["Genehmigung §45a", amp("rot", "NEIN"),
             "<b>Antrag heute nicht einreichbar.</b> Frist 31.08.2026 ist seit 9 Tagen abgelaufen. "
             "Gewerbeanmeldung und Haftpflicht-Police fehlen, 12 Unterschriften offen."],
            ["Marketing-Restart", amp("gruen", "bereit"),
             "14-Tage-Contentplan steht, Automatisierung vollständig gebaut, 41 Blogartikel, "
             "22 Stadtseiten. Rein organisch — Google Ads bleibt aus."],
        ],
        [3.3 * cm, 3.5 * cm, 10.2 * cm]))
    e.append(Spacer(1, 6))
    e.append(P(
        "<b>Der gemeinsame Nenner:</b> An drei von drei Projekten hängt der nächste Schritt an "
        "einem Menschen mit Zugangsdaten — Vercel, Stripe, Supabase-SQL-Editor, Expo, Gewerbeamt. "
        "Kein Agent kann diese Schritte ausführen. Deshalb ist der Aktionsplan das eigentlich "
        "handlungsleitende Dokument dieses Tages, nicht dieser Statusbericht.", "p"))

    # 2 ────────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("2. Alltagsengel — Detail", "h1"))
    e.append(P("Pflege- und Betreuungsplattform · Next.js 16.2.12 (Turbopack) · Vercel · Supabase", "klein"))
    e.append(tabelle(
        ["Bereich", "Status", "Beleg"],
        [
            ["Git-Kette", amp("gruen"),
             "Arbeitsbaum = origin/main = Produktion. /api/health meldet version 392bbe4."],
            ["Typecheck", amp("gruen"), "tsc --noEmit → Exit 0, keine Ausgabe."],
            ["Tests", amp("gruen"),
             "vitest 10.040 bestanden · node:test 2.740 bestanden · <b>12.780 gesamt, 0 Fehlschläge</b>."],
            ["Build", amp("gruen"), "Compiled successfully in 4.7min, 620/620 statische Seiten, Exit 0."],
            ["Geldweg-Kette", amp("gruen"),
             "verify:geldweg 12/12 Stationen gegen die Produktionsdatenbank (Nachweis → Unterschrift "
             "→ Sperre → Rechnung → Versand → Zahlung)."],
            ["131 € Entlastungsbetrag", amp("gruen"),
             "lib/config/budget-constants.ts, nach Gültigkeitszeitraum versioniert, fail-closed. "
             "19 Aufrufer."],
            ["SEO / Landingpages", amp("gruen"),
             "22 Städte je Strecke, 41 Blogartikel, Sitemap live mit 138 URLs."],
            ["Cookie-Consent", amp("gruen"),
             "Drei Kategorien einzeln wählbar, fail-closed, E2E-abgedeckt."],
            ["Registrierung", amp("gelb"),
             "Kunde/Engel/Fahrer vorhanden. <b>Angehörige haben keinen Selbstregistrierungsweg</b> "
             "— bewusst so."],
            ["Nachrichten", amp("gelb"),
             "Oberflächen und Backend vollständig; notifications 248 Zeilen, "
             "messages/chat_messages jedoch 0."],
            ["Bewerber-Verwaltung", amp("rot"),
             "<b>/admin/applications liest die tote Tabelle applications (0 Zeilen)</b>, während "
             "47 echte Bewerbungen in lead_inquiries liegen."],
            ["Automatische E-Mails", amp("rot"),
             "Resend intakt (Schlüssel gültig, Domain verifiziert). <b>Drei ENV-Schalter fehlen</b> "
             "→ invoice_email_log = 0."],
            ["Migrationen", amp("gelb"), "32 von 37 live, <b>5 Pflegemodul-Riegel stehen aus</b>."],
        ],
        [3.5 * cm, 2.9 * cm, 10.6 * cm]))

    e.append(P("2.1 Widerspruch zwischen zwei Berichten dieses Tages", "h2"))
    e.append(P(
        "Der Marketing-Restart-Bericht führt „Admin: Bewerbungen verwalten“ unter "
        "<font name='%s'>/admin/applications</font> als vorhanden. Das Statusaudit weist an derselben "
        "Stelle nach, dass diese Seite die Tabelle <font name='%s'>applications</font> liest, die live "
        "0 Zeilen führt und laut eigener Migration bewusst tot ist. <b>Beide Aussagen stehen im "
        "selben Repository — die zweite ist die gemessene.</b> Wer sich auf die erste verlässt, "
        "übersieht 47 Bewerbungen." % (NORMAL, NORMAL), "p"))

    e.append(P("2.2 Produktivdatenstand (PostgREST, count=exact)", "h2"))
    e.append(tabelle(
        ["Tabelle", "Zeilen", "Tabelle", "Zeilen"],
        [["page_views", "9.846", "clients", "4"],
         ["notifications", "248", "client_budgets", "4"],
         ["profiles", "73", "notification_delivery_log", "4"],
         ["conversions", "52", "bookings", "3"],
         ["lead_inquiries", "47", "invoices", "3"],
         ["service_records", "30", "caregivers", "2"],
         ["organizations", "6", "<b>applications</b>", "<b>0</b>"],
         ["messages / chat_messages", "0 / 0", "<b>invoice_email_log</b>", "<b>0</b>"]],
        [4.6 * cm, 2.6 * cm, 5.2 * cm, 4.6 * cm]))
    e.append(Spacer(1, 5))
    e.append(P(
        "<b>Einordnung ohne Beschönigung:</b> Die Plattform ist weit gebaut (369 Seiten, "
        "450 API-Routen, 471 Migrationen), der Produktivbetrieb steht am Anfang — 4 Klienten, "
        "2 Pflegekräfte, 3 Buchungen. Der Marketing-Trichter läuft dagegen bereits.", "p"))

    # 3 ────────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("3. efy care — Detail", "h1"))
    e.append(P("Pflegedienst-App · Expo SDK 57 / React Native 0.86 · Supabase · Edge Functions", "klein"))
    e.append(P(
        "<b>Klare Antwort: efy care ist heute NICHT produktionsreif — nicht wegen der Software.</b> "
        "Codestand, Datenbank und Testlage sind nachweislich in Ordnung. Blockiert wird sie von vier "
        "externen Einrichtungsschritten, drei davon heute gemessen statt angenommen.", "p"))
    e.append(tabelle(
        ["Bereich", "Status", "Beleg"],
        [
            ["Git-Kette", amp("gruen"), "Lokal = Remote, Arbeitsverzeichnis sauber."],
            ["CI/CD", amp("gruen"),
             "Letzter Lauf auf HEAD grün; alle sieben Pipeline-Schritte lokal reproduziert, Exit 0."],
            ["Tests", amp("gruen"),
             "89 Dateien, <b>2.444 bestanden, 0 rot</b>, 30 bewusst übersprungen (brauchen Live-DB)."],
            ["Supabase-Schema", amp("gruen"), "48/48 Tabellen + 69/69 Funktionen produktiv belegt, 0 fehlend."],
            ["RLS / Mandantentrennung", amp("gruen"),
             "<b>48/48 Tabellen mit RLS</b>, 121 Policies, 190 Trigger; anonym produktiv gegengeprüft."],
            ["Edge Functions (Deploy)", amp("gruen"),
             "Alle vier deployed und bootend — korrigiert eine ältere Annahme im Runbook."],
            ["App-Code / Web-Build", amp("gruen"), "Typecheck, Lint, expo export web — alle Exit 0."],
            ["Stripe-Zahlungsstrecke", amp("rot"),
             "<b>STRIPE_WEBHOOK_SECRET fehlt</b> — heute gemessen: HTTP 500. Kann keine Zahlung verbuchen."],
            ["OCR", amp("rot"),
             "HTTP 503 — OCR_ENABLED und/oder ANTHROPIC_API_KEY fehlt. Der 503 ist der vorgesehene Zustand."],
            ["Nativer Build (EAS)", amp("rot"),
             "Kein Expo-Login (~/.expo/state.json ohne sessionSecret); CLI zusätzlich defekt."],
            ["Branch Protection", amp("gelb"),
             "Technisch nicht aktivierbar (HTTP 403, Plan-Grenze) — auf main kann direkt gepusht werden."],
            ["Dependabot", amp("gelb"), "6 offene PRs, ältester 5 Wochen; #4 (Expo-SDK) rot."],
            ["Feature-Vollständigkeit", amp("gelb"),
             "Vier Servermodule ohne Bedienoberfläche — sync_conflicts am teuersten."],
            ["Produktivbetrieb", amp("schwarz"),
             "0 Nutzer, 0 HTTP-Aufrufe in 24 h. Kein Softwarefehler, aber auch kein Betriebsnachweis."],
        ],
        [3.9 * cm, 2.9 * cm, 10.2 * cm]))

    e.append(P("3.1 Maschinerie ohne Bedienung — vier belegte Lücken", "h2"))
    e.append(tabelle(
        ["Modul", "Server", "App", "Schaden bei Nichtvorhandensein"],
        [["sync_conflicts", "vorhanden", "fehlt",
          "<b>Am teuersten.</b> Erkannter Konflikt liegt unsichtbar → stillschweigend unvollständige "
          "Pflegedokumentation, fällt erst beim Kostenträger auf."],
         ["device_sessions", "vorhanden", "fehlt",
          "„Auf welchen Geräten bin ich angemeldet?“ ist eine Sicherheitsfunktion; "
          "Diensthandy-Wechsel ist Alltag."],
         ["location_review_logs", "vorhanden", "fehlt",
          "Standort-Ampel wird gezeigt, die Klärung einer Abweichung ist nicht festhaltbar."],
         ["QM-Modul (3 Tabellen)", "vorhanden", "fehlt",
          "<b>Kein Rückstand</b> — ausdrücklich Phase 3 laut README."]],
        [3.4 * cm, 1.9 * cm, 1.5 * cm, 10.2 * cm]))

    # 4 ────────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("4. ChairMatch — Detail", "h1"))
    e.append(P("Marktplatz für Stuhlmiete und Behandlungsräume · Next.js 15.5.20 · Vercel · Supabase", "klein"))
    e.append(tabelle(
        ["Bereich", "Status", "Beleg"],
        [
            ["Git / Typecheck / Lint", amp("gruen"), "Sauber, synchron; tsc Exit 0; 0 Fehler, 13 Warnungen."],
            ["Tests", amp("gruen"), "96 Dateien, <b>1.821 Tests, alle grün</b>, Exit 0."],
            ["Build", amp("gruen"),
             "Mit Service-Key <b>342/342 Seiten, Exit 0</b>. Lokaler Fehlschlag ohne Key ist Umgebung, "
             "kein Codefehler — Produktion antwortet 200 mit x-nextjs-prerender: 1."],
            ["Sicherheit / anon-Sperren", amp("gruen"),
             "Produktionssonde <b>21 von 21 Erwartungen erfüllt</b>; Negativtest 0 von 9 durchgefallen."],
            ["Website (öffentlich)", amp("gruen"), "27 von 28 geprüften Routen antworten wie erwartet."],
            ["Kalender / Verfügbarkeit", amp("gruen"), "Live geprüft, 33 echte Slots aus Öffnungszeiten."],
            ["Anti-Bypass / Bewertungen", amp("gruen"), "Implementiert, getestet, live funktionsfähig."],
            ["Mietsuche-API", amp("rot"),
             "<b>/api/rental-listings antwortet anonym 401</b> — heute erneut gemessen. Route ist als "
             "öffentlich gebaut, fehlt in der Middleware-Positivliste. Drei Mieter-Seiten laufen ins Leere."],
            ["Stripe", amp("rot"),
             "<b>In Produktion nicht konfiguriert</b> — heute gemessen: 500 „Webhook not configured“, "
             "kein pk_-Schlüssel in 2 MB Live-Bundle. Jede Geldstrecke tot."],
            ["Abo-Modell", amp("rot"),
             "Hängt vollständig an Stripe. Zwei widersprüchliche Stufen-Vokabulare; "
             "tierForPriceId() liefert immer null."],
            ["Rechnungen", amp("rot"), "<b>Existiert nicht</b> — kein Beleg-, Rechnungs- oder PDF-Pfad."],
            ["KYC", amp("rot"), "<b>Existiert nicht</b> — Volltextsuche „kyc“ in src/: 0 Treffer."],
            ["Datenbank-Inhalt", amp("rot"),
             "<b>Alle 15 Salons sind Seed-Daten</b> (fortlaufend konstruierte UUIDs), 1 Buchung, "
             "48 Bewertungen. Dazu 16 erfundene Anbieter aus demo-data.ts, die live mitlaufen."],
            ["Migrationen", amp("rot"), "3 committet und nicht angewendet; kein Runner, kein DB-Zugang."],
            ["Preise / Provision", amp("gelb"),
             "7 Codestellen sauber markiert; <b>~155 literale Preisangaben auf 18 öffentlichen Seiten "
             "sind unmarkiert und live</b>."],
            ["Analytics", amp("gelb"),
             "Sentry live scharf; <b>GA4 und Meta-Pixel ausgeliefert, aber ohne IDs</b> → wirkungslos."],
        ],
        [3.7 * cm, 2.8 * cm, 10.5 * cm]))

    e.append(P("4.1 Der Satz, der so nicht stehen bleiben kann", "h2"))
    e.append(P(
        "Auf <font name='%s'>/preisvergleich</font> steht live: „Live-Marktpreise aus echten "
        "Inseraten“. Die Zahlen sind hartkodiert im Seitenquelltext. Es gibt 15 Seed-Salons und "
        "1 Buchung. <b>Die Formulierung beschreibt nichts, was existiert.</b> Dazu auf der "
        "öffentlichen Anbieter-Registrierung Verdienstversprechen wie „ca. 250–500 €/Tag“ "
        "ohne Quelle und ohne Marker. Das ist keine technische, sondern eine Wahrhaftigkeitsfrage." % NORMAL, "p"))

    # 5 ────────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("5. Security", "h1"))
    e.append(tabelle(
        ["Projekt", "Status", "Belegte Lage"],
        [["Alltagsengel", amp("gruen"),
          "Letzter Code-Commit ist ein Security-Fix (392bbe42, AUTH-005: Engel-Validierung + "
          "Fahrer-Enumerationsschutz). CI erzwingt Secret-Scan, IK-Hardcoding-Check, Mandanten-Lint "
          "(organization_id), Rollenquellen-Lint, Browser-Bundle-Lint und RLS-Sichtbarkeits-Lint."],
         ["efy care", amp("gruen"),
          "<b>48/48 Tabellen mit RLS</b>, 121 Policies, 190 Trigger. 16 Security-Testdateien, alle grün. "
          "Produktiv anonym gegengeprüft. Profil-Erzeugung serverseitig über Trigger abgesichert "
          "(SECURITY DEFINER, REVOKE EXECUTE FROM PUBLIC)."],
         ["ChairMatch", amp("gruen"),
          "21/21 Sonden erfüllt: geschützte Seiten 307, Admin-Schnittstellen 401, anon auf gesperrten "
          "Tabellen 401. NextAuth mit __Secure-Präfix, 2FA (TOTP), Sitzungswiderruf, CSP mit Nonce, "
          "HSTS preload, SSRF-Positivliste, RFC-8291-Push-Verschlüsselung."]],
        [3.0 * cm, 2.7 * cm, 11.3 * cm]))
    e.append(Spacer(1, 6))
    e.append(P("5.1 Was ausdrücklich NICHT geprüft wurde", "h2"))
    e.append(tabelle(
        ["Projekt", "Ungeprüft", "Grund"],
        [["ChairMatch", amp("schwarz", "RLS gegen Rolle <font name='%s'>authenticated</font>" % NORMAL),
          "Alle Sonden liefen mit dem anon-Schlüssel. Der eigentliche Schaden läge bei "
          "<font name='%s'>authenticated</font> — braucht ein echtes Nutzer-JWT." % NORMAL],
         ["ChairMatch", amp("schwarz", "Die gemeldeten „6 service_role-Policies“"),
          "Dienstschlüssel antwortet 401, psql blockiert, kein Eintrag in Repo oder Ledger. "
          "Falls im Dashboard gemacht: bei einem Rebuild verloren."],
         ["efy care", amp("schwarz", "Prod-Schema-Gleichheit"),
          "Bewiesen ist „Repo ⊆ Produktion“, nicht Gleichheit. Spaltentypen, Nullability, "
          "Policies und Trigger ungeprüft — braucht service_role."],
         ["Alltagsengel", amp("schwarz", "Vercel-Umgebungsvariablen"),
          "Kein Vercel-Login in der Sitzung. Alle ENV-Aussagen gelten für die lokale Umgebung."]],
        [3.0 * cm, 5.4 * cm, 8.6 * cm]))

    # 6 ────────────────────────────────────────────────────────────────────
    e.append(P("6. CI/CD", "h1"))
    e.append(tabelle(
        ["Projekt", "Letzter Lauf", "Ergebnis", "Was die Pipeline prüft"],
        [["Alltagsengel", "33984530072", amp("gruen", "success"),
          "Typecheck, Lint, vitest, node:test, Secret-Scan, IK-Check, 6 Spezial-Lints, Build, "
          "<b>vollständige Playwright-Suite (154 passed)</b>."],
         ["efy care", "33982106091", amp("gruen", "success"),
          "Typecheck, Lint, deno check, vitest, TruffleHog, IK-Check, expo export web. "
          "Gehärtet: permissions read, timeout 30 min, concurrency."],
         ["ChairMatch", "33949781013", amp("gruen", "success"),
          "tsc, vitest, lint. <b>Prüft NICHT:</b> next build und Playwright — der einzige Build "
          "läuft auf Vercel."]],
        [3.0 * cm, 2.7 * cm, 2.5 * cm, 8.8 * cm]))
    e.append(Spacer(1, 6))
    e.append(P(
        "<b>Zwei Randbefunde, die man kennen muss.</b> Bei efy care ist Branch Protection technisch "
        "nicht aktivierbar (HTTP 403, Plan-Grenze) — der „Required Status Check“ existiert "
        "heute nicht. Bei ChairMatch merged <font name='%s'>auto-create-pr.yml</font> <b>jeden Push auf "
        "einen claude/**-Branch ohne Review nach main</b> und löst damit einen Produktionsdeploy aus; "
        "13 verwaiste Branches liegen bereit, der jüngste vom 25.05.2026." % NORMAL, "p"))

    # 7 ────────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("7. Datenbanken", "h1"))
    e.append(tabelle(
        ["Projekt", "Schema-Stand", "Status", "Offene Migrationen"],
        [["Alltagsengel", "471 Migrationsdateien", amp("gelb"),
          "<b>5 von 37 geprüften stehen nicht live</b> — alles DB-Riegel im Pflegemodul: "
          "Vitalwerte-Plausibilität, ein aktiver Maßnahmenplan, Medikamenten-Sperre, "
          "Wund-Kindtabellen, Rückdatierungssperre."],
         ["efy care", "44 Migrationsdateien", amp("gruen"),
          "<b>0 fehlend.</b> 48/48 Tabellen, 69/69 Funktionen produktiv belegt. Shadow-DB baut das "
          "Schema aus dem Repo allein auf (PGlite, kein Netz)."],
         ["ChairMatch", "41 Migrationsdateien", amp("rot"),
          "<b>3 committet, nicht angewendet</b> (CM23-Schema, CM24, P3-RLS). Kein Runner, kein "
          "DB-Zugang. Und: supabase/migrations ist hier <b>nicht</b> die Wahrheit — maßgeblich "
          "sind schema-probe.sh und live-schema.ts."]],
        [3.0 * cm, 3.4 * cm, 2.4 * cm, 8.2 * cm]))
    e.append(Spacer(1, 6))
    e.append(P(
        "<b>Gemeinsame Ursache bei Alltagsengel und ChairMatch:</b> DDL scheitert über den "
        "Dienstschlüssel grundsätzlich am Eigentümer (Fehler 42501). Beide Migrationsstapel "
        "brauchen einen Menschen im Supabase-SQL-Editor als <font name='%s'>postgres</font>. "
        "Das ist keine Bequemlichkeitsfrage, sondern eine harte Berechtigungsgrenze." % NORMAL, "p"))

    # 8 ────────────────────────────────────────────────────────────────────
    e.append(P("8. Deployments", "h1"))
    e.append(tabelle(
        ["Projekt", "Ziel", "Auslöser", "Cron-Jobs", "Status"],
        [["Alltagsengel", "alltagsengel.care (Vercel, fra1)", "Push auf main", "12", amp("gelb")],
         ["efy care", "Supabase Edge Functions + Expo", "manuell / EAS", "—", amp("rot")],
         ["ChairMatch", "www.chairmatch.de (Vercel)", "Push auf main", "3", amp("gruen")]],
        [3.0 * cm, 6.0 * cm, 3.2 * cm, 2.0 * cm, 2.8 * cm]))
    e.append(Spacer(1, 6))
    e.append(P(
        "<b>Alltagsengel steht auf Gelb, obwohl der Deploy sauber läuft:</b> alle zwölf Cron-Jobs "
        "sind in <font name='%s'>vercel.json</font> registriert und haben jeweils einen existierenden "
        "Endpunkt — aber ohne <font name='%s'>CRON_SECRET</font> weist "
        "<font name='%s'>pruefeCronGeheimnis</font> jeden Aufruf ab. Zwölf korrekt eingerichtete "
        "Zeitpläne laufen ins Leere. <b>efy care steht auf Rot</b>, weil ohne Expo-Login überhaupt "
        "kein nativer Produktions-Build entstehen kann." % (NORMAL, NORMAL, NORMAL), "p"))
    e.append(P(
        "Bei den Deploy-Skripten gibt es einen belegten Qualitätsunterschied: das "
        "<font name='%s'>deploy.sh</font> von Alltagsengel <b>blockiert</b> bei Typecheck-Fehlern, das "
        "von ChairMatch ist mit <font name='%s'>|| echo</font> verkettet und damit nur warnend — "
        "genau daraus ist dort ein Build-Bruch entstanden." % (NORMAL, NORMAL), "p"))

    # 9 ────────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("9. Externe Blocker", "h1"))
    e.append(P(
        "<b>Kein einziger dieser Punkte ist eine Codeänderung.</b> Alle brauchen einen Menschen "
        "mit Zugangsdaten. Sie sind der eigentliche Grund, warum drei technisch grüne Projekte "
        "nicht produktiv Geld bewegen.", "p"))
    e.append(tabelle(
        ["#", "Blocker", "Projekt", "Heute gemessen?", "Beleg"],
        [["B1", "§45a-Frist 31.08.2026 abgelaufen", "AE", "ja (Aktenlage)",
          "ANERKENNUNGS-STATUS: FRIST NACHREICHUNG 31.08.2026 — seit 9 Tagen überschritten."],
         ["B2", "Gewerbeanmeldung fehlt", "AE", "ja",
          "docs/genehmigung/04_Gewerbeanmeldung.pdf trägt ausdrücklich „PLATZHALTER — FEHLT“."],
         ["B3", "Haftpflicht-Police fehlt", "AE", "ja",
          "docs/genehmigung/07_Haftpflichtversicherung.pdf ebenso Platzhalter. Versicherung besteht "
          "(5 Mio.), die Police als PDF fehlt."],
         ["B4", "3 ENV-Schalter fehlen", "AE", "ja",
          "verify:versand: CRON_SECRET, RECHNUNGSVERSAND_AUTOMATISCH, MAHNVERSAND_AUTOMATISCH — alle FEHLT."],
         ["B5", "STRIPE_WEBHOOK_SECRET fehlt", "efy", "ja",
          "HTTP 500 „STRIPE_WEBHOOK_SECRET ist nicht konfiguriert.“"],
         ["B6", "OCR abgeschaltet", "efy", "ja", "HTTP 503 — OCR_ENABLED und/oder ANTHROPIC_API_KEY fehlt."],
         ["B7", "Kein Expo/EAS-Login", "efy", "ja", "~/.expo/state.json: auth leer, kein sessionSecret."],
         ["B8", "Kein Supabase-Access-Token", "efy", "ja", "$SUPABASE_ACCESS_TOKEN nicht gesetzt; CLI 2.113.0 da."],
         ["B9", "Stripe komplett unkonfiguriert", "CM", "ja",
          "HTTP 500 „Webhook not configured“; kein pk_ in 2 MB Live-Bundle. 6 ENV fehlen."],
         ["B10", "Keine echten Anbieter", "CM", "ja",
          "15 Seed-Salons mit konstruierten UUIDs, 1 Buchung, 48 Bewertungen. Akquise, keine Technik."]],
        [1.0 * cm, 4.3 * cm, 1.4 * cm, 2.3 * cm, 8.0 * cm]))

    # 10 ───────────────────────────────────────────────────────────────────
    e.append(P("10. Tech Debt", "h1"))
    e.append(tabelle(
        ["Projekt", "Schuld", "Wirkung", "Status"],
        [["AE", "/admin/applications liest tote Tabelle",
          "47 Bewerbungen unsichtbar; wer im Admin-Menü sucht, schließt auf „keine“.", amp("rot")],
         ["AE", "37 verwaiste Branches", "Altlast, kein Funktionsrisiko.", amp("gelb")],
         ["AE", "table:profiles 913 ms > 800 ms Budget",
          "/api/health meldet dauerhaft „degraded“, obwohl alle 5 Checks passen.", amp("gelb")],
         ["efy", "4 Servermodule ohne Bedienoberfläche",
          "Wer das Schema liest, hält die Funktionen für vorhanden.", amp("gelb")],
         ["efy", "6 offene Dependabot-PRs (#4 rot)", "Expo-SDK-Gruppe seit 5 Wochen offen.", amp("gelb")],
         ["efy", "Leere Streu-app.json im Repo-Root",
          "Verwechslungsfalle — die echte Konfiguration ist app/app.json.", amp("gelb")],
         ["CM", "~155 unmarkierte Preisangaben live",
          "Marktpreis-Behauptungen und Verdienstversprechen ohne Quelle.", amp("rot")],
         ["CM", "auto-create-pr.yml merged ohne Review",
          "Ein Push auf einen 3 Monate alten Branch deployt in Produktion.", amp("rot")],
         ["CM", "Zwei Auth-Systeme parallel",
          "/konto meldet über supabase.auth an, das Backend prüft NextAuth.", amp("gelb")],
         ["CM", "Widersprüchliches Abo-Vokabular",
          "free vs. starter; SUBSCRIPTION_TIERS ist tote Konfiguration.", amp("gelb")],
         ["CM", "deploy.sh-Typecheck ist warn-only",
          "Blockt nicht — hat nachweislich schon einen Build gebrochen.", amp("gelb")],
         ["CM", "Playwright läuft in keiner Automatisierung",
          "4 Spec-Dateien vorhanden, weder in CI noch in deploy.sh.", amp("gelb")]],
        [1.4 * cm, 5.0 * cm, 8.2 * cm, 2.4 * cm]))

    # 11 ───────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("11. Nächste Arbeiten", "h1"))
    e.append(P(
        "Nach Wirkung sortiert, nicht nach Aufwand. Die Reihenfolge und die Zuständigkeiten stehen "
        "ausführlich im begleitenden <b>Master-Aktionsplan</b>.", "p"))
    e.append(tabelle(
        ["Rang", "Arbeit", "Projekt", "Wer", "Warum jetzt"],
        [["1", "Fristverlängerung §45a beantragen", "AE", "Yusuf",
          "Frist seit 9 Tagen abgelaufen — jeder weitere Tag erhöht das Ablehnungsrisiko."],
         ["2", "3 ENV-Schalter in Vercel setzen", "AE", "Yusuf",
          "Schaltet 12 Cron-Jobs und die gesamte Rechnungs-/Mahnkette frei."],
         ["3", "/admin/applications umstellen", "AE", "Agent",
          "47 Bewerbungen werden sichtbar; kleine, klar umrissene Änderung."],
         ["4", "5 Pflegemodul-Migrationen anwenden", "AE", "Yusuf",
          "Ohne sie hängt das Pflegemodul allein an TypeScript-Prüfungen."],
         ["5", "rental-listings in publicPaths", "CM", "Agent",
          "Ein Eintrag plus eine Testzeile — drei öffentliche Seiten funktionieren wieder."],
         ["6", "Stripe für alle drei einrichten", "alle", "Yusuf",
          "Ein Konto, drei Produktgruppen. Ohne Stripe bewegt keines der drei Projekte Geld."],
         ["7", "Fehlende Stadtseiten anlegen", "AE", "Agent",
          "Maintal, Bad Vilbel, Main-Taunus — heute gegengeprüft: alle drei fehlen."],
         ["8", "Genehmigungsmappe unterschreiben", "AE", "Yusuf",
          "12 Unterschriften + 4 offene Felder im Arbeitsvertrag."],
         ["9", "CM-Preisangaben wahrheitsgemäß fassen", "CM", "Yusuf",
          "„Live-Marktpreise aus echten Inseraten“ beschreibt nichts, was existiert."],
         ["10", "sync_conflicts sichtbar machen", "efy", "Agent",
          "Teuerste der vier Bedienlücken — unbemerkt unvollständige Dokumentation."]],
        [1.2 * cm, 4.6 * cm, 1.5 * cm, 1.5 * cm, 8.2 * cm]))

    # 12 ───────────────────────────────────────────────────────────────────
    e.append(PageBreak())
    e.append(P("12. Git-Commits", "h1"))
    e.append(P(
        "<font name='%s'>git log --oneline -10</font> je Repository, erhoben beim Erzeugen dieses "
        "Dokuments. Lange Commit-Betreffs sind auf 104 Zeichen gekürzt (mit … markiert) — "
        "vor allem efy care und ChairMatch führen mehrsätzige Betreffzeilen." % NORMAL, "klein"))

    e.append(P("12.1 Alltagsengel — HEAD %s" % H_AE[:12], "h2"))
    e.append(codeblock(git_log(AE)))
    e.append(Spacer(1, 8))
    e.append(P("12.2 efy care — HEAD %s" % H_EFY[:12], "h2"))
    e.append(codeblock(git_log(EFY)))
    e.append(Spacer(1, 8))
    e.append(P("12.3 ChairMatch — HEAD %s" % H_CM[:12], "h2"))
    e.append(codeblock(git_log(CM)))
    e.append(Spacer(1, 8))
    e.append(P(
        "<b>Alle drei Repositories sind mit ihrem Remote synchron</b> "
        "(<font name='%s'>git rev-list --left-right --count</font> → je <b>0 0</b>). "
        "Bei Alltagsengel ist die Kette darüber hinaus bis in die Produktion belegt: "
        "<font name='%s'>/api/health</font> meldete beim Audit die Revision, die auch lokal lag." % (NORMAL, NORMAL), "p"))

    # 13 ───────────────────────────────────────────────────────────────────
    e.append(P("13. Nachweise", "h1"))
    e.append(P("13.1 Quellberichte dieses Tages", "h2"))
    e.append(tabelle(
        ["Bericht", "Umfang", "Gegenstand"],
        [["alltagsengel/docs/reports/ALLTAGSENGEL_STATUS_AUDIT_09_09_2026.md", "725 Zeilen",
          "Vollaudit AE, Commit 321ccaae"],
         ["alltagsengel/docs/reports/MARKETING_RESTART_09_09_2026.md", "239 Zeilen",
          "SEO, Contentplan, Automatisierung, Commit abb93cfb"],
         ["efy-care/docs/reports/EFY_CARE_STATUS_AUDIT_09_09_2026.md", "591 Zeilen",
          "Vollaudit efy, Commit 42523d1"],
         ["chairmatch/docs/reports/CHAIRMATCH_STATUS_AUDIT_09_09_2026.md", "870 Zeilen",
          "Vollaudit CM, Commit d523e67"],
         ["alltagsengel/docs/genehmigung/ (25 Dokumente)", "Commit aac2b162",
          "Genehmigungsmappe §45a inkl. Statusbericht"]],
        [8.4 * cm, 2.8 * cm, 5.8 * cm]))

    e.append(P("13.2 Heute erneut live gegengeprüft", "h2"))
    e.append(codeblock("""
$ curl -o /dev/null -w '%{http_code}' https://www.chairmatch.de/api/rental-listings
401

$ curl -X POST https://www.chairmatch.de/api/stripe/webhook -H 'stripe-signature: t=1,v1=00' -d '{}'
HTTP 500  {"error":"Webhook not configured"}

$ curl -X POST https://nsfbwhpjesmathsrqkfi.supabase.co/functions/v1/stripe-webhook \\
       -H 'stripe-signature: t=1,v1=ungueltig' -d '{}'
HTTP 500  {"error":"STRIPE_WEBHOOK_SECRET ist nicht konfiguriert."}

$ npm run verify:versand           # im Repo alltagsengel
RECHNUNGSVERSAND_AUTOMATISCH   FEHLT
MAHNVERSAND_AUTOMATISCH        FEHLT
CRON_SECRET                    FEHLT

$ pdftotext docs/genehmigung/04_Gewerbeanmeldung.pdf -
PLATZHALTER — FEHLT, beim Gewerbeamt Frankfurt am Main beantragen (§ 14 Abs. 1 GewO)
"""))

    e.append(P("13.3 Grenzen dieses Berichts", "h2"))
    e.append(P(
        "%s Die Vercel-Umgebungsvariablen aller drei Projekte wurden <b>nicht</b> gelesen — kein "
        "Vercel-Login in dieser Sitzung. Aussagen zu ENV-Schaltern beziehen sich auf die jeweils "
        "lokale Umgebung und auf das, was die Produktion über ihr Verhalten preisgibt (HTTP 500/503 "
        "sind dabei belastbare Belege, weil der Code die Zustände selbst unterscheidet)." % amp("schwarz", ""), "p"))
    e.append(P(
        "%s Der Status des Google-Ads-Kontos wurde nicht geprüft und nichts daran verändert. "
        "<b>GOOGLE_ADS_AUTOMATIC_ACTIVATION bleibt FORBIDDEN.</b> Festzuhalten ist allerdings, was das "
        "Statusaudit gemessen hat: der Ads-<i>Code</i> ist bei Alltagsengel keineswegs inaktiv — "
        "gtag.js ist im Root-Layout eingehängt, zehn Stellen feuern Conversions, und die Tabelle "
        "conversions führt 52 Zeilen. Begrenzt wird er allein durch Consent Mode v2." % amp("schwarz", ""), "p"))
    e.append(P(
        "%s Bei ChairMatch bleibt das RLS-Verhalten gegenüber der Rolle "
        "<font name='%s'>authenticated</font> ungemessen, ebenso die gemeldeten sechs "
        "service_role-Policies. Beides braucht Zugangsdaten, die in dieser Sitzung nicht vorlagen." % (amp("schwarz", ""), NORMAL), "p"))
    e.append(Spacer(1, 10))
    e.append(P(
        "<i>Erstellt am 09.09.2026 aus vier Quellberichten desselben Tages, ergänzt um eigene "
        "Live-Gegenproben. In diesem Lauf wurde kein Produktivcode geändert, keine Migration "
        "angewendet, kein Secret gesetzt, kein Stripe-Konto angelegt und keine Werbekampagne "
        "aktiviert. Schrift: DejaVuSans.</i>", "klein"))
    return e


# ══════════════════════════════════════════════════════════════════════════
#  PDF 2 — MASTER AKTIONSPLAN
# ══════════════════════════════════════════════════════════════════════════
SCHRITTE = [
    dict(
        nr=1, titel="Fristverlängerung §45a beantragen — Frau Krause",
        proj="Alltagsengel", wer="Yusuf", dauer="10 Minuten (Anruf)", ampel="rot",
        lage="Die Nachreichfrist der Behörde war der <b>31.08.2026</b>. Heute ist der 09.09.2026 — "
             "die Frist ist seit <b>9 Tagen abgelaufen</b>, und die Nachreichung ist bis heute nicht "
             "erfolgt, weil Gewerbeanmeldung und Haftpflicht-Police fehlen (Schritte 2 und 3).",
        tun=["Frau Krause anrufen: <b>069/212-33607</b> (Jugend- und Sozialamt Frankfurt, "
             "Leitstelle Älterwerden, Hansaallee 150).",
             "Aktenzeichen nennen: <b>51.D24.12</b>, Anbieterform II (gewerblich Tätige).",
             "Sachlich begründen: Gewerbeanmeldung und Haftpflicht-Police sind extern angefordert "
             "und noch nicht eingetroffen; alle übrigen 23 Unterlagen liegen vor.",
             "Neue Frist schriftlich bestätigen lassen — per E-Mail an "
             "<b>entlastungsangebote45@stadt-frankfurt.de</b>, damit sie belegbar ist.",
             "Das Telefonat mit Datum und Ergebnis in ANERKENNUNGS-STATUS.md nachtragen."],
        beleg="anerkennung-hessen/ANERKENNUNGS-STATUS.md: „FRIST NACHREICHUNG 31.08.2026“ · "
              "docs/genehmigung/GENEHMIGUNGS_STATUS_09_09_2026.pdf: „ANTRAG HEUTE EINREICHBAR: NEIN — "
              "FRIST 31.08.2026 ABGELAUFEN“",
        risiko="<b>Höchste Dringlichkeit im gesamten Plan.</b> Eine verstrichene Frist ohne Meldung "
               "kann zur Ablehnung des Antrags führen. Ein Anruf heute ist billiger als ein neuer "
               "Antrag. Ohne §45a-Anerkennung darf gegenüber Kunden keine Abrechenbarkeit über "
               "den Entlastungsbetrag zugesagt werden — das begrenzt jede Vertriebsaussage."),
    dict(
        nr=2, titel="Gewerbeanmeldung: Sachstand klären und beschaffen",
        proj="Alltagsengel", wer="Yusuf", dauer="20 Min. online / 1 Termin", ampel="rot",
        lage="Die Behörde hat die Gewerbeanmeldung in ihrer Rückmeldung vom 08.07.2026 "
             "<b>ausdrücklich angefordert</b>. Im Repo liegt dafür nur ein als solcher "
             "gekennzeichneter Platzhalter. Es ist unklar, ob nie beantragt wurde oder ob ein "
             "Vorgang läuft — eine Bestätigung per E-Mail wurde nicht gefunden.",
        tun=["Zuerst Sachstand klären: Gewerbeamt Frankfurt, Kleyerstraße 86, 60326 Frankfurt — "
             "gibt es einen laufenden Vorgang zur Alltagsengel UG?",
             "Falls nein: Gewerbeanmeldung nach §14 Abs. 1 GewO stellen (online über frankfurt.de "
             "oder persönlich). Für eine UG ist sie Pflicht.",
             "Gewerbeschein als PDF unter <b>docs/genehmigung/04_Gewerbeanmeldung.pdf</b> ablegen — "
             "der Platzhalter ist genau dafür vorgesehen.",
             "Die vorbereitete SACHSTANDSANFRAGE_GEWERBEANMELDUNG.pdf nutzen, statt neu zu formulieren."],
        beleg="docs/genehmigung/04_Gewerbeanmeldung.pdf, ausgelesen: „⚠ PLATZHALTER ⚠ — "
              "FEHLT, beim Gewerbeamt Frankfurt am Main beantragen (§14 Abs. 1 GewO)“",
        risiko="Blockiert Schritt 1 inhaltlich: ohne dieses Dokument bleibt die Nachreichung "
               "unvollständig, egal wie lange die Frist verlängert wird. <b>Hinweis aus der "
               "Aktenlage:</b> Die PfluV erlaubt in §9 Abs. 1 Nr. 3a alternativ die Gewerbeanzeige — "
               "das ist beim Anruf nach Schritt 1 zu erfragen, es könnte den Weg abkürzen."),
    dict(
        nr=3, titel="Haftpflicht-Police als PDF anfordern",
        proj="Alltagsengel", wer="Yusuf", dauer="1 E-Mail + Wartezeit", ampel="rot",
        lage="Die Betriebshaftpflicht ist nach bisherigem Stand <b>abgeschlossen</b> (5 Mio. € "
             "Deckung). Was fehlt, ist die Police beziehungsweise Deckungsbestätigung als Dokument. "
             "Auch hier liegt im Repo nur ein Platzhalter.",
        tun=["Versicherer anschreiben und Police oder Deckungsbestätigung als PDF anfordern.",
             "Prüfen, dass Versicherungsnehmerin die <b>Alltagsengel UG (haftungsbeschränkt)</b> "
             "ist — nicht eine Privatperson.",
             "Deckungssumme und Laufzeit müssen aus dem Dokument hervorgehen.",
             "Als <b>docs/genehmigung/07_Haftpflichtversicherung.pdf</b> ablegen und den Platzhalter ersetzen."],
        beleg="docs/genehmigung/07_Haftpflichtversicherung.pdf: „PLATZHALTER — FEHLT, "
              "Police/Deckungsbestätigung von der Versicherung anfordern (5 Mio. € Deckung)“",
        risiko="Wie Schritt 2 von der Behörde ausdrücklich angefordert. Der Unterschied: hier "
               "existiert die Sache bereits, es fehlt nur das Papier — das ist der schnellste der "
               "drei Genehmigungspunkte und sollte deshalb zuerst angestoßen werden."),
    dict(
        nr=4, titel="Drei Umgebungsvariablen in Vercel setzen",
        proj="Alltagsengel", wer="Yusuf", dauer="5 Minuten", ampel="rot",
        lage="Heute erneut gemessen: <b>CRON_SECRET</b>, <b>RECHNUNGSVERSAND_AUTOMATISCH</b> und "
             "<b>MAHNVERSAND_AUTOMATISCH</b> fehlen. Folge: alle <b>zwölf</b> in vercel.json "
             "registrierten Cron-Jobs werden von pruefeCronGeheimnis abgewiesen, und es geht keine "
             "Rechnung und keine Mahnung automatisch raus — invoice_email_log steht auf 0.",
        tun=["Vercel → Projekt Alltagsengel → Settings → Environment Variables (Production).",
             "<b>CRON_SECRET</b>: langen Zufallswert erzeugen und setzen. Ohne ihn ist der Rest wirkungslos.",
             "<b>RECHNUNGSVERSAND_AUTOMATISCH=1</b> und <b>MAHNVERSAND_AUTOMATISCH=1</b> setzen.",
             "Redeploy auslösen — ENV-Änderungen greifen erst im nächsten Deployment.",
             "Danach <font name='%s'>npm run verify:versand</font> laufen lassen: erwartet wird "
             "„GESETZT“ statt „FEHLT“, und invoice_email_log muss zu wachsen beginnen." % NORMAL],
        beleg="npm run verify:versand (09.09.2026): alle drei Schalter „FEHLT“ · Resend selbst ist "
              "intakt: Schlüssel gültig, alltagsengel.care status=verified, DKIM/SPF stehen",
        risiko="<b>Beste Wirkung je Minute im ganzen Plan.</b> Fünf Minuten Arbeit schalten die "
               "komplette Rechnungs-, Mahn- und Automatisierungskette frei, die bereits gebaut, "
               "getestet und mit 12/12 Stationen gegen die Produktionsdatenbank belegt ist. "
               "Vorsicht bei der Reihenfolge: erst CRON_SECRET, sonst laufen die Jobs weiter ins Leere."),
    dict(
        nr=5, titel="/admin/applications auf lead_inquiries umstellen",
        proj="Alltagsengel", wer="Agent", dauer="ca. 1 Stunde", ampel="rot",
        lage="Die Seite liest <font name='%s'>supabase.from('applications')</font>. Diese Tabelle führt "
             "live <b>0 Zeilen</b> und ist laut der eigenen Migration 20261027000000 bewusst tot. Die "
             "echten Bewerbungen — <b>47 Stück</b> — liegen in lead_inquiries und sind heute nur "
             "unter /mis/crm sichtbar." % NORMAL,
        tun=["Entscheiden: umstellen oder entfernen. <b>Empfehlung: umstellen</b>, weil das Admin-Menü "
             "der Ort ist, an dem gesucht wird.",
             "app/admin/applications/page.tsx auf lead_inquiries umstellen, gefiltert auf Bewerbungen "
             "(die Migration hat dafür Spalten und einen Teil-Unique-Index angelegt).",
             "Mandantenzaun beachten: organization_id mitführen, sonst greift der Fence nicht.",
             "Alternativ die Seite entfernen und im Menü auf /mis/crm verweisen — aber dann "
             "vollständig, nicht halb.",
             "Test ergänzen, der eine Bewerbung anlegt und ihre Sichtbarkeit in der Verwaltung prüft."],
        beleg="app/admin/applications/page.tsx:44 · PostgREST: applications content-range */0, "
              "lead_inquiries 0-0/47 · Migration 20261027000000: „Sie ist im Code praktisch tot“",
        risiko="Der Schaden ist bereits eingetreten und unsichtbar: <b>47 Bewerbungen und Anfragen "
               "warten</b>, während die Verwaltungsoberfläche eine leere Liste zeigt. Bei "
               "Personalmangel ist das der teuerste stille Fehler im Bestand. Zusätzlich führt der "
               "Marketing-Restart-Bericht diese Seite fälschlich als funktionsfähig — auch das "
               "gehört korrigiert."),
    dict(
        nr=6, titel="Fünf Pflegemodul-Migrationen live schalten",
        proj="Alltagsengel", wer="Yusuf", dauer="15 Minuten", ampel="gelb",
        lage="32 von 37 geprüften Migrationen stehen live, <b>5 nicht</b>. Alle fünf sind "
             "DB-seitige Riegel im Pflegemodul. Solange sie fehlen, hängt die Absicherung allein "
             "an den TypeScript-Prüfungen — ein direkter Datenbankzugriff umginge sie.",
        tun=["Supabase-SQL-Editor öffnen und als <b>postgres</b> anmelden (nicht service_role).",
             "In dieser Reihenfolge anwenden: 20261008000000_vitalwerte_plausibilitaet_db_check · "
             "20261009000000_pflege_massnahmenplaene_ein_aktiver_plan · "
             "20261010000000_medikamente_abgesetzt_sperre_db · "
             "20261010000002_wund_kindtabellen_sperre_db · "
             "20261010000004_pflege_verlauf_backdating_sperre_db",
             "Danach <font name='%s'>npm run check:migrationen</font> — erwartet: 37 von 37 ✅, "
             "0 offen." % NORMAL],
        beleg="npm run check:migrationen (09.09.2026): „5 MIGRATION(EN) STEHEN NICHT LIVE“ · "
              "DDL scheitert über den Dienstschlüssel grundsätzlich am Eigentümer (42501), "
              "geprüft am 31.08.2026",
        risiko="<b>Kein Agent kann diesen Schritt ausführen</b> — das ist eine harte "
               "Berechtigungsgrenze, keine Bequemlichkeitsfrage. Die Riegel betreffen Vitalwerte, "
               "Maßnahmenpläne, abgesetzte Medikamente und Rückdatierung; das sind genau die "
               "Stellen, an denen eine Pflegedokumentation vor einer Prüfung standhalten muss."),
    dict(
        nr=7, titel="ChairMatch: rental-listings in die Middleware-Positivliste",
        proj="ChairMatch", wer="Agent", dauer="15 Minuten", ampel="rot",
        lage="<font name='%s'>/api/rental-listings</font> antwortet anonym <b>401</b> — heute erneut "
             "gemessen. Die Route ist in ihrem eigenen Kopfkommentar ausdrücklich als öffentlich "
             "beschrieben, steht aber weder in publicPaths noch in publicPrefixes. Der Default-Deny "
             "greift. Drei öffentlich erreichbare Mieter-Seiten laufen damit ins Leere." % NORMAL,
        tun=["In src/middleware.ts <font name='%s'>'/api/rental-listings'</font> in <b>publicPaths</b> "
             "aufnehmen." % NORMAL,
             "In src/__tests__/middleware-public-paths.test.ts eine Zeile ergänzen — die Datei "
             "führt Positiv- und Negativliste, der Pfad steht in <b>keiner</b> von beiden.",
             "Nach dem Deploy live gegenprüfen: <font name='%s'>curl -o /dev/null -w '%%{http_code}' "
             "https://www.chairmatch.de/api/rental-listings</font> → erwartet <b>200</b>." % NORMAL,
             "Die drei betroffenen Seiten durchklicken: /mieter/mein-bereich/suchen, /angebote, /favoriten."],
        beleg="Live 09.09.2026: HTTP 401 {\"error\":\"Nicht authentifiziert\"} · "
              "src/app/api/rental-listings/route.ts, Kopfkommentar: „Bewusst oeffentlich (keine "
              "Session noetig)“",
        risiko="<b>Lehrstück darüber, was grüne Tests nicht sehen.</b> Die 1.821 Tests laufen "
               "grün, weil sie den Handler direkt importieren und damit an der Middleware "
               "vorbeilaufen. Der Fehler existiert nur im Zusammenspiel — genau dort, wo der Nutzer "
               "ihn trifft. Kleinster Aufwand mit sichtbarster Wirkung in diesem Plan."),
    dict(
        nr=8, titel="Stripe einrichten — ein Konto, drei Projekte",
        proj="alle drei", wer="Yusuf", dauer="2–3 Stunden", ampel="rot",
        lage="Bei <b>efy care</b> und <b>ChairMatch</b> ist heute gemessen, dass das Webhook-Secret "
             "produktiv fehlt (beide HTTP 500). Bei ChairMatch ist zusätzlich kein "
             "Publishable-Key im ausgelieferten Bundle. Damit ist bei beiden Projekten <b>jede "
             "Geldstrecke tot</b>: Checkout, Abo, Connect-Auszahlung, Erstattung. Alltagsengel "
             "braucht Stripe für B2B-Abo und PflegeCoach.",
        tun=["<b>Ein</b> Stripe-Konto für alle drei; Trennung über Produkte und Webhook-Endpunkte "
             "— so ist es in docs/reports/STRIPE_SETUP_VORBEREITUNG.md vorbereitet.",
             "<b>Testmode zuerst.</b> Produkte anlegen: AE B2B (Starter/Pro/Scale), AE PflegeCoach "
             "(monatlich/jährlich), efy (Starter/Pro/Scale), CM (Starter/Premium/Gold).",
             "Webhook-Endpunkte registrieren — <b>vier</b> Stück (AE B2B, AE Coach, efy, CM).",
             "Secrets eintragen: efy in <b>Supabase</b> (supabase secrets set), AE und CM in "
             "<b>Vercel</b>. CM braucht sechs Variablen inklusive NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.",
             "efy: nach dem Setzen <b>stripe-webhook erneut deployen</b> — sonst greifen die Secrets nicht.",
             "Gegenprobe je Projekt: der Webhook muss jetzt <b>400 „Signatur ungültig“</b> "
             "antworten statt 500 „nicht konfiguriert“. Das ist der Beweis.",
             "Erst nach erfolgreichem Testlauf auf Live-Mode wechseln und Schlüssel tauschen.",
             "<b>Offen und kaufmännisch zu entscheiden:</b> die Preise selbst. Bei AE stehen sie auf "
             "TBD, der PflegeCoach ist mit COACH_PREISE_FREIGEGEBEN=false bewusst gesperrt."],
        beleg="efy: HTTP 500 „STRIPE_WEBHOOK_SECRET ist nicht konfiguriert.“ · CM: HTTP 500 "
              "„Webhook not configured“ + kein pk_ in 2 MB Bundle · "
              "docs/reports/STRIPE_SETUP_VORBEREITUNG.md",
        risiko="Der größte Einzelblock im Plan und der einzige, der alle drei Projekte "
               "gleichzeitig betrifft. <b>Wichtig:</b> Der Code ist auf den unkonfigurierten Zustand "
               "vorbereitet und degradiert sauber (503 statt 500 an den Einstiegen, 5xx im Webhook, "
               "damit Stripe wiederholt statt zu verwerfen). Es fehlt ausschließlich die "
               "Konfiguration — kein Code."),
    dict(
        nr=9, titel="Fehlende Stadtseiten anlegen: Maintal, Bad Vilbel, Main-Taunus",
        proj="Alltagsengel", wer="Agent", dauer="ca. 2 Stunden", ampel="gelb",
        lage="Heute gegengeprüft: alle drei fehlen tatsächlich in der Stadtliste von "
             "<font name='%s'>app/alltagsbegleitung/[stadt]/page.tsx</font>. Vorhanden sind 22 Städte. "
             "Maintal und Bad Vilbel liegen unmittelbar im bestehenden Einzugsgebiet; der "
             "Main-Taunus-Kreis (Kelkheim, Hofheim) ebenfalls." % NORMAL,
        tun=["Je Stadt einen Eintrag im cities-Objekt anlegen (~30 Zeilen: Stadtteile, Nachbarn, "
             "Pflegeberatung, FAQ-Bezug) — generateStaticParams zieht sie automatisch nach.",
             "Dieselben Einträge in <font name='%s'>/krankenfahrten/[stadt]</font> und "
             "<font name='%s'>/hygienebox/[stadt]</font> ergänzen." % (NORMAL, NORMAL),
             "<font name='%s'>/engel-werden/[stadt]</font> ebenfalls erweitern — dort fehlt "
             "zusätzlich <b>Darmstadt</b>, obwohl es in alltagsbegleitung vorhanden ist." % NORMAL,
             "Sitemap prüfen (sie zieht die Routen selbst), danach "
             "<font name='%s'>npm run indexnow:ping</font> für die schnelle Indexierung." % NORMAL,
             "Keine Abrechnungsgarantie und kein §45a-Zertifikats-Claim in den Texten — die "
             "Anerkennung steht aus (Schritt 1)."],
        beleg="Geprüft 09.09.2026: maintal FEHLT, bad-vilbel FEHLT, main-taunus FEHLT · "
              "MARKETING_RESTART_09_09_2026.md führt alle drei mit Priorität HOCH",
        risiko="Reine Aufbauarbeit ohne Risiko, aber mit direktem Bezug zum Marketing-Restart: Die "
               "SEO-Grundlage ist stark (22 Stadtseiten, 41 Blogartikel, Sitemap mit echten "
               "Git-Commit-Daten). Diese drei Lücken sind die letzten offenen im Kerngebiet."),
    dict(
        nr=10, titel="Genehmigungsmappe: 12 Unterschriften und der Arbeitsvertrag",
        proj="Alltagsengel", wer="Yusuf + Fachkraft", dauer="1 Stunde", ampel="rot",
        lage="Die Mappe ist seit heute vollständig aufbereitet (25 Dokumente unter "
             "docs/genehmigung/). Was fehlt, ist Handarbeit: <b>12 Unterschriften</b> — zehn von "
             "Yusuf Ferhat Demir, zwei von der Fachkraft Sabrina Martin — und im Arbeitsvertrag "
             "sind <b>vier Felder offen</b>.",
        tun=["Alle Anlagen mit fehlender Unterschrift ausdrucken und unterschreiben: Anschreiben "
             "(01), Erhebungsbogen (00), Erklärung Führungszeugnisse (17c), Erklärung "
             "SV/Mindestlohn (17d), Datenschutzkonzept (10), Einverständnis Veröffentlichung (17f).",
             "<b>Arbeitsvertrag (17b) vervollständigen:</b> Beginn, Wochenstunden, Vergütung, "
             "Urlaubstage — dann beidseitig unterschreiben.",
             "Schweigepflichterklärung (17e) von der Fachkraft unterschreiben lassen.",
             "<b>Erhebungsbogen und erweitertes Führungszeugnis als ORIGINAL</b> einreichen, "
             "nicht als Kopie — das steht ausdrücklich in der Aktenlage.",
             "Steuernummer nachtragen, falls beim Finanzamt vorhanden. Sie war von der Behörde "
             "nicht ausdrücklich gefordert; die PfluV erlaubt in §9 Abs. 1 Nr. 3a alternativ "
             "die Gewerbeanzeige.",
             "Erst wenn Schritte 2 und 3 geliefert haben: vollständige Mappe an die Behörde."],
        beleg="docs/genehmigung/GENEHMIGUNGS_STATUS_09_09_2026.pdf: „12 Unterschriften fehlen — "
              "10× Yusuf Ferhat Demir + 2× Fachkraft (Sabrina Martin) auf Anlagen 00–13“ und "
              "„Arbeitsvertrag unvollständig — 4 Felder offen: Beginn, Stunden, Vergütung, Urlaub“",
        risiko="Dieser Schritt ist <b>nicht</b> der Engpass — Schritte 2 und 3 sind es. Aber er "
               "lässt sich heute erledigen, während auf Gewerbeamt und Versicherung gewartet wird. "
               "Wer ihn aufschiebt, verliert die Zeit doppelt: erst beim Warten, dann beim "
               "Unterschreiben."),
]


def aktionsplan():
    e = []
    e.append(P("Master-Aktionsplan", "titel"))
    e.append(P("Die zehn nächsten Schritte — 09.09.2026<br/>"
               "Alltagsengel · efy care · ChairMatch", "untertitel"))
    e.append(P(
        "Dieser Plan ist die Handlungsseite des Master-Entwicklungsstatus. Er ist nach "
        "<b>Dringlichkeit</b> sortiert, nicht nach Aufwand. Jeder Schritt trägt seinen Beleg aus "
        "den Audits vom 09.09.2026 — nichts darin ist geschätzt oder angenommen.", "p"))
    e.append(P(
        "<b>Das Muster, das dieser Plan sichtbar macht:</b> Sieben der zehn Schritte kann kein Agent "
        "ausführen. Sie brauchen einen Menschen mit Zugangsdaten — Telefon, Gewerbeamt, "
        "Versicherung, Vercel, Stripe, Supabase-SQL-Editor, Unterschrift. Die drei Schritte, die ein "
        "Agent übernehmen kann — <b>5, 7 und 9</b> — sind entsprechend markiert und "
        "können sofort beauftragt werden.", "p"))
    e.append(legende())
    e.append(Spacer(1, 8))

    e.append(P("Übersicht", "h1"))
    e.append(tabelle(
        ["#", "Schritt", "Projekt", "Wer", "Dauer", "Dringlichkeit"],
        [[str(s["nr"]), s["titel"], s["proj"], s["wer"], s["dauer"],
          amp(s["ampel"], {"rot": "sofort", "gelb": "diese Woche", "gruen": "geplant"}[s["ampel"]])]
         for s in SCHRITTE],
        [0.8 * cm, 6.0 * cm, 2.4 * cm, 2.2 * cm, 2.6 * cm, 3.0 * cm]))
    e.append(Spacer(1, 8))
    e.append(P(
        "<b>Wenn heute nur eine Stunde zur Verfügung steht:</b> Schritt 1 (Anruf, 10 Minuten), "
        "Schritt 3 (E-Mail an die Versicherung, 5 Minuten) und Schritt 4 (drei Variablen in Vercel, "
        "5 Minuten). Diese zwanzig Minuten lösen die abgelaufene Frist, stoßen das schnellste "
        "der drei fehlenden Genehmigungsdokumente an und schalten die gesamte Rechnungs- und "
        "Mahnkette von Alltagsengel frei.", "p"))

    for s in SCHRITTE:
        e.append(PageBreak())
        block = []
        block.append(P("Schritt %d — %s" % (s["nr"], s["titel"]), "h1"))
        block.append(tabelle(
            ["Projekt", "Wer", "Aufwand", "Dringlichkeit"],
            [[s["proj"], s["wer"], s["dauer"],
              amp(s["ampel"], {"rot": "sofort", "gelb": "diese Woche", "gruen": "geplant"}[s["ampel"]])]],
            [4.4 * cm, 4.0 * cm, 4.0 * cm, 4.6 * cm]))
        block.append(Spacer(1, 7))
        block.append(P("Lage", "h2"))
        block.append(P(s["lage"], "p"))
        e.append(KeepTogether(block))

        e.append(P("Was zu tun ist", "h2"))
        for i, t in enumerate(s["tun"], 1):
            e.append(Paragraph(
                '<font color="#%s"><b>%d.</b></font>&nbsp;&nbsp;%s' % (AKZENT.hexval()[2:], i, t),
                ParagraphStyle("schritt", parent=S["p"], leftIndent=13, firstLineIndent=-13, spaceAfter=4.5)))

        e.append(P("Beleg", "h2"))
        e.append(P(s["beleg"], "klein"))
        e.append(P("Warum das zählt", "h2"))
        e.append(P(s["risiko"], "p"))

    # Abschluss
    e.append(PageBreak())
    e.append(P("Was in diesem Plan bewusst NICHT steht", "h1"))
    e.append(tabelle(
        ["Nicht enthalten", "Begründung"],
        [["Google-Ads-Kampagnen aktivieren",
          "<b>GOOGLE_ADS_AUTOMATIC_ACTIVATION = FORBIDDEN.</b> Der Marketing-Restart ist "
          "ausdrücklich organisch angelegt. In den Audits wurde am Ads-Konto nichts verändert."],
         ["Abrechenbarkeit über §45b zusagen",
          "Die §45a-Anerkennung steht aus (Schritt 1). Bis zum Bescheid darf gegenüber Kunden "
          "keine Abrechnungsgarantie kommuniziert werden — auch nicht in Social-Media-Texten."],
         ["ChairMatch-Seed-Daten löschen",
          "Das ist eine Produktentscheidung, keine technische. 15 Seed-Salons und 16 Demo-Anbieter "
          "laufen live mit; ob und wann sie verschwinden, entscheidet die Geschäftsführung."],
         ["CM-Rechnungswesen und KYC bauen",
          "Beides existiert nicht und ist erheblicher Neubau. Vor Schritt 8 (Stripe) wäre es "
          "verfrüht — KYC hängt an Stripe Connect."],
         ["efy: 30 übersprungene Live-Tests grün machen",
          "Sie brauchen eine <b>Wegwerf-Instanz</b>, nicht die Produktionszugangsdaten. Sie gegen "
          "die Produktion laufen zu lassen wäre der falsche Weg."]],
        [5.2 * cm, 11.8 * cm]))

    e.append(P("Reihenfolge in der Praxis", "h1"))
    e.append(tabelle(
        ["Wann", "Schritte", "Ergebnis"],
        [["<b>Heute</b>", "1, 3, 4",
          "Frist gemeldet, Police angefordert, Rechnungs- und Mahnkette von Alltagsengel läuft."],
         ["<b>Diese Woche</b>", "2, 6, 10",
          "Gewerbeanmeldung angestoßen, Pflegemodul-Riegel live, Mappe unterschrieben — "
          "einreichbar, sobald 2 und 3 geliefert haben."],
         ["<b>Parallel, an Agenten</b>", "5, 7, 9",
          "47 Bewerbungen sichtbar, ChairMatch-Mietsuche wieder öffentlich, drei Stadtseiten online."],
         ["<b>Wenn ein Block Zeit frei ist</b>", "8",
          "Stripe für alle drei Projekte — danach können efy care und ChairMatch erstmals "
          "überhaupt Geld bewegen."]],
        [4.2 * cm, 3.4 * cm, 9.4 * cm]))
    e.append(Spacer(1, 12))
    e.append(P(
        "<i>Erstellt am 09.09.2026 aus den vier Statusaudits desselben Tages und eigenen "
        "Live-Gegenproben. Alle Telefonnummern, Aktenzeichen und Fristen stammen aus der "
        "Aktenlage im Repository. In diesem Lauf wurde nichts beantragt, nichts gesetzt, nichts "
        "aktiviert und kein Produktivcode geändert. Schrift: DejaVuSans.</i>", "klein"))
    return e


# ══════════════════════════════════════════════════════════════════════════
def main():
    pruefe_keine_helvetica()
    os.makedirs(OUT_DIR, exist_ok=True)

    p1 = os.path.join(OUT_DIR, "MASTER_ENTWICKLUNGSSTATUS_09_09_2026.pdf")
    Dok(p1, "Master-Entwicklungsstatus — Alltagsengel, efy care, ChairMatch").build(entwicklungsstatus(), canvasmaker=dejavu_canvas)
    print("erzeugt:", p1, os.path.getsize(p1), "Bytes")

    p2 = os.path.join(OUT_DIR, "MASTER_AKTIONSPLAN_09_09_2026.pdf")
    Dok(p2, "Master-Aktionsplan — die zehn nächsten Schritte").build(aktionsplan(), canvasmaker=dejavu_canvas)
    print("erzeugt:", p2, os.path.getsize(p2), "Bytes")

    for pfad in (p1, p2):
        pruefe_pdf_ohne_helvetica(pfad)


if __name__ == "__main__":
    sys.exit(main())
