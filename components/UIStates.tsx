'use client'
import Link from 'next/link'
import { IconWingsGold } from '@/components/Icons'

/* ── Loading State: Skeleton Shimmer ── */
export function LoadingState({ lines = 4 }: { lines?: number }) {
  return (
    <div className="screen" id="ui-loading">
      <div className="ui-loading-body">
        <div className="ui-shimmer-circle" />
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="ui-shimmer-line" style={{ width: `${85 - i * 12}%`, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
    </div>
  )
}

/* ── Not Found State: Premium "Not Available" ── */
export function NotFoundState({
  title = 'Dieser Engel ist aktuell nicht verfügbar',
  subtitle = 'Bitte wählen Sie einen anderen Engel oder ändern Sie Ihren Suchradius.',
  homeHref = '/kunde/home',
}: {
  title?: string
  subtitle?: string
  homeHref?: string
}) {
  return (
    <div className="screen" id="ui-notfound">
      <div className="ui-nf-body">
        <div className="ui-nf-glow">
          <div className="ui-nf-ring" />
          <div className="ui-nf-core"><IconWingsGold size={36} /></div>
        </div>
        <div className="ui-state-title">{title}</div>
        <div className="ui-state-sub">{subtitle}</div>
        <div className="ui-nf-actions">
          <Link href={homeHref} className="ui-state-btn primary">Zur Suche</Link>
          <Link href="/" className="ui-state-btn secondary">Startseite</Link>
        </div>
      </div>
    </div>
  )
}

/* ── Error State: Retry ── */
export function ErrorState({
  title = 'Ups – etwas ist schiefgelaufen',
  subtitle = 'Bitte versuchen Sie es erneut.',
  onRetry,
  retryLabel = 'Erneut versuchen',
  homeHref = '/kunde/home',
}: {
  title?: string
  subtitle?: string
  onRetry?: () => void
  retryLabel?: string
  homeHref?: string
}) {
  return (
    <div className="ui-state-card">
      <div className="ui-state-icon error">!</div>
      <div className="ui-state-title">{title}</div>
      <div className="ui-state-sub">{subtitle}</div>
      <div className="ui-nf-actions">
        {onRetry && <button className="ui-state-btn primary" onClick={onRetry}>{retryLabel}</button>}
        <Link href={homeHref} className="ui-state-btn secondary">Startseite</Link>
      </div>
    </div>
  )
}
