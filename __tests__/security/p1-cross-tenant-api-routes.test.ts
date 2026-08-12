/**
 * P1: Cross-Tenant-Schutz fuer API-Routes.
 *
 * Prueft statisch, dass die 5 ehemals unfenced Routes (ai-chat, engel/match,
 * bookings/notify, bookings/respond, notify-admin-registration) jetzt einen
 * org-Fence haben — entweder via getActiveOrgId(), organization_members-Join,
 * oder organization_id-Filter.
 *
 * Route admin/pricing ist bewusst unfenced (globale Preiskonfiguration) und
 * hier als Ausnahme dokumentiert.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

const FENCED_ROUTES = [
  {
    path: 'app/api/ai-chat/route.ts',
    fence: 'org_fence via getActiveOrgId + organization_members',
  },
  {
    path: 'app/api/engel/match/route.ts',
    fence: 'org_fence via organization_members',
  },
  {
    path: 'app/api/bookings/notify/route.ts',
    fence: 'org_fence via organization_id',
  },
  {
    path: 'app/api/bookings/respond/route.ts',
    fence: 'org_fence via organization_id',
  },
  {
    path: 'app/api/notify-admin-registration/route.ts',
    fence: 'org_fence via organization_members',
  },
]

describe('Cross-Tenant API-Routes — org_fence vorhanden', () => {
  for (const { path: routePath, fence } of FENCED_ROUTES) {
    describe(routePath, () => {
      let src: string
      try {
        src = read(routePath)
      } catch {
        src = ''
      }

      it(`Route existiert`, () => {
        expect(src.length).toBeGreaterThan(0)
      })

      it(`hat org-Scoping (${fence})`, () => {
        const hasOrgFence =
          src.includes('getActiveOrgId') ||
          src.includes('organization_members') ||
          src.includes('organization_id') ||
          src.includes('orgId') ||
          src.includes('org_id')
        expect(hasOrgFence).toBe(true)
      })

      it('nutzt nicht createAdminClient ohne org-Filter', () => {
        if (!src.includes('createAdminClient')) return
        const hasFilter =
          src.includes('organization_id') ||
          src.includes('organization_members') ||
          src.includes('orgId') ||
          src.includes('getActiveOrgId')
        expect(hasFilter).toBe(true)
      })
    })
  }
})

describe('Cross-Tenant — kein ungefilterter Massen-Select', () => {
  for (const { path: routePath } of FENCED_ROUTES) {
    it(`${routePath}: kein .select() ohne org-Filter auf profiles/bookings/visitors`, () => {
      let src: string
      try {
        src = read(routePath)
      } catch {
        return
      }
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (
          line.includes('.select(') &&
          (line.includes("'profiles'") || line.includes("'bookings'") || line.includes("'visitors'"))
        ) {
          const context = lines.slice(Math.max(0, i - 10), i + 5).join('\n')
          const isSingleRowLookup = context.includes('.single()') || context.includes("eq('id',")
          if (isSingleRowLookup) continue
          const hasOrgFilter =
            context.includes('organization_id') ||
            context.includes('organization_members') ||
            context.includes('orgId') ||
            context.includes('memberIdList') ||
            context.includes('getActiveOrgId')
          expect(hasOrgFilter).toBe(true)
        }
      }
    })
  }
})

describe('Cross-Tenant — admin/pricing bewusst unfenced', () => {
  it('admin/pricing ist akzeptierte Ausnahme (globale Preiskonfiguration)', () => {
    expect(true).toBe(true)
  })
})
