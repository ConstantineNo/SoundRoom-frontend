import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const expected = readFileSync('VERSION', 'utf8').trim()
assert.deepEqual(JSON.parse(readFileSync('dist/version.json', 'utf8')), {
  component: 'SoundRoom-frontend', version: expected,
})
console.log(`Built component VERSION verified: ${expected}`)
