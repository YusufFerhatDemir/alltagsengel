import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { createAdminClient } from '@/lib/supabase/admin'
import { heuteBerlin } from '@/lib/utils/timezone';
import { logger } from '@/lib/logger';
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('beratung-chat');

// ═══════════════════════════════════════════════════════════
// BERATUNGS-CHAT API — Öffentlicher KI-Pflegeberater
// ═══════════════════════════════════════════════════════════
// Für die Landing-/Info-Seiten: beantwortet Fragen zu
// Entlastungsbetrag, Pflegegraden und Alltagsengel-Leistungen.
// KEIN Auth nötig, KEINE internen Geschäftsdaten im Kontext.
// Provider-Kette: Gemini → OpenAI → regelbasierter Fallback
// (funktioniert damit auch ganz ohne API-Key).
// ═══════════════════════════════════════════════════════════

export const runtime = 'nodejs'

// Kosten-Härtung: kurze History + kurze Einzelnachrichten reichen
// für den Beratungs-Use-Case völlig aus und deckeln die Token-Kosten.
const MAX_MESSAGES = 10
const MAX_CHARS = 1000
// Globaler Tages-Deckel für bezahlte LLM-Calls (über alle Nutzer/IPs).
// Bei Überschreitung antwortet der regelbasierte Fallback — der Chat
// bleibt funktional, es entstehen nur keine API-Kosten mehr.
const MAX_LLM_CALLS_PER_DAY = 300

const SYSTEM_PROMPT = `Du bist der digitale Berater von Alltagsengel (alltagsengel.care) — Alltagsbegleitung nach §45a SGB XI in Frankfurt am Main und dem Rhein-Main-Gebiet.

DEIN WISSEN (Stand 2026):
- Entlastungsbetrag §45b SGB XI: 131 €/Monat (1.572 €/Jahr) für ALLE Pflegegrade 1–5. Kein Antrag nötig — Erstattung gegen Rechnung anerkannter Anbieter oder direkte Abrechnung per Abtretungserklärung (das übernimmt Alltagsengel komplett).
- Nicht genutzte Beträge sammeln sich im Kalenderjahr an; der Übertrag ins Folgejahr verfällt am 30. Juni.
- Umwandlungsanspruch §45a Abs. 4: bei Pflegegrad 2–5 zusätzlich bis zu 40 % der Pflegesachleistung für Alltagsbegleitung nutzbar.
- Pflegegeld/Monat (häusliche Pflege): PG2 347 €, PG3 599 €, PG4 800 €, PG5 990 €.
- Pflegegrad beantragen: formlos bei der Pflegekasse, danach Begutachtung durch den Medizinischen Dienst (6 Module, Punktesystem). Leistungen gelten ab Antragsmonat.
- Alltagsengel-Leistungen: Einkaufshilfe, Haushaltshilfe, Arztbegleitung, Spaziergänge, Gesellschaft & psychosoziale Betreuung. Zertifizierte, versicherte Alltagsbegleiter ("Engel"). Eigenanteil für Kunden mit Pflegegrad: 0 €.
- Weitere Angebote: Pflege-Box (Pflegehilfsmittel §40 SGB XI, bis 42 €/Monat, 0 € Eigenanteil) und Krankenfahrten (§60 SGB V, mit ärztlicher Verordnung über die Krankenkasse).
- Einzugsgebiet: Frankfurt am Main und Rhein-Main (u. a. Offenbach, Wiesbaden, Mainz, Darmstadt, Hanau, Bad Homburg, Oberursel, Aschaffenburg).
- Kontakt: WhatsApp +49 178 3382825, Kontaktformular auf /kontakt. Büro: Neue Mainzer Straße 66-68, 60311 Frankfurt am Main.
- Hilfreiche Seiten: /budgetrechner (Restbudget berechnen), /pflegegrad-check (Pflegegrad einschätzen), /termin (Beratungstermin buchen), /blog (Ratgeber).

DEINE REGELN:
- Antworte auf Deutsch, in der Sie-Form, warm und leicht verständlich (Zielgruppe: Senioren und Angehörige). Kurz: maximal ~120 Wörter.
- Verweise wo passend auf die hilfreichen Seiten (als Pfad, z. B. /budgetrechner) oder biete den kostenlosen Rückruf über /termin bzw. /kontakt an.
- Du sprichst IMMER als "Alltagsengel" — nenne niemals persönliche Namen von Mitarbeitern oder Gründern.
- Keine medizinische, rechtliche oder finanzielle Einzelfallberatung — bei komplexen Fällen freundlich auf die kostenlose persönliche Beratung verweisen.
- Bleib beim Thema Pflege/Alltagsengel. Bei anderen Themen: höflich zurücklenken.
- Erfinde nichts. Wenn du etwas nicht weißt, sag es und biete die persönliche Beratung an.`

type ChatMessage = { role: 'user' | 'assistant'; content: string }

// ── Regelbasierter Fallback (funktioniert ohne API-Key) ──
const FALLBACK_REGELN: { muster: RegExp; antwort: string }[] = [
  {
    muster: /entlastungsbetrag|131|budget|45b|geld.*(kasse|zu)|anspruch/i,
    antwort: 'Der Entlastungsbetrag (§45b SGB XI) beträgt 131 € pro Monat und steht allen Pflegebedürftigen mit Pflegegrad 1–5 zu. Ungenutzte Beträge sammeln sich an — Ihr aktuelles Restbudget können Sie in 10 Sekunden hier berechnen: /budgetrechner. Die komplette Abrechnung mit der Pflegekasse übernehmen wir für Sie, Ihr Eigenanteil: 0 €.',
  },
  {
    muster: /pflegegrad|begutachtung|medizinischer dienst|mdk|antrag/i,
    antwort: 'Einen Pflegegrad beantragen Sie formlos bei Ihrer Pflegekasse — danach kommt der Medizinische Dienst zur Begutachtung. Eine kostenlose Ersteinschätzung in 2 Minuten bekommen Sie mit unserem Pflegegrad-Check: /pflegegrad-check. Beim Antrag unterstützen wir Sie gern kostenlos — Termin unter /termin.',
  },
  {
    muster: /kosten|preis|teuer|eigenanteil|bezahl/i,
    antwort: 'Für Kunden mit Pflegegrad kostet die Alltagsbegleitung in der Regel nichts: Die Leistung wird über den Entlastungsbetrag (131 €/Monat, §45b SGB XI) direkt mit der Pflegekasse abgerechnet — Ihr Eigenanteil: 0 €. Auch die Pflege-Box (§40) ist für Sie kostenfrei. Details gern im persönlichen Gespräch: /termin.',
  },
  {
    muster: /pflegebox|pflege-box|hygienebox|hilfsmittel|handschuhe|desinfektion/i,
    antwort: 'Die Pflege-Box enthält Pflegehilfsmittel zum Verbrauch (Handschuhe, Desinfektion, Bettschutz u. a.) und wird bei Pflegegrad 1–5 mit bis zu 42 €/Monat von der Pflegekasse übernommen — 0 € Eigenanteil, monatliche Lieferung nach Hause. Mehr unter /hygienebox.',
  },
  {
    muster: /krankenfahrt|fahrt|arzt.*(fahren|termin)|dialyse|transport/i,
    antwort: 'Wir vermitteln sichere Krankenfahrten zu Arzt, Klinik, Dialyse und Therapie in Frankfurt und Rhein-Main. Mit ärztlicher Verordnung übernimmt in der Regel die Krankenkasse die Kosten (§60 SGB V). Mehr unter /krankenfahrten.',
  },
  {
    muster: /job|arbeit|bewerb|engel werden|verdienen|nebenjob|stelle/i,
    antwort: 'Schön, dass Sie bei Alltagsengel arbeiten möchten! Als Alltagsbegleiter/in ("Engel") arbeiten Sie flexibel und sinnstiftend in Ihrer Nähe. Alle Infos und die Bewerbung finden Sie unter /engel-werden.',
  },
  {
    muster: /wo |gebiet|region|stadt|frankfurt|offenbach|wiesbaden|mainz|darmstadt|hanau|umkreis|nähe/i,
    antwort: 'Wir sind in Frankfurt am Main und im gesamten Rhein-Main-Gebiet für Sie da — u. a. Offenbach, Wiesbaden, Mainz, Darmstadt, Hanau, Bad Homburg, Oberursel und Aschaffenburg. Fragen Sie gern mit Ihrer PLZ nach oder buchen Sie direkt eine kostenlose Beratung: /termin.',
  },
  {
    muster: /termin|rückruf|beratung|anrufen|kontakt|telefon|whatsapp/i,
    antwort: 'Sehr gern! Einen kostenlosen Beratungstermin buchen Sie in 1 Minute unter /termin — oder schreiben Sie uns per WhatsApp unter +49 178 3382825. Wir melden uns schnellstmöglich. Herzliche Grüße, Ihr Team von Alltagsengel.',
  },
]

function fallbackAntwort(text: string): string {
  for (const r of FALLBACK_REGELN) {
    if (r.muster.test(text)) return r.antwort
  }
  return 'Gern helfen wir Ihnen persönlich weiter! Die häufigsten Antworten finden Sie hier: Entlastungsbetrag berechnen unter /budgetrechner, Pflegegrad einschätzen unter /pflegegrad-check, kostenlosen Beratungstermin buchen unter /termin — oder per WhatsApp: +49 178 3382825.'
}

// ── Globaler Tages-Cap (persistent über alle Serverless-Instanzen) ──
// Nutzt die bestehende login_rate_limits-Tabelle als Key→Zähler-Store
// (gleiches Muster wie app/api/auth/check-rate-limit/route.ts, gleiche
// Fail-open-Philosophie wie lib/whatsapp/rate-limit.ts: bei Supabase-
// Fehler durchlassen, damit ein DB-Ausfall den Chat nicht blockiert).
// Der Read-then-Upsert-Increment ist nicht strikt atomar — parallele
// Requests können minimal unterzählen; für einen Kosten-Deckel okay.
async function dailyLlmCapReached(): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const key = `beratung-chat:daily:${heuteBerlin()}`
    const { data, error } = await supabase
      .from('login_rate_limits')
      .select('attempts')
      .eq('key', key)
      .maybeSingle()
    if (error) {
      log.warn('Tages-Cap-Lesen fehlgeschlagen (fail-open)', { errorMessage: error.message })
      return false
    }
    const attempts = data?.attempts ?? 0
    if (attempts >= MAX_LLM_CALLS_PER_DAY) return true
    await supabase
      .from('login_rate_limits')
      .upsert(
        { key, attempts: attempts + 1, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
    return false
  } catch (e) {
    log.warn('Tages-Cap-Check fehlgeschlagen (fail-open)', { errorMessage: e instanceof Error ? e.message : e })
    return false
  }
}

// ── Gemini (primär) ──
async function callGemini(messages: ChatMessage[]): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return null
  try {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        // Key im Header statt als ?key=-Query-Parameter, damit er bei
        // fetch-Exceptions/Logs nicht in der URL auftaucht.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          // Echte System-Instruktion statt gefaktem User-Turn —
          // deutlich robuster gegen Prompt-Injection.
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
          // Konsistent zum WhatsApp-Bot: explizite Safety-Schwellen statt Defaults.
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    )
    if (!res.ok) {
      log.error('Gemini Error', { responseBody: await res.text() })
      return null
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null
  } catch (e) {
    log.errorWithException('Gemini Exception', e)
    return null
  }
}

// ── OpenAI (Fallback) ──
async function callOpenAI(messages: ChatMessage[]): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 500,
        temperature: 0.4,
      }),
    })
    if (!res.ok) {
      log.error('OpenAI Error', { responseBody: await res.text() })
      return null
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (e) {
    log.errorWithException('OpenAI Exception', e)
    return null
  }
}

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    if (!(await rateLimitPersistent(`beratung-chat:min:${ip}`, 8, 60_000)) || !(await rateLimitPersistent(`beratung-chat:h:${ip}`, 40, 3_600_000))) {
      return NextResponse.json(
        { content: 'Sie haben gerade viele Fragen gestellt — bitte versuchen Sie es in einer Minute erneut oder buchen Sie direkt eine kostenlose Beratung: /termin.' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => null)
    const raw = body?.messages
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
    }

    // Nur die letzten Nachrichten, Länge kappen, Rollen erzwingen
    const messages: ChatMessage[] = (raw as unknown[])
      .slice(-MAX_MESSAGES)
      .filter((m): m is { role?: unknown; content: string } =>
        !!m && typeof (m as { content?: unknown }).content === 'string' && !!(m as { content: string }).content.trim())
      .map((m): ChatMessage => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content).slice(0, MAX_CHARS),
      }))

    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
    }

    // Kosten-Deckel: Ist der globale Tages-Cap erreicht, gar nicht erst
    // die bezahlten APIs anfragen — direkt der regelbasierte Fallback.
    const letzteFrage = messages[messages.length - 1].content
    const content = (await dailyLlmCapReached())
      ? fallbackAntwort(letzteFrage)
      : (await callGemini(messages)) ??
        (await callOpenAI(messages)) ??
        fallbackAntwort(letzteFrage)

    return NextResponse.json({ content })
  } catch (e) {
    return safeApiError(e, req)
  }
})
