import { describe, it, expect } from 'bun:test';
import Gen from '../src';

// ---------------------------------------------------------------------------
// sanitizePropertyName
// ---------------------------------------------------------------------------

describe('sanitizePropertyName', () => {
  const cases: [string, string][] = [
    ['name',        'name'],
    ['name?',       'name'],
    ['$id',         'id'],
    ['^key$',       'key'],
    ['first name',  '"first name"'],
    ['kebab-key',   '"kebab-key"'],
    ['123start',    '"123start"'],
    ['_private',    '_private'],
  ];

  it.each(cases)('sanitizes %j → %j', (input, expected) => {
    expect(Gen.sanitizePropertyName(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// generateDeclaration / fromObject / fromJsonString
// ---------------------------------------------------------------------------

describe('generateDeclaration', () => {
  describe('input validation', () => {
    it('throws for null input', () => {
      expect(() => Gen.generateDeclaration(null)).toThrow('Input must be a valid JSON object');
    });

    it('throws for a primitive string', () => {
      expect(() => Gen.generateDeclaration('hello')).toThrow('Input must be a valid JSON object');
    });

    it('throws for a number', () => {
      expect(() => Gen.generateDeclaration(42)).toThrow('Input must be a valid JSON object');
    });

    it('throws when a property value is null without ?', () => {
      expect(() => Gen.generateDeclaration({ name: null })).toThrow("use '?' for nullable properties");
    });
  });

  describe('flat primitives', () => {
    it('generates a flat interface using the default name Template', () => {
      const result = Gen.generateDeclaration({ name: '', age: 0, active: false });
      expect(result).toBe(
        'export interface Template {\n' +
        '    name: string;\n' +
        '    age: number;\n' +
        '    active: boolean;\n' +
        '}\n'
      );
    });

    it('uses a custom interface name', () => {
      const result = Gen.generateDeclaration({ id: '' }, 'Product');
      expect(result).toContain('export interface Product {');
    });

    it('marks nullable properties with | null', () => {
      const result = Gen.generateDeclaration({ 'label?': '' });
      expect(result).toContain('label: string | null;');
    });

    it('quotes property names that contain non-identifier characters', () => {
      const result = Gen.generateDeclaration({ 'content-type': '' });
      expect(result).toContain('"content-type": string;');
    });
  });

  describe('objects', () => {
    it('generates Record<string, unknown> for an empty nested object', () => {
      const result = Gen.generateDeclaration({ meta: {} });
      expect(result).toContain('meta: Record<string, unknown>;');
    });

    it('generates Record<string, V> for an object with an empty-string sentinel key', () => {
      const result = Gen.generateDeclaration({ tags: { '': '' } });
      expect(result).toContain('tags: Record<string, string>;');
    });

    it('generates Record<string, V1 | V2> for a mixed-value record', () => {
      const result = Gen.generateDeclaration({ attrs: { '': '', count: 0 } });
      expect(result).toContain('attrs: Record<string, string | number>;');
    });

    it('extracts a nested object as a named interface', () => {
      const result = Gen.generateDeclaration({ address: { city: '', zip: '' } }, 'User');
      expect(result).toContain('export interface Address {');
      expect(result).toContain('    city: string;');
      expect(result).toContain('    zip: string;');
      expect(result).toContain('address: Address;');
    });

    it('emits named interfaces before the root interface', () => {
      const result = Gen.generateDeclaration({ address: { city: '' } }, 'User');
      expect(result.indexOf('export interface Address')).toBeLessThan(
        result.indexOf('export interface User')
      );
    });
  });

  describe('arrays', () => {
    it('generates Array<unknown> for an empty array', () => {
      const result = Gen.generateDeclaration({ items: [] });
      expect(result).toContain('items: Array<unknown>;');
    });

    it('generates Array<T> for a homogeneous array', () => {
      const result = Gen.generateDeclaration({ scores: [0] });
      expect(result).toContain('scores: Array<number>;');
    });

    it('generates Array<T1 | T2> for a mixed-type array', () => {
      const result = Gen.generateDeclaration({ mixed: ['', 0] });
      expect(result).toContain('mixed: Array<string | number>;');
    });
  });

  describe('JSON Schema keywords', () => {
    it('resolves $ref with path notation to the final segment', () => {
      const result = Gen.generateDeclaration({ role: { $ref: '#/definitions/Role' } });
      expect(result).toContain('role: Role;');
    });

    it('resolves a bare $ref to the type name', () => {
      const result = Gen.generateDeclaration({ status: { $ref: 'Status' } });
      expect(result).toContain('status: Status;');
    });

    it('resolves oneOf primitives to a union type', () => {
      const result = Gen.generateDeclaration({ value: { oneOf: ['', 0] } });
      expect(result).toContain('value: string | number;');
    });

    it('resolves oneOf objects to named interfaces joined by union', () => {
      const result = Gen.generateDeclaration({ payload: { oneOf: [{ id: '' }, { code: 0 }] } }, 'Event');
      expect(result).toContain('payload: PayloadOption0 | PayloadOption1;');
      expect(result).toContain('export interface PayloadOption0 {');
      expect(result).toContain('export interface PayloadOption1 {');
    });

    it('resolves allOf $refs to an intersection type', () => {
      const result = Gen.generateDeclaration({
        entity: { allOf: [{ $ref: 'HasId' }, { $ref: 'HasName' }] }
      });
      expect(result).toContain('entity: HasId & HasName;');
    });

    it('resolves allOf objects to named interfaces joined by intersection', () => {
      const result = Gen.generateDeclaration({ doc: { allOf: [{ id: '' }, { rev: 0 }] } }, 'Doc');
      expect(result).toContain('doc: DocPart0 & DocPart1;');
      expect(result).toContain('export interface DocPart0 {');
      expect(result).toContain('export interface DocPart1 {');
    });

    it('resolves enum strings to a literal union', () => {
      const result = Gen.generateDeclaration({ dir: { enum: ['north', 'south'] } });
      expect(result).toContain('dir: "north" | "south";');
    });

    it('resolves enum numbers to a literal union', () => {
      const result = Gen.generateDeclaration({ priority: { enum: [1, 2, 3] } });
      expect(result).toContain('priority: 1 | 2 | 3;');
    });

    it('resolves a mixed enum (strings and numbers) to a literal union', () => {
      const result = Gen.generateDeclaration({ toggle: { enum: ['on', 'off', 1, 0] } });
      expect(result).toContain('toggle: "on" | "off" | 1 | 0;');
    });
  });
});

describe('fromJsonString', () => {
  it('generates a declaration from a valid JSON string', () => {
    const result = Gen.fromJsonString('{"id": "", "count": 0}', 'Item');
    expect(result).toContain('export interface Item {');
    expect(result).toContain('    id: string;');
    expect(result).toContain('    count: number;');
  });

  it('throws a descriptive error for invalid JSON', () => {
    expect(() => Gen.fromJsonString('{invalid}')).toThrow('Invalid JSON:');
  });

  it('uses the default interface name when none is provided', () => {
    const result = Gen.fromJsonString('{"x": 0}');
    expect(result).toContain('export interface Template {');
  });
});

describe('fromObject', () => {
  it('delegates to generateDeclaration and returns the same output', () => {
    const obj = { a: '', b: 0 };
    expect(Gen.fromObject(obj, 'Alias')).toBe(Gen.generateDeclaration(obj, 'Alias'));
  });
});

// ---------------------------------------------------------------------------
// validateData
// (requires SCHEMA_DIR → tests/fixtures, configured in tests/setup.ts)
// ---------------------------------------------------------------------------

describe('validateData', () => {
  const validPerson = () => ({
    name: 'Jane Doe',
    age: 30,
    active: true,
    nickname: null,
    address: { city: 'Toronto', country: 'Canada' },
    tags: ['typescript', 'bun'],
    scores: [95, 87],
    meta: { employer: 'ACME', dept: 'engineering' },
  });

  it('returns the validated data when all fields are valid', async () => {
    const data = validPerson();
    const result = await Gen.validateData('person', data);
    expect(result.name).toBe('Jane Doe');
    expect(result.age).toBe(30);
  });

  it('sets the default value for a null nullable property', async () => {
    const data = validPerson();
    data.nickname = null;
    const result = await Gen.validateData('person', data);
    expect((result as Record<string, unknown>).nickname).toBe('anonymous');
  });

  it('preserves a non-null nullable property without replacing it', async () => {
    const data = { ...validPerson(), nickname: 'johnny' };
    const result = await Gen.validateData('person', data);
    expect((result as Record<string, unknown>).nickname).toBe('johnny');
  });

  it('throws for a property not defined in the schema', () => {
    const data = { ...validPerson(), unknownField: 'oops' };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Property 'unknownField' does not exist in the 'person' collection schema"
    );
  });

  it('throws for a type mismatch on a top-level property', () => {
    const data = { ...validPerson(), age: 'thirty' as unknown as number };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Type mismatch for 'age' in 'person' collection"
    );
  });

  it('throws a type mismatch when a required number property is null', () => {
    // typeof null === 'object', which mismatches the schema's 'number' before the
    // null-check runs, so the type-mismatch error is the observable one.
    const data = { ...validPerson(), age: null as unknown as number };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Type mismatch for 'age' in 'person' collection: expected 'number' but got 'object'"
    );
  });

  it('throws a type mismatch when a required property is undefined', () => {
    // typeof undefined === 'undefined', which mismatches before the null-check runs.
    const { age: _omit, ...rest } = validPerson();
    return expect(Gen.validateData('person', rest as ReturnType<typeof validPerson>)).rejects.toThrow(
      "Type mismatch for 'age' in 'person' collection: expected 'number' but got 'undefined'"
    );
  });

  it('throws for a name that does not match the regex pattern', () => {
    const data = { ...validPerson(), name: 'madonna' };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "RegEx pattern fails for property 'name' in 'person' collection"
    );
  });

  it('accepts a name that matches the regex pattern', () => {
    const data = { ...validPerson(), name: 'John Smith' };
    return expect(Gen.validateData('person', data)).resolves.toBeDefined();
  });

  it('throws for an array element with the wrong type', () => {
    const data = { ...validPerson(), tags: [1, 2] as unknown as string[] };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Type mismatch for 'tags' in 'person' collection"
    );
  });

  it('throws for a nested property type mismatch', () => {
    const data = {
      ...validPerson(),
      address: { city: 123 as unknown as string, country: 'Canada' },
    };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Type mismatch for 'address.city' in 'person' collection"
    );
  });

  it('throws for a Record entry with the wrong value type', () => {
    const data = { ...validPerson(), meta: { employer: 99 } as unknown as Record<string, string> };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Type mismatch for 'meta.employer' in 'person' collection"
    );
  });

  it('throws when the schema file does not exist', () => {
    return expect(Gen.validateData('nonexistent', { x: 1 })).rejects.toThrow(
      "Failed to load schema for collection 'nonexistent'"
    );
  });
});
