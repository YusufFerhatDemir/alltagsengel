/**
 * WhatsApp Bot — Multi-Provider AI Caller (Gemini → Fallback OpenAI).
 *
 * Nutzt bestehende Keys aus Vercel-Env. Bei Provider-Down automatischer Fallback.
 * Logik kopiert von /app/api/ai-chat/route.ts (bewährtes Pattern).
 */

import { ALLTAGSENGEL_SYSTEM_PROMPT } from './system-prompt'

export type WaMessage = { role: 'user' | 'assistant'; content: string }

/** Gemini API call (Google) — primary provider */
async function callGemini(messages: WaMessage[]): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return null

  // Gemini erwartet: systemInstruction + contents (mit role 'user'/'model')
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const msg of messages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ALLTAGSENGEL_SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 500,
          },
          // Sicherheitsfilter aktiv auf BLOCK_MEDIUM_AND_ABOVE (strenger als das
          // vorherige BLOCK_ONLY_HIGH). Medizinische/dringende Themen werden ohnehin
          // vor dem AI-Call via shouldEscalate() an das Team weitergereicht.
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    )

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn('[wa-bot] Gemini failed:', response.status, await response.text())
      return null
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot] Gemini error:', err)
    return null
  }
}

/** OpenAI API call — fallback provider */
async function callOpenAI(messages: WaMessage[]): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: ALLTAGSENGEL_SYSTEM_PROMPT },
          ...messages.slice(-10),
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn('[wa-bot] OpenAI failed:', response.status, await response.text())
      return null
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content || null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot] OpenAI error:', err)
    return null
  }
}

/**
 * Hauptfunktion: ruft Gemini auf, fällt auf OpenAI zurück, gibt finale Antwort + Modell zurück.
 */
export async function getBotReply(
  messages: WaMessage[]
): Promise<{ reply: string; model: string }> {
  // 1) Versuche Gemini (günstiger, schneller, schon im Stack)
  const gemini = await callGemini(messages)
  if (gemini) return { reply: gemini, model: 'gemini-2.0-flash' }

  // 2) Fallback OpenAI
  const openai = await callOpenAI(messages)
  if (openai) return { reply: openai, model: 'gpt-4o-mini' }

  // 3) Beide Provider down → Eskalations-Fallback
  return {
    reply:
      'Hallo! Wir können gerade leider nicht automatisch antworten. Das Alltagsengel-Team meldet sich in Kürze persönlich bei Ihnen. Vielen Dank für Ihr Verständnis. 🙏',
    model: 'fallback-static',
  }
}
