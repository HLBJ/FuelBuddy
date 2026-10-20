import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Ionic tags are treated as custom elements, so a missing import doesn't warn: the raw web
// component renders, but Vue-only features such as `router-link` silently do nothing.
const dirs = ['src/views', 'src/components']
const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.vue')).map((f) => join(d, f)))
const pascal = (tag) => tag.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())

describe('Ionic component imports', () => {
  it.each(files)('%s imports every Ionic component its template uses', (file) => {
    const source = readFileSync(file, 'utf8')
    const template = source.slice(source.indexOf('<template>'), source.lastIndexOf('</template>'))
    const script = source.slice(source.indexOf('<script'))
    const tags = [...new Set([...template.matchAll(/<(ion-[a-z-]+)/g)].map((m) => m[1]))]
    const missing = tags.filter((t) => !new RegExp(`\\b${pascal(t)}\\b`).test(script))
    expect(missing).toEqual([])
  })
})
