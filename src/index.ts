import type { PluginFunction, PluginValidateFn } from '@graphql-codegen/plugin-helpers';
import { MockBuilderPluginConfig, resolveConfig } from './config';
import { generateMockBuilders } from './generate';

export type { MockBuilderPluginConfig } from './config';
export type { FieldHeuristic } from './heuristics';
export { FIELD_HEURISTICS } from './heuristics';
export { DEFAULT_CUSTOM_SCALARS } from './generate';

export const plugin: PluginFunction<MockBuilderPluginConfig> = (schema, _documents, config) => {
  return generateMockBuilders(schema, resolveConfig(config ?? {}));
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

  expectString('typesFile');
  expectString('namePrefix');
  expectString('nameSuffix');
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
