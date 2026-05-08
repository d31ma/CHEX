import { afterEach, expect, test } from 'bun:test'
import { createChexConsumer, run } from './helpers.mjs'

const consumers = []

afterEach(async () => {
  await Promise.all(consumers.splice(0).map((consumer) => consumer.cleanup()))
})

test('chex.generate scans schema directories and writes declarations', async () => {
  const consumer = await createChexConsumer()
  consumers.push(consumer)

  await consumer.writeJson('schemas/order.json', {
    id: '',
    total: '^[0-9]+$',
    status: '^(open|closed)$',
    shipping: {
      city: '',
      country: '',
    },
  })
  await consumer.writeJson('schemas/catalog/item.json', {
    sku: '',
    attrs: { '^[a-z]+$': '^.+$' },
  })

  consumer.runBin('chex.generate', [], {
    env: { SCHEMA_DIR: consumer.path('schemas') },
  })

  const order = await consumer.readFile('schemas/order.d.ts')
  const item = await consumer.readFile('schemas/catalog/item.d.ts')

  expect(order).toContain('export interface Shipping')
  expect(order).toContain('status: string;')
  expect(order).toContain('export interface order')
  expect(item).toContain('attrs: Record<string, string>;')
  expect(item).toContain('export interface item')
})

test('chex.generate fails clearly when SCHEMA_DIR is missing', async () => {
  const consumer = await createChexConsumer()
  consumers.push(consumer)

  const result = run('bun', [consumer.bin('chex.generate')], {
    cwd: consumer.root,
    env: { SCHEMA_DIR: '' },
  })

  expect(result.status).not.toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).toContain('SCHEMA_DIR is not set')
})
