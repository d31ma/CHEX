/**
 * @fileoverview Pure helpers for translating JSON keys into TypeScript
 * property syntax. None of these functions touch I/O or recurse.
 */

import { InvalidNameError } from '../errors.js';

export const config = {
  allowedSpecialCharacters: ['-', ' ']
};

export const INDENT = '    ';

/**
 * Strip the nullable sigil `?` and quote the result if it isn't a valid JS identifier.
 * Throws InvalidNameError if the key contains unallowed special characters.
 * @param {string} key
 * @returns {string}
 */
export function sanitizePropertyName(key) {
  // Only `?` at the very end is a reserved CHEX sigil for nullability
  const clean = key.replace(/\?$/, '');

  const allowedSet = new Set(config.allowedSpecialCharacters);
  for (const char of clean) {
    if (!/[a-zA-Z0-9_$]/.test(char) && !allowedSet.has(char)) {
      throw new InvalidNameError(`Invalid character '${char}' in property name '${key}'`);
    }
  }

  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean) ? clean : `"${clean}"`;
}

/**
 * Convert a sanitized property name to PascalCase for use as a generated
 * interface name.
 * @param {string} name
 * @returns {string}
 */
export function toPascalCase(name) {
  const clean = name.replace(/"/g, '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * An object is a Record if it has exactly one entry whose key starts
 * with `^`, indicating the key is a regex pattern (not a property name).
 * Format: `{ "^keyRegex$": "^valueRegex$" }`
 * @param {Record<string, unknown>} obj
 * @returns {boolean}
 */
export function isRecordType(obj) {
  const keys = Object.keys(obj);
  return keys.length === 1 && keys[0].startsWith('^');
}
