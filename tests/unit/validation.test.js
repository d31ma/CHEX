import { describe, it, expect } from 'bun:test';
import Gen from '../../src/index.js';

// ---------------------------------------------------------------------------
// validateData
// ---------------------------------------------------------------------------

describe('validateData', () => {
  const validPerson = () => ({
    name: 'Jane Doe',
    age: '30',
    active: 'true',
    nickname: null,
    address: { city: 'Toronto', country: 'Canada' },
    tags: ['typescript', 'bun'],
    scores: ['95', '87'],
    meta: { employer: 'ACME', dept: 'engineering' },
  });

  it('returns the validated data when all fields are valid', async () => {
    const data = validPerson();
    const result = await Gen.validateData('person', data);
    expect(result.name).toBe('Jane Doe');
    expect(result.age).toBe('30');
  });

  it('skips regex validation for a null nullable property', async () => {
    const data = validPerson();
    data.nickname = null;
    const result = await Gen.validateData('person', data);
    expect(result.nickname).toBeNull();
  });

  it('throws for a property not defined in the schema', () => {
    const data = { ...validPerson(), unknownField: 'oops' };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Property 'unknownField' does not exist in the 'person' collection schema"
    );
  });

  it('throws for a type mismatch on an array property', () => {
    const data = { ...validPerson(), scores: 'not-an-array' };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Type mismatch for 'scores' in 'person' collection: expected an array"
    );
  });

  it('throws when a required property is null', () => {
    const data = { ...validPerson(), age: null };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "Property 'age' cannot be null or undefined in 'person' collection"
    );
  });

  it('throws when a required property is undefined', () => {
    const { age: _omit, ...rest } = validPerson();
    return expect(Gen.validateData('person', rest)).rejects.toThrow(
      "Property 'age' cannot be null or undefined in 'person' collection"
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

  it('throws for an array element that does not match the regex pattern', () => {
    const data = { ...validPerson(), tags: ['typescript', 'BUN'] };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "RegEx pattern fails for property 'tags' in 'person' collection"
    );
  });

  it('throws for a nested property regex mismatch', () => {
    const data = {
      ...validPerson(),
      address: { city: 'ABC123', country: 'Canada' },
    };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "RegEx pattern fails for property 'address.city' in 'person' collection"
    );
  });

  it('throws for a Record entry with a non-matching value', () => {
    const data = { ...validPerson(), meta: { employer: '' } };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "RegEx pattern fails for property 'meta.employer' in 'person' collection"
    );
  });

  it('throws for a Record entry with an invalid key', () => {
    const data = { ...validPerson(), meta: { '123': 'value' } };
    return expect(Gen.validateData('person', data)).rejects.toThrow(
      "RegEx pattern fails for property 'meta.<key:123>' in 'person' collection"
    );
  });

  it('throws when the schema file does not exist', () => {
    return expect(Gen.validateData('nonexistent', { x: '1' })).rejects.toThrow(
      'Failed to load schema for the specified collection'
    );
  });

  it('throws for an invalid collection name (path traversal attempt)', () => {
    return expect(Gen.validateData('../../../etc/passwd', {})).rejects.toThrow('Invalid collection name');
  });
});

// ---------------------------------------------------------------------------
// validateData — regex patterns
// ---------------------------------------------------------------------------

describe('validateData (regex patterns)', () => {
  const validStatus = () => ({
    direction: 'north',
    priority: '2',
    label: 'active',
    tag: null,
  });

  it('passes when all regex patterns match', async () => {
    const result = await Gen.validateData('status', validStatus());
    expect(result.direction).toBe('north');
    expect(result.priority).toBe('2');
    expect(result.label).toBe('active');
  });

  it('throws when a string value does not match the regex pattern', () => {
    const data = { ...validStatus(), direction: 'northwest' };
    return expect(Gen.validateData('status', data)).rejects.toThrow(
      "RegEx pattern fails for property 'direction' in 'status' collection"
    );
  });

  it('skips regex check for a null nullable field', async () => {
    const data = { ...validStatus(), tag: null };
    const result = await Gen.validateData('status', data);
    expect(result.tag).toBeNull();
  });

  it('validates a non-null value against a nullable regex field', async () => {
    const data = { ...validStatus(), tag: 'a' };
    const result = await Gen.validateData('status', data);
    expect(result.tag).toBe('a');
  });

  it('throws when a non-null nullable regex field has an invalid value', () => {
    const data = { ...validStatus(), tag: 'z' };
    return expect(Gen.validateData('status', data)).rejects.toThrow(
      "RegEx pattern fails for property 'tag' in 'status' collection"
    );
  });
});

// ---------------------------------------------------------------------------
// validateData — regex patterns for numeric and string constraints
// ---------------------------------------------------------------------------

describe('validateData (regex patterns for numeric/string constraints)', () => {
  const validMeasure = () => ({
    score: '50',
    temperature: '-273.15',
    quantity: '10',
    username: 'alice',
    code: 'AB12',
  });

  it('passes when all constrained values match their regex patterns', async () => {
    const result = await Gen.validateData('measure', validMeasure());
    expect(result.score).toBe('50');
  });

  // score: ^(100|[1-9]?[0-9])$  → 0-100
  it('passes at the minimum boundary (0)', async () => {
    const result = await Gen.validateData('measure', { ...validMeasure(), score: '0' });
    expect(result.score).toBe('0');
  });

  it('passes at the maximum boundary (100)', async () => {
    const result = await Gen.validateData('measure', { ...validMeasure(), score: '100' });
    expect(result.score).toBe('100');
  });

  it('throws when score is above maximum', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), score: '101' })).rejects.toThrow(
      "RegEx pattern fails for property 'score' in 'measure' collection"
    );
  });

  it('throws when score is negative', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), score: '-5' })).rejects.toThrow(
      "RegEx pattern fails for property 'score' in 'measure' collection"
    );
  });

  // quantity: ^[0-9]*[05]$ → multiples of 5
  it('passes when value is a multiple of 5', async () => {
    const result = await Gen.validateData('measure', { ...validMeasure(), quantity: '25' });
    expect(result.quantity).toBe('25');
  });

  it('throws when value is not a multiple of 5', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), quantity: '7' })).rejects.toThrow(
      "RegEx pattern fails for property 'quantity' in 'measure' collection"
    );
  });

  // username: ^.{3,20}$ → length 3-20
  it('passes at the minLength boundary', async () => {
    const result = await Gen.validateData('measure', { ...validMeasure(), username: 'abc' });
    expect(result.username).toBe('abc');
  });

  it('throws when string is shorter than minLength', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), username: 'ab' })).rejects.toThrow(
      "RegEx pattern fails for property 'username' in 'measure' collection"
    );
  });

  it('throws when string is longer than maxLength', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), username: 'a'.repeat(21) })).rejects.toThrow(
      "RegEx pattern fails for property 'username' in 'measure' collection"
    );
  });

  // code: ^.{4}$ → exactly 4 chars
  it('passes when string length equals exactly 4', async () => {
    const result = await Gen.validateData('measure', { ...validMeasure(), code: 'XY99' });
    expect(result.code).toBe('XY99');
  });

  it('throws when exact-length field is too short', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), code: 'AB1' })).rejects.toThrow(
      "RegEx pattern fails for property 'code' in 'measure' collection"
    );
  });

  it('throws when exact-length field is too long', () => {
    return expect(Gen.validateData('measure', { ...validMeasure(), code: 'AB123' })).rejects.toThrow(
      "RegEx pattern fails for property 'code' in 'measure' collection"
    );
  });
});
