declare module "@vyckr/chex" {

    export default class {

        /**
         * Convert a JSON object to one or more exported TypeScript interface declarations.
         * Nested objects are extracted as named interfaces ordered before the root.
         */
        static generateDeclaration(json: unknown, interfaceName?: string): string

        /**
         * Sanitize a JSON key into a valid TypeScript property name.
         */
        static sanitizePropertyName(key: string): string

        /**
         * Parse a JSON string and generate TypeScript interface declarations.
         */
        static fromJsonString(jsonString: string, interfaceName?: string): string

        /**
         * Generate TypeScript interface declarations from a plain object.
         */
        static fromObject(obj: unknown, interfaceName?: string): string

        /**
         * Validate a data object against the JSON schema for the given collection.
         * Loads and caches the schema on first use.
         */
        static validateData<T extends Record<string, unknown>>(collection: string, data: T): Promise<T>
    }
}