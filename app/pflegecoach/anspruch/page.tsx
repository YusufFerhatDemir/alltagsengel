import { redirect } from 'next/navigation'
import { dipaModus } from '@/lib/coach/config'
import { coachSeitenMetadata } from '../_lib/seitentitel'
import AnspruchClient from './AnspruchClient'

export const metadata = coachSeitenMetadata('Anspruch prüfen')

export default function AnspruchSeite() {
  if (!dipaModus()) redirect('/pflegecoach')
  return <AnspruchClient />
}
