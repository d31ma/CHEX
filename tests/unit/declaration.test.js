import { describe, it, expect } from 'bun:test';
import Gen from '../../src/index.js';

// ---------------------------------------------------------------------------
// sanitizePropertyName
// ---------------------------------------------------------------------------

describe('sanitizePropertyName', () => {
  const cases = [
    ['name',        'name'],
    ['name?',       'name'],
    ['first name',  '"first name"'],
    ['kebab-key',   '"kebab-key"'],
    ['123start',    '"123start"'],
    ['_private',    '_private'],
    ['$id',         '$id'],
  ];

  it.each(cases)('sanitizes %j → %j', (input, expected) => {
    expect(Gen.sanitizePropertyName(input)).toBe(expected);
  });

  it('throws for unallowed special characters', () => {
    expect(() => Gen.sanitizePropertyName('invalid@name')).toThrow('Invalid character \'@\' in property name \'invalid@name\'');
  });

  it('respects allowedSpecialCharacters configuration', () => {
    const original = Gen.allowedSpecialCharacters;
    Gen.allowedSpecialCharacters = ['-', '_', '@'];
    expect(Gen.sanitizePropertyName('valid@name')).toBe('"valid@name"');
    Gen.allowedSpecialCharacters = original; // reset
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

    it('throws for an interface name with injection payload', () => {
      expect(() => Gen.generateDeclaration({ foo: '^.+$' }, 'X {} export const evil = () => {}; export interface Y')).toThrow('Invalid interface name');
    });

    it('throws for an empty interface name', () => {
      expect(() => Gen.generateDeclaration({ foo: '^.+$' }, '')).toThrow('Invalid interface name');
    });

    it('accepts a valid PascalCase interface name', () => {
      expect(() => Gen.generateDeclaration({ foo: '^.+$' }, 'MyInterface')).not.toThrow();
    });

    it('accepts an interface name with $ prefix', () => {
      expect(() => Gen.generateDeclaration({ foo: '^.+$' }, '$Special')).not.toThrow();
    });
  });

  describe('flat primitives (regex strings)', () => {
    it('generates a flat interface with all string types', () => {
      const result = Gen.generateDeclaration({ name: '^.+$', age: '^[0-9]+$', active: '^(true|false)$' });
      expect(result).toBe(
        'export interface Template {\n' +
        '    name: string;\n' +
        '    age: string;\n' +
        '    active: string;\n' +
        '}\n'
      );
    });

    it('uses a custom interface name', () => {
      const result = Gen.generateDeclaration({ id: '^.+$' }, 'Product');
      expect(result).toContain('export interface Product {');
    });

    it('marks nullable properties with | null', () => {
      const result = Gen.generateDeclaration({ 'label?': '^.+$' });
      expect(result).toContain('label: string | null;');
    });

    it('quotes property names that contain non-identifier characters', () => {
      const result = Gen.generateDeclaration({ 'content-type': '^.+$' });
      expect(result).toContain('"content-type": string;');
    });
  });

  describe('objects', () => {
    it('generates Record<string, unknown> for an empty nested object', () => {
      const result = Gen.generateDeclaration({ meta: {} });
      expect(result).toContain('meta: Record<string, unknown>;');
    });

    it('generates Record<string, string> for an object with a regex key', () => {
      const result = Gen.generateDeclaration({ tags: { '^[a-z]+$': '^.+$' } });
      expect(result).toContain('tags: Record<string, string>;');
    });

    it('extracts a nested object as a named interface', () => {
      const result = Gen.generateDeclaration({ address: { city: '^.+$', zip: '^[0-9]+$' } }, 'User');
      expect(result).toContain('export interface Address {');
      expect(result).toContain('    city: string;');
      expect(result).toContain('    zip: string;');
      expect(result).toContain('address: Address;');
    });

    it('emits named interfaces before the root interface', () => {
      const result = Gen.generateDeclaration({ address: { city: '^.+$' } }, 'User');
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

    it('generates Array<string> for an array with a regex pattern', () => {
      const result = Gen.generateDeclaration({ scores: ['^[0-9]+$'] });
      expect(result).toContain('scores: Array<string>;');
    });
  });
});

describe('fromJsonString', () => {
  it('generates a declaration from a valid JSON string', () => {
    const result = Gen.fromJsonString('{"id": "^.+$", "count": "^[0-9]+$"}', 'Item');
    expect(result).toContain('export interface Item {');
    expect(result).toContain('    id: string;');
    expect(result).toContain('    count: string;');
  });

  it('throws a descriptive error for invalid JSON', () => {
    expect(() => Gen.fromJsonString('{invalid}')).toThrow('Invalid JSON:');
  });

  it('uses the default interface name when none is provided', () => {
    const result = Gen.fromJsonString('{"x": "^.+$"}');
    expect(result).toContain('export interface Template {');
  });
});

describe('fromObject', () => {
  it('delegates to generateDeclaration and returns the same output', () => {
    const obj = { a: '^.+$', b: '^[0-9]+$' };
    expect(Gen.fromObject(obj, 'Alias')).toBe(Gen.generateDeclaration(obj, 'Alias'));
  });
});
