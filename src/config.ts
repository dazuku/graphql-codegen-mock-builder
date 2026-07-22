/**
 * How enum values are emitted.
 * - `'union'`: string literal cast (`'VALUE' as Status`) — for string-union enum types.
 * - `'ts-enum'`: runtime member reference (`Object.values(Status)[0]`) — for real TS `enum`s.
 */
export type EnumStyle = 'union' | 'ts-enum';

/**
 * Configuration accepted by the mock-builder plugin. All keys are optional.
 */
export interface MockBuilderPluginConfig {
  /**
   * Import path for the co-generated TypeScript types (e.g. `'./types'`).
   * When set, the output starts with `import type { ... } from '<typesFile>'`.
   * When unset, no import is emitted and the type names are expected to be in
   * scope — i.e. co-generate the `typescript` plugin into the same output file.
   */
  typesFile?: string;

  /**
   * Custom scalar name → faker (or any TS) expression, emitted verbatim as the
   * field's value expression. Merged over the built-in defaults
   * (DateTime/Date/Time/JSON/JSONObject/BigInt/UUID).
   */
  scalars?: Record<string, string>;

  /**
   * Naming convention applied to TypeScript type-name identifiers (and the
   * type-name part of factory names), mirroring the `typescript` plugin's
   * `namingConvention` for type names. Default:
   * `'change-case-all#pascalCase'` — graphql-codegen's own default — which
   * lowercases acronym runs (`BTFActualsCredentials` → `BtfActualsCredentials`).
   * Accepts `'keep'`, `'change-case-all#<fn>'`, or a bare/kebab-case function
   * name (`'pascalCase'`, `'pascal-case'`). The `__typename` literal always
   * stays the raw GraphQL type name. `typesPrefix`/`typesSuffix` are applied
   * AFTER conversion.
   */
  namingConvention?: string;

  /**
   * Prefix applied to every generated *type name* reference (imports, return
   * types, `Partial<...>`, enum casts) — set it to match the sibling
   * `typescript` plugin's `typesPrefix` (e.g. `'I'` → `IUser`). Does NOT
   * affect factory function names. Default: `''`.
   */
  typesPrefix?: string;

  /** Suffix counterpart of `typesPrefix`, matching the `typescript` plugin's `typesSuffix`. Default: `''`. */
  typesSuffix?: string;

  /**
   * How enum field values are emitted. `'union'` (default) emits a string
   * literal cast (`'VALUE' as Status`), which type-checks against string-union
   * enum types. `'ts-enum'` emits a runtime member reference
   * (`Object.values(Status)[0]`), required when the types file declares real
   * TS `enum`s — string casts fail (TS2352) against those, and member
   * references stay correct regardless of the enum's member-naming convention.
   * Under `'ts-enum'`, enums are runtime values, so they are imported with a
   * value import (`import { ... }`) instead of `import type`.
   */
  enumStyle?: EnumStyle;

  /** Factory name prefix. Default: `'mock'` (→ `mockUser`). */
  namePrefix?: string;

  /** Factory name suffix. Default: `''`. */
  nameSuffix?: string;

  /** Generated array length for list fields. Default: `2`. */
  listLength?: number;

  /**
   * When true, enum fields pick a random value at runtime
   * (`faker.helpers.arrayElement([...])`). When false (default), the first
   * enum value is used deterministically.
   */
  enumsAsRandom?: boolean;

  /**
   * When true (default), fields participating in a reference cycle are
   * short-circuited: circular list fields become `[]` and circular nullable
   * fields become `null`. NonNull, non-list circular fields still recurse —
   * a schema whose cycles consist solely of such fields cannot be mocked
   * without infinite recursion (documented limitation).
   */
  terminateCircularRelationships?: boolean;

  /** Include a `__typename` literal on object type mocks. Default: `true`. */
  addTypename?: boolean;

  /**
   * When true (default), nullable fields are populated with mock values.
   * When false, nullable fields are set to `null`.
   */
  includeNullableFields?: boolean;
}

export interface ResolvedConfig extends Required<Omit<MockBuilderPluginConfig, 'typesFile'>> {
  typesFile?: string;
}

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'typesFile'> = {
  scalars: {},
  namingConvention: 'change-case-all#pascalCase',
  typesPrefix: '',
  typesSuffix: '',
  enumStyle: 'union',
  namePrefix: 'mock',
  nameSuffix: '',
  listLength: 2,
  enumsAsRandom: false,
  terminateCircularRelationships: true,
  addTypename: true,
  includeNullableFields: true,
};

export function resolveConfig(config: MockBuilderPluginConfig): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    scalars: { ...(config.scalars ?? {}) },
  };
}
