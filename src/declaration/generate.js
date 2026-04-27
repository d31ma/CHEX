/**
 * @fileoverview Public entry points for declaration generation.
 */

import { buildProperties } from './infer.js';
import { InvalidInputError, InvalidNameError } from '../errors.js';

/**
 * Convert a JSON object to TypeScript interface declarations. Nested
 * objects are extracted as named interfaces, ordered before the root.
 * @param {unknown} json
 * @param {string} [interfaceName='Template']
 * @returns {string}
 */
export function generateDeclaration(json, interfaceName = 'Template') {
  if (typeof json !== 'object' || json === null) {
    throw new InvalidInputError('Input must be a valid JSON object');
  }
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(interfaceName)) {
    throw new InvalidNameError('Invalid interface name: must be a valid TypeScript identifier');
  }

  const collected = new Map();
  const body = buildProperties(json, 0, collected);
  const root = `export interface ${interfaceName} {\n${body}}\n`;

  return [...collected.values(), root].join('\n');
}

/**
 * Generate declarations from a plain object. Alias for
 * {@link generateDeclaration} — exposed for callers who prefer an
 * intent-revealing name on the read path.
 * @param {unknown} obj
 * @param {string} [interfaceName]
 * @returns {string}
 */
export function fromObject(obj, interfaceName) {
  return generateDeclaration(obj, interfaceName);
}

/**
 * Parse a JSON string and generate declarations from the result.
 * @param {string} jsonString
 * @param {string} [interfaceName]
 * @returns {string}
 */
export function fromJsonString(jsonString, interfaceName) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new InvalidInputError(`Invalid JSON: ${detail}`);
  }
  return generateDeclaration(parsed, interfaceName);
}
