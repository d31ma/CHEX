import { afterEach, test } from 'bun:test'
import { createChexConsumer } from './helpers.mjs'

const consumers = []

afterEach(async () => {
  await Promise.all(consumers.splice(0).map((consumer) => consumer.cleanup()))
})

test('clean consumer project validates data against consumer-owned schemas', async () => {
  const consumer = await createChexConsumer()
  consumers.push(consumer)

  const schemaDir = consumer.path('schemas')
  await consumer.writeJson('schemas/customer.json', {
    email: '^[^@]+@example[.]com$',
    role: '^(admin|viewer)$',
    quota: '^(0|2|4|6|8|10)$',
    profile: {
      displayName: '^[A-Za-z ]+$',
      'country?': '^[A-Z]{2}$',
    },
    tags: ['^[a-z]+$'],
    metadata: { '^[a-z]+$': '^.+$' },
    'status?': '^(active|paused)$',
  })

  await consumer.runModule(`
    process.env.SCHEMA_DIR = ${JSON.stringify(schemaDir)}
    const { default: Chex } = await import('@d31ma/chex')

    const valid = await Chex.validateData('customer', {
      email: 'contract@example.com',
      role: 'admin',
      quota: 4,
      profile: { displayName: 'CHEX Contract' },
      tags: ['package', 'validation'],
      metadata: { source: 'blackbox' },
      status: null,
    })

    if (valid.profile.country !== undefined) throw new Error('optional country should remain absent')
    if (valid.status !== null) throw new Error('nullable enum should preserve null')

    const rejectionCases = [
      [
        'extra property',
        () => Chex.validateData('customer', {
          email: 'contract@example.com',
          role: 'admin',
          quota: 4,
          profile: { displayName: 'CHEX Contract' },
          tags: ['package'],
          metadata: { source: 'blackbox' },
          unexpected: true,
        }),
        "Property 'unexpected' does not exist",
      ],
      [
        'regex mismatch',
        () => Chex.validateData('customer', {
          email: 'contract@invalid.test',
          role: 'admin',
          quota: 4,
          profile: { displayName: 'CHEX Contract' },
          tags: ['package'],
          metadata: { source: 'blackbox' },
        }),
        'RegEx pattern fails',
      ],
      [
        'enum mismatch',
        () => Chex.validateData('customer', {
          email: 'contract@example.com',
          role: 'owner',
          quota: 4,
          profile: { displayName: 'CHEX Contract' },
          tags: ['package'],
          metadata: { source: 'blackbox' },
        }),
        'RegEx pattern fails',
      ],
      [
        'multipleOf mismatch',
        () => Chex.validateData('customer', {
          email: 'contract@example.com',
          role: 'admin',
          quota: 5,
          profile: { displayName: 'CHEX Contract' },
          tags: ['package'],
          metadata: { source: 'blackbox' },
        }),
        'RegEx pattern fails',
      ],
      [
        'nested type mismatch',
        () => Chex.validateData('customer', {
          email: 'contract@example.com',
          role: 'admin',
          quota: 4,
          profile: { displayName: 42 },
          tags: ['package'],
          metadata: { source: 'blackbox' },
        }),
        "RegEx pattern fails for property 'profile.displayName'",
      ],
    ]

    for (const [label, action, expected] of rejectionCases) {
      let rejected = false
      try {
        await action()
      } catch (error) {
        rejected = error.message.includes(expected)
      }
      if (!rejected) throw new Error(\`\${label} should reject with \${expected}\`)
    }
  `)
})

test('validation rejects unsafe collection names and oversized regex patterns', async () => {
  const consumer = await createChexConsumer()
  consumers.push(consumer)

  const schemaDir = consumer.path('schemas')
  await consumer.writeJson('schemas/unsafe.json', {
    name: 'a'.repeat(501),
  })

  await consumer.runModule(`
    process.env.SCHEMA_DIR = ${JSON.stringify(schemaDir)}
    const { default: Chex } = await import('@d31ma/chex')

    let rejectedTraversal = false
    try {
      await Chex.validateData('../unsafe', {})
    } catch (error) {
      rejectedTraversal = error.message.includes('Invalid collection name')
    }
    if (!rejectedTraversal) throw new Error('Path traversal collection names must be rejected')

    let rejectedRegex = false
    try {
      await Chex.validateData('unsafe', { name: 'alice' })
    } catch (error) {
      rejectedRegex = error.message.includes('exceeds maximum allowed length')
    }
    if (!rejectedRegex) throw new Error('Oversized regex patterns must be rejected')
  `)
})
