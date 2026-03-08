import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json()

    if (!image) {
      return NextResponse.json({ error: 'Kein Bild erhalten' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API-Key nicht konfiguriert. Bitte in Vercel Umgebungsvariablen hinzufügen.' },
        { status: 500 }
      )
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Du bist ein Medikamenten-Scanner. Analysiere das Foto einer Medikamentenpackung oder eines Beipackzettels und extrahiere folgende Informationen als JSON:
{
  "medikament_name": "Name des Medikaments",
  "wirkstoff": "Wirkstoff(e)",
  "dosierung": "Numerischer Wert der Dosierung (nur Zahl)",
  "einheit": "mg, ml, Tabletten, Tropfen, IE oder µg",
  "einnahme_hinweis": "Einnahmehinweise falls sichtbar",
  "verordnet_von": ""
}
Antworte NUR mit dem JSON-Objekt, kein zusätzlicher Text. Wenn du etwas nicht erkennen kannst, lass das Feld leer ("").`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analysiere dieses Medikamenten-Foto und extrahiere alle erkennbaren Informationen.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: image,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI API Error:', err)
      return NextResponse.json(
        { error: 'Fehler bei der Bilderkennung. Bitte versuche es erneut.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

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
