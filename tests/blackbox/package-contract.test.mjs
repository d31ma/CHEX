import { afterEach, expect, test } from 'bun:test'
import { createChexConsumer, listTarballFiles } from './helpers.mjs'

const consumers = []

afterEach(async () => {
  await Promise.all(consumers.splice(0).map((consumer) => consumer.cleanup()))
})

test('packed package exposes only the expected public surface', () => {
  const files = listTarballFiles()

  expect(files).toContain('package/package.json')
  expect(files).toContain('package/src/index.js')
  expect(files).toContain('package/src/cli/generate-declarations.js')
  expect(files).toContain('package/types/index.d.ts')
  expect(files).not.toContain('package/.env')
  expect(files.some((file) => file.startsWith('package/tests/'))).toBe(false)
})

test('clean consumer project can import CHEX and generate declarations', async () => {
  const consumer = await createChexConsumer()
  consumers.push(consumer)

  await consumer.runModule(`
    const { default: Chex } = await import('@d31ma/chex')

    const declaration = Chex.generateDeclaration({
      id: '',
      'content-type': '',
      role: '^(admin|viewer)$',
      profile: {
        firstName: '',
        'zip-code': '',
      },
      meta: { '^[a-z]+$': '^.+$' },
      payload: {
        sku: '^.+$',
        count: '^[0-9]+$',
      },
    }, 'Customer')

    const requiredSnippets = [
      'export interface Profile',
      '"zip-code": string;',
      'role: string;',
      'meta: Record<string, string>;',
      'payload: Payload;',
      'export interface Customer',
    ]

    for (const snippet of requiredSnippets) {
      if (!declaration.includes(snippet)) {
        throw new Error(\`Generated declaration did not include: \${snippet}\\n\${declaration}\`)
      }
    }

    if (Chex.fromObject({ count: 0 }, 'Counter') !== Chex.generateDeclaration({ count: 0 }, 'Counter')) {
      throw new Error('fromObject should delegate to generateDeclaration')
    }

    let rejectedInjection = false
    try {
      Chex.fromJsonString('{"safe": ""}', 'Safe {} export const leaked = true; interface X')
    } catch (error) {
      rejectedInjection = error.message.includes('Invalid interface name')
    }
    if (!rejectedInjection) throw new Error('Invalid interface names must be rejected')
  `)
})
