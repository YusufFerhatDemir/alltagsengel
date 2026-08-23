// ═══════════════════════════════════════════════════════════════
// GET /api/dipa/schalter — Schalterstand dieser Umgebung
//
// Die Schalter des PflegeCoach werden serverseitig ausgewertet; die
// Verwaltungsoberfläche ist eine Client-Komponente und sieht
// `process.env` nicht. Ohne diese Route könnte sie nur das VERZEICHNIS
// anzeigen ("welche Schalter gibt es") und nicht den ZUSTAND ("welcher
// ist gerade scharf") — und gerade der Zustand ist die Frage, wegen der
// man die Seite aufmacht.
//
// ═══ ES GEHEN KEINE WERTE HERAUS ═══════════════════════════════
// Zurückgegeben werden ausschließlich die Booleans aus
// `schalterStand()` — gesetzt / aktiv / abweichung. Niemals der Inhalt
// einer Variablen. Unter den verzeichneten Schaltern sind ein Pepper
// (COACH_CODE_PEPPER) und ein Signaturschlüssel
// (COACH_STRIPE_WEBHOOK_SECRET); deren Werte dürfen eine
// Verwaltungsoberfläche nie erreichen, auch keine mit Admin-Zugang.
// Wer hier ein Feld ergänzt, prüft zuerst, ob es einen Wert transportiert.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { schalterStand } from '@/lib/coach/schalter'
import { EINGANGSBLOCKER, LEISTUNGSANSPRUCH, REGULATORIK_STAND } from '@/lib/coach/regulatorik'

export const runtime = 'nodejs'
// Kein Caching: Ein Schalter kann per Deployment umgelegt werden und muss
// dann sofort im Bericht stehen — vor allem in die alarmierende Richtung.
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const stand = schalterStand()

  return NextResponse.json({
    stand: stand.map(b => ({
      env: b.schalter.env,
      titel: b.schalter.titel,
      modul: b.schalter.modul,
      wirkung: b.schalter.wirkung,
      voraussetzung: b.schalter.voraussetzung,
      risiko: b.schalter.risiko,
      freigabeweg: b.schalter.freigabeweg,
      sicherer_stand: b.schalter.sicherer_stand,
      zulassungsgebunden: b.schalter.zulassungsgebunden,
      // Nur Zustand, nie Inhalt.
      gesetzt: b.gesetzt,
      aktiv: b.aktiv,
      abweichung: b.abweichung,
    })),
    eingangsblocker: EINGANGSBLOCKER.map(e => ({
      katalog_id: e.katalogId,
      kurz: e.kurz,
      ausstellende_stelle: e.ausstellendeStelle,
      begruendung: e.begruendung,
      fundstelle: e.fundstelle,
    })),
    leistungsanspruch: {
      norm: LEISTUNGSANSPRUCH.norm,
      dipa_euro_pro_monat: LEISTUNGSANSPRUCH.dipaEuroProMonat,
      eul_euro_pro_monat: LEISTUNGSANSPRUCH.eulEuroProMonat,
      gemeinsamer_deckel_euro: LEISTUNGSANSPRUCH.gemeinsamerDeckelEuro,
      bezugszeitraum: LEISTUNGSANSPRUCH.bezugszeitraum,
    },
    regulatorik_stand: REGULATORIK_STAND,
  })
}
