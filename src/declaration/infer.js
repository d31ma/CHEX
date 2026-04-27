/**
 * @fileoverview Mutually-recursive type inference for the declaration
 * generator. `buildProperties` calls `inferType`, which may recurse back
 * through `inferObjectType` / `inferArrayType` — they live together to
 * avoid circular module imports.
 *
 * In the CHEX schema format every leaf value is a regex pattern string,
 * so all leaf types resolve to `string`.
 */

import {
  INDENT,
  sanitizePropertyName,
  toPascalCase,
  isRecordType,
} from './properties.js';
import { InvalidInputError } from '../errors.js';

/**
 * Build the interior lines of an interface body.
 * @param {Record<string, unknown>} obj
 * @param {number} depth
 * @param {Map<string, string>} collected
 * @returns {string}
 */
export function buildProperties(obj, depth, collected) {
  const indent = INDENT.repeat(depth + 1);
  const lines = [];

  for (const [key, value] of Object.entries(obj)) {
    const isNullable = key.endsWith('?');
    const cleanKey = sanitizePropertyName(key);
    const childName = toPascalCase(cleanKey);
    const type = inferType(value, depth, collected, childName);
    const nullableSuffix = isNullable ? ' | null' : '';

    lines.push(`${indent}${cleanKey}: ${type}${nullableSuffix};`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Infer the TypeScript type for a JSON schema value.
 *
 * - String values (regex patterns) → `string`
 * - Arrays → `Array<…>` inferred from elements
 * - Objects → nested interface or `Record<string, …>`
 * - `null` → error (use `?` for nullable properties)
 *
 * @param {unknown} value
 * @param {number} depth
 * @param {Map<string, string>} collected
 * @param {string} contextName
 * @returns {string}
 */
export function inferType(value, depth, collected, contextName) {
  if (value === null) {
    throw new InvalidInputError(`value cannot be null, please use '?' for nullable properties`);
  }

  if (Array.isArray(value)) {
    return inferArrayType(value, depth, collected, contextName);
  }

  if (typeof value === 'object') {
    return inferObjectType(value, depth, collected, contextName);
  }

  // All leaf schema values (regex pattern strings) → TypeScript `string`
  return 'string';
}

/**
 * Infer the element type of an array.
 * @param {unknown[]} arr
 * @param {number} depth
 * @param {Map<string, string>} collected
 * @param {string} contextName
 * @returns {string}
 */
export function inferArrayType(arr, depth, collected, contextName) {
  if (arr.length === 0) return 'Array<unknown>';

  const uniqueTypes = [
    ...new Set(arr.map(item => inferType(item, depth, collected, contextName))),
  ];

  return uniqueTypes.length === 1
    ? `Array<${uniqueTypes[0]}>`
    : `Array<${uniqueTypes.join(' | ')}>`;
}

/**
 * Infer the type for a non-array object, handling the empty-string
 * record sentinel and nested objects.
 * @param {Record<string, unknown>} obj
 * @param {number} depth
 * @param {Map<string, string>} collected
 * @param {string} contextName
 * @returns {string}
 */
export function inferObjectType(obj, depth, collected, contextName) {
  if (Object.keys(obj).length === 0) return 'Record<string, unknown>';

  if (isRecordType(obj)) {
    // Record descriptor: { "": ["keyRegex", "valueRegex"] }
    // Both key and value regexes resolve to TypeScript `string`.
    return 'Record<string, string>';
  }

  const body = buildProperties(obj, 0, collected);
  collected.set(contextName, `export interface ${contextName} {\n${body}}\n`);
  return contextName;
}
