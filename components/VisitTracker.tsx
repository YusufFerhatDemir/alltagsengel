'use client'
import { useTrackVisit } from '@/hooks/useTrackVisit'

type Portal = 'kunde' | 'engel' | 'fahrer' | 'investor' | 'landing'

/** Unsichtbare Tracking-Komponente für Server Components */
export default function VisitTracker({ portal }: { portal: Portal }) {
  useTrackVisit(portal)
  return null
}
