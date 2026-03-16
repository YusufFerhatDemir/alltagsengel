import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Vercel/Next.js liefert die Client-IP über Headers
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null

  return NextResponse.json({ ip })
}
