// Server Component — forces dynamic rendering for all MIS pages
// This prevents Vercel CDN from caching stale HTML with old JS chunk references
export const dynamic = 'force-dynamic'
export const revalidate = 0

import MISLayoutClient from './MISLayoutClient'

export default function MISLayout({ children }: { children: React.ReactNode }) {
  return <MISLayoutClient>{children}</MISLayoutClient>
}
