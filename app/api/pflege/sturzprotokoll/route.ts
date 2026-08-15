import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createVerlauf, listVerlauf } from '@/lib/pflege/verlauf'

// ═══════════════════════════════════════════════════════════════
// Sturzprotokoll — strukturiertes Sturz-/Unfall-Formular
// Speichert in pflege_verlauf (eintrag_typ = 'sturz') mit
// strukturierten Metadaten im inhalt-Feld.
// ═══════════════════════════════════════════════════════════════

interface SturzprotokollBody {
  clientId: string
  sturzDatum: string
  sturzUhrzeit: string
  sturzOrt: string
  sturzHergang: string
  zeugen?: string
  verletzungen: string[]
  verletzungBeschreibung?: string
  sofortmassnahmen: string
  arztBenachrichtigt: boolean
  arztName?: string
  angehoerigeBenachrichtigt: boolean
  rettungsdienstGerufen: boolean
  krankenhausEinweisung: boolean
  sturzrisikoFaktoren: string[]
  praeventionsmassnahmen?: string
}

function formatSturzprotokoll(body: SturzprotokollBody): string {
  const teile: string[] = []

  teile.push('=== STURZPROTOKOLL ===')
  teile.push('')
  teile.push(`Sturzdatum: ${body.sturzDatum}`)
  teile.push(`Uhrzeit: ${body.sturzUhrzeit}`)
  teile.push(`Sturzort: ${body.sturzOrt}`)
  teile.push('')
  teile.push('--- Hergang ---')
  teile.push(body.sturzHergang)
  if (body.zeugen) teile.push(`Zeugen: ${body.zeugen}`)
  teile.push('')
  teile.push('--- Verletzungen ---')
  teile.push(`Art: ${body.verletzungen.join(', ') || 'keine'}`)
  if (body.verletzungBeschreibung) teile.push(`Beschreibung: ${body.verletzungBeschreibung}`)
  teile.push('')
  teile.push('--- Sofortmassnahmen ---')
  teile.push(body.sofortmassnahmen)
  teile.push('')
  teile.push('--- Benachrichtigungen ---')
  teile.push(`Arzt benachrichtigt: ${body.arztBenachrichtigt ? 'Ja' : 'Nein'}`)
  if (body.arztName) teile.push(`Arzt: ${body.arztName}`)
  teile.push(`Angehoerige benachrichtigt: ${body.angehoerigeBenachrichtigt ? 'Ja' : 'Nein'}`)
  teile.push(`Rettungsdienst gerufen: ${body.rettungsdienstGerufen ? 'Ja' : 'Nein'}`)
  teile.push(`Krankenhaus-Einweisung: ${body.krankenhausEinweisung ? 'Ja' : 'Nein'}`)
  teile.push('')
  teile.push('--- Risikofaktoren ---')
  teile.push(body.sturzrisikoFaktoren.join(', ') || 'keine angegeben')
  if (body.praeventionsmassnahmen) {
    teile.push('')
    teile.push('--- Praeventionsmassnahmen ---')
    teile.push(body.praeventionsmassnahmen)
  }

  return teile.join('\n')
}

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const clientId = params.get('clientId') ?? undefined

    const admin = createAdminClient()
    const eintraege = await listVerlauf(admin, {
      organizationId: auth.ctx.organizationId,
      clientId,
      eintragTyp: 'sturz',
      limit: params.get('limit') ? Number(params.get('limit')) : 100,
    })

    // Kundennamen dazuladen
    const clientIds = [...new Set(eintraege.map(e => e.client_id))]
    let kunden: Record<string, string> = {}
    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from('clients')
        .select('id, first_name, last_name')
        .in('id', clientIds)
      if (clients) {
        kunden = Object.fromEntries(
          clients.map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()])
        )
      }
    }

    const protokolle = eintraege.map(e => ({
      ...e,
      kunde_name: kunden[e.client_id] || '—',
    }))

    return NextResponse.json({ protokolle })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body: SturzprotokollBody = await request.json()

    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId ist ein Pflichtfeld.' }, { status: 400 })
    }
    if (!body.sturzDatum || !body.sturzUhrzeit) {
      return NextResponse.json({ error: 'Sturzdatum und Uhrzeit sind Pflichtfelder.' }, { status: 400 })
    }
    if (!body.sturzOrt) {
      return NextResponse.json({ error: 'Sturzort ist ein Pflichtfeld.' }, { status: 400 })
    }
    if (!body.sturzHergang?.trim()) {
      return NextResponse.json({ error: 'Hergang ist ein Pflichtfeld.' }, { status: 400 })
    }
    if (!body.sofortmassnahmen?.trim()) {
      return NextResponse.json({ error: 'Sofortmassnahmen sind ein Pflichtfeld.' }, { status: 400 })
    }

    const inhalt = formatSturzprotokoll(body)
    const admin = createAdminClient()

    const eintragDatum = new Date(`${body.sturzDatum}T${body.sturzUhrzeit}`).toISOString()

    const eintrag = await createVerlauf(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: body.clientId,
      eintragDatum,
      eintragTyp: 'sturz',
      kategorie: 'mobilitaet',
      titel: `Sturzprotokoll — ${body.sturzOrt}`,
      inhalt,
      istDringend: true,
      autorId: auth.ctx.userId,
      autorName: auth.ctx.name,
      autorRolle: auth.ctx.role,
      sichtbarkeit: 'intern',
    })

    return NextResponse.json({ eintrag })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
