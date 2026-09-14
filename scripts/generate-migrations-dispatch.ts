#!/usr/bin/env tsx
/**
 * Schreibt docs/migrations/DISPATCH.md aus lib/migration/stand.ts.
 * Aufruf: npm run migrations:dispatch
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dispatchText } from '../lib/migration/stand'

mkdirSync('docs/migrations', { recursive: true })
writeFileSync('docs/migrations/DISPATCH.md', dispatchText(), 'utf8')
console.log('docs/migrations/DISPATCH.md geschrieben.')
