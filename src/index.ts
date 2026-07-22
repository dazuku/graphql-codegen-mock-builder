import type { PluginFunction, PluginValidateFn } from '@graphql-codegen/plugin-helpers';
import { MockBuilderPluginConfig, normalizeNamingConvention, resolveConfig } from './config';
import { generateMockBuilders } from './generate';
import { generateOperationMockBuilders } from './operations';
import { resolveNamingConvention } from './naming';

export type { EnumStyle, Mode, MockBuilderPluginConfig } from './config';
export type { FieldHeuristic } from './heuristics';
export { FIELD_HEURISTICS } from './heuristics';
export { DEFAULT_CUSTOM_SCALARS } from './generate';

export const plugin: PluginFunction<MockBuilderPluginConfig> = (schema, documents, config) => {
  const resolved = resolveConfig(config ?? {});
  if (resolved.mode === 'operations') {
    // The near-operation-file preset injects resolved cross-file fragments as
    // `externalFragments` on the config; pass them through for spread resolution.
    const externalFragments = (config as { externalFragments?: { node?: unknown }[] } | undefined)
      ?.externalFragments;
    return generateOperationMockBuilders(schema, documents ?? [], resolved, externalFragments);
  }
  return generateMockBuilders(schema, resolved);
};

export const validate: PluginValidateFn<MockBuilderPluginConfig> = (
  _schema,
  _documents,
  config
) => {
  const errors: string[] = [];
  const cfg = config ?? {};

  const expectString = (key: keyof MockBuilderPluginConfig) => {
    const value = cfg[key];
    if (value !== undefined && typeof value !== 'string') {
      errors.push(`\`${key}\` must be a string, got ${typeof value}`);
    }
  };
  const expectBoolean = (key: keyof MockBuilderPluginConfig) => {
    const value = cfg[key];
    if (value !== undefined && typeof value !== 'boolean') {
      errors.push(`\`${key}\` must be a boolean, got ${typeof value}`);
    }
  };

  if (cfg.mode !== undefined && cfg.mode !== 'schema' && cfg.mode !== 'operations') {
    errors.push(`\`mode\` must be 'schema' or 'operations', got ${JSON.stringify(cfg.mode)}`);
  }
  expectString('fragmentSuffix');
  expectString('operationResultSuffix');
  expectString('baseTypesNamespace');
  expectBoolean('omitOperationSuffix');

  expectString('typesFile');
  // `namingConvention` may be a string or graphql-codegen's object form
  // (`{ typeNames, enumValues, … }`); normalize, then validate the resolved string.
  const nc = cfg.namingConvention;
  if (nc !== undefined && typeof nc !== 'string' && (typeof nc !== 'object' || nc === null)) {
    errors.push(`\`namingConvention\` must be a string or object, got ${typeof nc}`);
  } else {
    try {
      resolveNamingConvention(normalizeNamingConvention(nc));
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  expectString('typesPrefix');
  expectString('typesSuffix');
  expectString('namePrefix');
  expectString('nameSuffix');

  if (cfg.enumStyle !== undefined && cfg.enumStyle !== 'union' && cfg.enumStyle !== 'ts-enum') {
    errors.push(`\`enumStyle\` must be 'union' or 'ts-enum', got ${JSON.stringify(cfg.enumStyle)}`);
  }
  expectBoolean('enumsAsRandom');
  expectBoolean('terminateCircularRelationships');
  expectBoolean('addTypename');
  expectBoolean('includeNullableFields');

  if (
    cfg.listLength !== undefined &&
    (typeof cfg.listLength !== 'number' || !Number.isInteger(cfg.listLength) || cfg.listLength < 0)
  ) {
    errors.push(`\`listLength\` must be a non-negative integer, got ${JSON.stringify(cfg.listLength)}`);
  }

  if (cfg.scalars !== undefined) {
    if (typeof cfg.scalars !== 'object' || cfg.scalars === null || Array.isArray(cfg.scalars)) {
      errors.push('`scalars` must be an object mapping scalar names to expressions');
    } else {
      for (const [name, expression] of Object.entries(cfg.scalars)) {
        if (typeof expression !== 'string') {
          errors.push(`\`scalars.${name}\` must be a string expression, got ${typeof expression}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`graphql-codegen-mock-builder: invalid configuration:\n- ${errors.join('\n- ')}`);
  }
};
