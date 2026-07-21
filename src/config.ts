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
