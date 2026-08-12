import { redirect } from 'next/navigation'
import { dipaModus } from '@/lib/coach/config'
import AnspruchClient from './AnspruchClient'

export default function AnspruchSeite() {
  if (!dipaModus()) redirect('/pflegecoach')
  return <AnspruchClient />
}
