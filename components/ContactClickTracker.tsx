'use client'
import { useEffect } from 'react'
import { Analytics } from '@/lib/analytics'

/**
 * Trackt Klicks auf Kontakt-Links (tel:, mailto:, wa.me) per Event-Delegation.
 * Unsichtbar — einfach auf einer Seite mit Kontakt-Links einbinden:
 *   <ContactClickTracker source="kontakt" />
 * Sendet GA4-Events phone_click / whatsapp_click / email_click.
 */
export default function ContactClickTracker({ source }: { source: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') || ''
      if (href.startsWith('tel:')) {
        Analytics.phoneClick(source)
      } else if (href.includes('wa.me/') || href.includes('api.whatsapp.com')) {
        Analytics.whatsappClick(source)
      } else if (href.startsWith('mailto:')) {
        Analytics.emailClick(source)
      }
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [source])

  return null
}
