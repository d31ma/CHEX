# CHEX

CHEX is a TypeScript utility for generating type declarations from JSON schema files and validating data against those schemas. It is built to work with Bun and supports schema-driven validation and automatic interface generation.

## Features

- **Generate TypeScript interfaces from JSON schemas**
- **Validate data against collection schemas**
- **Supports nullable fields, regex validation, and default values**
- **Automatic scanning and generation of `.d.ts` files for all schemas in a directory**

## Getting Started

### Installation

```sh
bun add @d31ma/chex
```
## Schema Format

### Primitive fields

```json
{ "age": 0, "active": false, "label": "" }
```

### Nullable fields with defaults

```json
{ "nickname?": "anonymous" }
```

### Regex-validated fields

Use the `{ "type", "pattern" }` descriptor object:

```json
{ "email": { "type": "string", "pattern": "^[a-z]+@[a-z]+\\.[a-z]+$" } }
```

### Enum-constrained fields

Use the `{ "enum": [...] }` descriptor to restrict a field to a fixed set of allowed values:

```json
{ "direction": { "enum": ["north", "south", "east", "west"] } }
{ "priority": { "enum": [1, 2, 3] } }
```

Combine with `"type"` to enforce both a type and an allowed-values constraint:

```json
{ "status": { "type": "string", "enum": ["active", "inactive"] } }
```

`generateDeclaration` maps enum descriptors to TypeScript literal union types (`"north" | "south" | ...`). `validateData` throws if the data value is not one of the listed members.

### Nested objects and records

```json
{
  "address": { "city": "", "country": "" },
  "meta": { "": "" }
}
```

The empty-string key `""` marks a `Record<string, V>` type.

## Security

### What CHEX does NOT provide

- **Authentication**: CHEX does not verify the identity of callers.
- **Authorization**: CHEX does not restrict which collections a caller can access.
- **Path safety**: Always sanitize collection names before passing them to `validateData`. CHEX enforces `^[a-zA-Z0-9_-]+$` and throws immediately for invalid names.

### Input validation guarantees

- Collection names passed to `validateData` are validated against `^[a-zA-Z0-9_-]+$`. Path traversal strings like `../../../etc/passwd` throw `Invalid collection name` immediately.
- Interface names passed to `generateDeclaration` must be valid TypeScript identifiers (`^[a-zA-Z_$][a-zA-Z0-9_$]*$`). Injection payloads throw `Invalid interface name`.
- Regex patterns in `{ type, pattern }` descriptors are limited to 500 characters. Patterns exceeding this limit throw rather than risking CPU exhaustion.

## License

MIT
