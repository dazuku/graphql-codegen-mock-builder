import * as changeCaseAll from 'change-case-all';

export type NamingFn = (name: string) => string;

/**
 * A type-name naming convention, reduced from any accepted config shape:
 * the case function to apply, and whether underscores are dropped
 * (`audit_log` → `AuditLog`) or kept between converted parts (`Audit_Log`).
 */
export interface NamingConventionSpec {
  convention: string;
  transformUnderscore: boolean;
}

const MODULE_NAME = 'change-case-all';

/**
 * Resolves a graphql-codegen-style naming convention into a function.
 * Supports `'keep'`, `'change-case-all#<fn>'`, and bare function names with
 * kebab-case aliases (`'pascal-case'` → `pascalCase`) — mirroring what the
 * `typescript` plugin accepts for type names. Uses the actual `change-case-all`
 * library so acronym handling matches graphql-codegen byte-for-byte
 * (`APICatalogCredentials` → `ApiCatalogCredentials`).
 *
 * Like codegen's `convertFactory`, a name is split on `_`, each part is
 * converted, and the parts are rejoined with `_` — unless `transformUnderscore`
 * is set, in which case the whole name is converted and underscores vanish.
 */
export function resolveNamingConvention({
  convention,
  transformUnderscore,
}: NamingConventionSpec): NamingFn {
  if (convention === 'keep') return (name) => name;
  const convert = resolveCaseFunction(convention);
  if (transformUnderscore) return convert;
  return (name) => name.split('_').map(convert).join('_');
}

function resolveCaseFunction(convention: string): NamingFn {

  let fnName = convention;
  if (convention.includes('#')) {
    const [moduleName, exportName] = convention.split('#');
    if (moduleName !== MODULE_NAME) {
      throw new Error(
        `graphql-codegen-mock-builder: unsupported namingConvention module '${moduleName}' — only '${MODULE_NAME}#<fn>' and 'keep' are supported`
      );
    }
    fnName = exportName;
  }
  fnName = fnName.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());

  const fn = (changeCaseAll as unknown as Record<string, unknown>)[fnName];
  if (typeof fn !== 'function') {
    throw new Error(
      `graphql-codegen-mock-builder: unknown namingConvention function '${fnName}' in '${MODULE_NAME}'`
    );
  }
  return fn as NamingFn;
}
