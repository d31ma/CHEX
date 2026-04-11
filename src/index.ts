export default class Generator {

  private static readonly INDENT = '    ';

  private static readonly SCHEMA_DIR = typeof window !== "undefined" ? '.' : process.env.SCHEMA_DIR;

  private static readonly collectionSchemas: Map<string, Record<string, unknown>> = new Map();

  /**
   * Main method to convert JSON to TypeScript declarations.
   * Returns all extracted named interfaces followed by the root interface.
   */
  static generateDeclaration(json: unknown, interfaceName = 'Template'): string {
    if (typeof json !== 'object' || json === null) {
      throw new Error('Input must be a valid JSON object');
    }
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(interfaceName)) {
      throw new Error('Invalid interface name: must be a valid TypeScript identifier');
    }

    const collected = new Map<string, string>();
    const body = Generator.buildProperties(json as Record<string, unknown>, 0, collected);
    const root = `export interface ${interfaceName} {\n${body}}\n`;

    return [...collected.values(), root].join('\n');
  }

  /**
   * Build the property lines for an interface body.
   * Shared by the root and all extracted nested interfaces.
   */
  private static buildProperties(
    obj: Record<string, unknown>,
    depth: number,
    collected: Map<string, string>
  ): string {
    const indent = Generator.INDENT.repeat(depth + 1);
    const properties: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const isNullable = key.endsWith('?');
      const cleanKey = Generator.sanitizePropertyName(key);
      const childName = Generator.toPascalCase(cleanKey);
      const type = Generator.inferType(value, depth, collected, childName);
      const nullableSuffix = isNullable ? ' | null' : '';

      properties.push(`${indent}${cleanKey}: ${type}${nullableSuffix};`);
    }

    return properties.join('\n') + '\n';
  }

  /**
   * Infer the TypeScript type for a JSON value.
   * Handles primitives, arrays, plain objects, and JSON Schema keywords.
   */
  private static inferType(
    value: unknown,
    depth: number,
    collected: Map<string, string>,
    contextName: string
  ): string {
    if (value === null) {
      throw new Error(`value cannot be null, please use '?' for nullable properties`);
    }

    if (Array.isArray(value)) {
      return Generator.inferArrayType(value, depth, collected, contextName);
    }

    if (typeof value === 'object') {
      return Generator.inferObjectType(value as Record<string, unknown>, depth, collected, contextName);
    }

    return typeof value;
  }

  /**
   * Infer the element type for an array, producing Array<T> or Array<T1 | T2>.
   */
  private static inferArrayType(
    arr: unknown[],
    depth: number,
    collected: Map<string, string>,
    contextName: string
  ): string {
    if (arr.length === 0) return 'Array<unknown>';

    const uniqueTypes = [...new Set(arr.map(item => Generator.inferType(item, depth, collected, contextName)))];

    return uniqueTypes.length === 1
      ? `Array<${uniqueTypes[0]}>`
      : `Array<${uniqueTypes.join(' | ')}>`;
  }

  /**
   * Infer the type for a non-array object.
   * Handles JSON Schema keywords ($ref, oneOf, allOf, enum) and extracts
   * complex objects as named interfaces into the collector.
   */
  private static inferObjectType(
    obj: Record<string, unknown>,
    depth: number,
    collected: Map<string, string>,
    contextName: string
  ): string {
    if (Object.keys(obj).length === 0) return 'Record<string, unknown>';

    if ('$ref' in obj && typeof obj['$ref'] === 'string') {
      return Generator.resolveRef(obj['$ref']);
    }

    if ('oneOf' in obj && Array.isArray(obj['oneOf'])) {
      return (obj['oneOf'] as unknown[])
        .map((v, i) => Generator.inferType(v, depth, collected, `${contextName}Option${i}`))
        .join(' | ');
    }

    if ('allOf' in obj && Array.isArray(obj['allOf'])) {
      return (obj['allOf'] as unknown[])
        .map((v, i) => Generator.inferType(v, depth, collected, `${contextName}Part${i}`))
        .join(' & ');
    }

    if ('anyOf' in obj && Array.isArray(obj['anyOf'])) {
      return (obj['anyOf'] as unknown[])
        .map((v, i) => Generator.inferType(v, depth, collected, `${contextName}Option${i}`))
        .join(' | ');
    }

    if ('enum' in obj && Array.isArray(obj['enum'])) {
      return Generator.inferEnumType(obj['enum']);
    }

    if (Generator.isRecordType(obj)) {
      const uniqueValueTypes = [...new Set(
        Object.values(obj).map(v => Generator.inferType(v, depth, collected, contextName))
      )];
      return `Record<string, ${uniqueValueTypes.join(' | ')}>`;
    }

    // Complex object: extract as a named interface at depth 0
    const body = Generator.buildProperties(obj, 0, collected);
    collected.set(contextName, `export interface ${contextName} {\n${body}}\n`);
    return contextName;
  }

  /**
   * Resolve a JSON Schema $ref to a type name.
   * Supports "#/definitions/TypeName" and plain "TypeName" forms.
   */
  private static resolveRef(ref: string): string {
    const segments = ref.split('/');
    return segments[segments.length - 1];
  }

  /**
   * Produce a literal union type from a JSON Schema enum array.
   */
  private static inferEnumType(values: unknown[]): string {
    return values
      .map(v => {
        if (typeof v === 'string') return `"${v}"`;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        return 'unknown';
      })
      .join(' | ');
  }

  /**
   * An object is treated as Record<string, V> when it contains an empty-string key ("").
   * This is the explicit signal to use instead of fragile key-count heuristics.
   */
  private static isRecordType(obj: Record<string, unknown>): boolean {
    return '' in obj;
  }

  /**
   * Convert a sanitized property name to PascalCase for use as an interface name.
   */
  private static toPascalCase(name: string): string {
    const clean = name.replace(/"/g, '');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  /**
   * Sanitize a JSON key into a valid TypeScript property name.
   * Strips schema convention characters (?, $, ^) and quotes names
   * that contain non-identifier characters.
   */
  static sanitizePropertyName(key: string): string {
    const cleanKey = key.replace(/[?$^]/g, '');

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanKey)) {
      return `"${cleanKey}"`;
    }

    return cleanKey;
  }

  /**
   * Parse a JSON string and generate TypeScript interface declarations.
   */
  static fromJsonString(jsonString: string, interfaceName?: string): string {
    try {
      const parsed = JSON.parse(jsonString) as unknown;
      return Generator.generateDeclaration(parsed, interfaceName);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate TypeScript interface declarations from a plain object.
   */
  static fromObject(obj: unknown, interfaceName?: string): string {
    return Generator.generateDeclaration(obj, interfaceName);
  }

  /**
   * Validate a data object against the JSON schema for the given collection.
   * Loads and caches the schema on first use.
   */
  static async validateData<T extends Record<string, unknown>>(collection: string, data: T): Promise<T> {

    if (!/^[a-zA-Z0-9_-]+$/.test(collection)) {
      throw new Error('Invalid collection name');
    }

    let schema: Record<string, unknown> = {};

    if (this.collectionSchemas.has(collection)) {
      schema = this.collectionSchemas.get(collection)!;
    } else {
      try {
        const res = await import(`${this.SCHEMA_DIR}/${collection}.json`);
        schema = res.default as Record<string, unknown>;
        this.collectionSchemas.set(collection, schema);
      } catch (error) {
        console.error(`Schema load error for '${collection}':`, error);
        throw new Error('Failed to load schema for the specified collection');
      }
    }

    const truncate = (s: string, n = 100): string => s.length > n ? s.slice(0, n) + '...' : s;

    const validateObject = (data: Record<string, unknown>, schema: Record<string, unknown>, path?: string): Record<string, unknown> => {

      for (const dataKey in data) {
        if (!(dataKey in schema) && !(`${dataKey}?` in schema)) {
          throw new Error(`Property '${truncate(dataKey)}' does not exist in the '${truncate(collection)}' collection schema`);
        }
      }

      for (let schemaKey in schema) {

        const schemaValue = schema[schemaKey];
        const dataValue = data[Generator.sanitizePropertyName(schemaKey)];

        const valueIsDefined = dataValue !== null && dataValue !== undefined;

        const fullPath = path
          ? `${path}.${Generator.sanitizePropertyName(schemaKey)}`
          : Generator.sanitizePropertyName(schemaKey);

        const isNullable = schemaKey.endsWith('?');

        schemaKey = isNullable ? schemaKey.replace('?', '') : schemaKey;

        // Detect a validator descriptor — an object whose keys are a subset of
        // { type, pattern, enum, minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, minLength, maxLength }.
        const DESCRIPTOR_KEYS = new Set([
          'type', 'pattern', 'enum',
          'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
          'minLength', 'maxLength',
        ]);
        const isDescriptor = (
          typeof schemaValue === 'object' &&
          !Array.isArray(schemaValue) &&
          schemaValue !== null &&
          Object.keys(schemaValue as object).length > 0 &&
          Object.keys(schemaValue as object).every(k => DESCRIPTOR_KEYS.has(k))
        );

        if (isDescriptor) {
          const descriptor = schemaValue as {
            type?: string;
            pattern?: string;
            enum?: unknown[];
            minimum?: number;
            maximum?: number;
            exclusiveMinimum?: number;
            exclusiveMaximum?: number;
            multipleOf?: number;
            minLength?: number;
            maxLength?: number;
          };
          const actualType = typeof dataValue;

          if (descriptor.type && actualType !== descriptor.type && !isNullable) {
            throw new Error(
              `Type mismatch for '${truncate(fullPath)}' in '${truncate(collection)}' collection: ` +
              `expected '${descriptor.type}' but got '${actualType}'`
            );
          }

          if (!valueIsDefined && !isNullable) {
            throw new Error(`Property '${truncate(fullPath)}' cannot be null or undefined in '${truncate(collection)}' collection`);
          }

          if (descriptor.pattern && valueIsDefined) {
            if (descriptor.pattern.length > 500) {
              throw new Error(`Regex pattern for '${truncate(fullPath)}' in '${truncate(collection)}' collection exceeds maximum allowed length`);
            }
            let regEx: RegExp;
            try {
              regEx = new RegExp(descriptor.pattern);
            } catch (e) {
              throw new Error(`Invalid RegEx pattern for '${truncate(fullPath)}' in '${truncate(collection)}' collection`);
            }
            if (!regEx.test(dataValue as string)) {
              throw new Error(`RegEx pattern fails for property '${truncate(fullPath)}' in '${truncate(collection)}' collection`);
            }
          }

          if (descriptor.enum && valueIsDefined) {
            if (!descriptor.enum.includes(dataValue)) {
              throw new Error(
                `Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must be one of: ` +
                descriptor.enum.map(v => JSON.stringify(v)).join(', ')
              );
            }
          }

          if (valueIsDefined && typeof dataValue === 'number') {
            if (descriptor.minimum !== undefined && dataValue < descriptor.minimum) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must be >= ${descriptor.minimum}`);
            }
            if (descriptor.maximum !== undefined && dataValue > descriptor.maximum) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must be <= ${descriptor.maximum}`);
            }
            if (descriptor.exclusiveMinimum !== undefined && dataValue <= descriptor.exclusiveMinimum) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must be > ${descriptor.exclusiveMinimum}`);
            }
            if (descriptor.exclusiveMaximum !== undefined && dataValue >= descriptor.exclusiveMaximum) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must be < ${descriptor.exclusiveMaximum}`);
            }
            if (descriptor.multipleOf !== undefined && dataValue % descriptor.multipleOf !== 0) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must be a multiple of ${descriptor.multipleOf}`);
            }
          }

          if (valueIsDefined && typeof dataValue === 'string') {
            if (descriptor.minLength !== undefined && (dataValue as string).length < descriptor.minLength) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must have length >= ${descriptor.minLength}`);
            }
            if (descriptor.maxLength !== undefined && (dataValue as string).length > descriptor.maxLength) {
              throw new Error(`Value for '${truncate(fullPath)}' in '${truncate(collection)}' collection must have length <= ${descriptor.maxLength}`);
            }
          }

          continue;
        }

        const expectedType = typeof schemaValue;
        const actualType = typeof dataValue;

        const hasDefaultValue = (!Object.is(schemaValue, '') || !Object.is(schemaValue, -0) || Array.isArray(schemaValue));

        if (actualType !== expectedType && !isNullable) {
          throw new Error(
            `Type mismatch for '${truncate(fullPath)}' in '${truncate(collection)}' collection: ` +
            `expected '${expectedType}' but got '${actualType}'`
          );
        }

        if (!valueIsDefined && !isNullable) {
          throw new Error(`Property '${truncate(fullPath)}' cannot be null or undefined in '${truncate(collection)}' collection`);
        }

        if (!valueIsDefined && isNullable && hasDefaultValue) {
          data[schemaKey] = schemaValue;
        }

        if (valueIsDefined && expectedType === 'object' && !Array.isArray(dataValue)) {

          const entries = Object.entries(schemaValue as Record<string, unknown>);
          const isEmpty = entries.some(entry => entry[0] === '');

          if (!isEmpty) {
            data[schemaKey] = validateObject(
              dataValue as Record<string, unknown>,
              schemaValue as Record<string, unknown>,
              fullPath
            );
          } else {
            const [, value] = entries[0];

            for (const [k, v] of Object.entries(dataValue as Record<string, unknown>)) {
              if (typeof v !== typeof value) {
                throw new Error(
                  `Type mismatch for '${truncate(fullPath)}.${truncate(k)}' in '${truncate(collection)}' collection: ` +
                  `expected '${typeof value}' but got '${typeof v}'`
                );
              }
            }
          }
        }

        if (valueIsDefined && expectedType === 'object' && Array.isArray(dataValue) && Array.isArray(schemaValue)) {

          const dataTypes = [...new Set((dataValue as unknown[]).map(val => typeof val))];
          const schemaTypes = [...new Set((schemaValue as unknown[]).map(val => typeof val))];

          for (const dataType of dataTypes) {
            if (!schemaTypes.includes(dataType)) {
              throw new Error(
                `Type mismatch for '${truncate(fullPath)}' in '${truncate(collection)}' collection: ` +
                `'${dataType}' is not included in [${schemaTypes.join(',')}]`
              );
            }
          }
        }
      }

      return data;
    };

    return validateObject(data, schema) as T;
  }
}
