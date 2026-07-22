import * as changeCaseAll from 'change-case-all';

export type NamingFn = (name: string) => string;

const MODULE_NAME = 'change-case-all';

/**
 * Resolves a graphql-codegen-style naming convention specifier into a function.
 * Supports `'keep'`, `'change-case-all#<fn>'`, and bare function names with
 * kebab-case aliases (`'pascal-case'` → `pascalCase`) — mirroring what the
 * `typescript` plugin accepts for type names. Uses the actual `change-case-all`
 * library so acronym handling matches graphql-codegen byte-for-byte
 * (`BTFActualsCredentials` → `BtfActualsCredentials`).
 */
export function resolveNamingConvention(convention: string): NamingFn {
  if (convention === 'keep') return (name) => name;

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
