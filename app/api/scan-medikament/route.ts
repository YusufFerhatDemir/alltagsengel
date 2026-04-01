import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Simple in-memory rate limiter: max 5 requests per minute per IP
const rateLimit = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimit.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + 60000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

const SCAN_PROMPT = `Du bist ein Medikamenten-Scanner. Analysiere das Foto einer Medikamentenpackung oder eines Beipackzettels und extrahiere folgende Informationen als JSON:
{
  "medikament_name": "Name des Medikaments",
  "wirkstoff": "Wirkstoff(e)",
  "dosierung": "Numerischer Wert der Dosierung (nur Zahl)",
  "einheit": "mg, ml, Tabletten, Tropfen, IE oder µg",
  "einnahme_hinweis": "Einnahmehinweise falls sichtbar",
  "verordnet_von": ""
}
Antworte NUR mit dem JSON-Objekt, kein zusätzlicher Text. Wenn du etwas nicht erkennen kannst, lass das Feld leer ("").`

// Gemini Vision API Call
async function callGeminiVision(image: string) {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return null

  // Base64-Daten extrahieren
  const base64Match = image.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!base64Match) return null

  const mimeType = base64Match[1]
  const base64Data = base64Match[2]

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SCAN_PROMPT + '\n\nAnalysiere dieses Medikamenten-Foto und extrahiere alle erkennbaren Informationen.' },
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    console.error('Gemini Vision Error:', err)
    return null
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null
}

// OpenAI Vision API Call (Fallback)
async function callOpenAIVision(image: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SCAN_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analysiere dieses Medikamenten-Foto und extrahiere alle erkennbaren Informationen.' },
            { type: 'image_url', image_url: { url: image, detail: 'high' } }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    })
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('OpenAI Vision Error:', err)
    return null
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || null
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warten Sie eine Minute.' }, { status: 429 })
    }

    // Auth check - nur eingeloggte Benutzer
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { image } = await req.json()

    if (!image) {
      return NextResponse.json({ error: 'Kein Bild erhalten' }, { status: 400 })
    }

    if (!process.env.GOOGLE_AI_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Kein KI-API-Key konfiguriert.' },
        { status: 500 }
      )
    }

    // Gemini zuerst, dann OpenAI als Fallback
    let content = await callGeminiVision(image)

    if (!content) {
      console.log('Gemini Vision nicht verfügbar, versuche OpenAI...')
      content = await callOpenAIVision(image)
    }

    if (!content) {
      return NextResponse.json(
        { error: 'Fehler bei der Bilderkennung. Bitte versuche es erneut.' },
        { status: 500 }
      )
    }

    // Parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return NextResponse.json({ success: true, data: parsed })
      }
    } catch {
      // fallback
    }

    return NextResponse.json(
      { error: 'Konnte die Medikamenten-Informationen nicht erkennen. Bitte manuell eingeben.' },
      { status: 422 }
    )
  } catch (error) {
    console.error('Scan error:', error)
    return NextResponse.json(
      { error: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.' },
      { status: 500 }
    )
  }
}
