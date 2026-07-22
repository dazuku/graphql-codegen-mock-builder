# graphql-codegen-mock-builder

A [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) plugin that generates **typed mock-builder factory functions** powered by [`@faker-js/faker`](https://fakerjs.dev/).

For every object, input object, interface, and union type in your schema it emits a factory like:

```ts
export function mockUser(overrides?: Partial<User>): User {
  return {
    __typename: 'User',
    age: faker.number.int({ min: 0, max: 100 }),
    createdAt: faker.date.recent().toISOString(),
    email: faker.internet.email(),
    firstName: faker.person.firstName(),
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    ...overrides,
  };
}
```

The factories call faker **at invocation time** — every call produces fresh data — and `overrides` is spread last, so callers can pin any field:

```ts
const admin = mockUser({ email: 'admin@example.com', role: Role.Admin });
```

## Install

```sh
npm install --save-dev graphql-codegen-mock-builder @graphql-codegen/cli
```

The **generated** code imports `@faker-js/faker`, so the consuming project needs it installed (v9 or v10):

```sh
npm install --save-dev @faker-js/faker
```

## Usage

`codegen.ts`:

```ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'schema.graphql',
  generates: {
    'src/generated/types.ts': {
      plugins: ['typescript'],
    },
    'src/generated/mocks.ts': {
      plugins: ['graphql-codegen-mock-builder'],
      config: {
        typesFile: './types',
        scalars: {
          DateTime: 'faker.date.recent().toISOString()',
        },
      },
    },
  },
};

export default config;
```

Or `codegen.yml`:

```yaml
schema: schema.graphql
generates:
  src/generated/types.ts:
    plugins:
      - typescript
  src/generated/mocks.ts:
    plugins:
      - graphql-codegen-mock-builder
    config:
      typesFile: './types'
```

### Without `typesFile`

When `typesFile` is not set, **no type import is emitted** and the type names (`User`, `Role`, …) are expected to already be in scope. Use this mode by co-generating the `typescript` plugin into the **same output file**:

```yaml
generates:
  src/generated/mocks.ts:
    plugins:
      - typescript
      - graphql-codegen-mock-builder
```

## Config options

All options are optional.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `typesFile` | `string` | — | Import path for the generated TS types (e.g. `'./types'`). When set, emits `import type { ... } from '<typesFile>'`. When unset, types must be in scope (co-generate the `typescript` plugin into the same file). |
| `scalars` | `Record<string, string>` | `{}` | Custom scalar name → expression emitted **verbatim** as the value. Merged over the built-in defaults (see below). |
| `namePrefix` | `string` | `'mock'` | Factory name prefix (`mockUser`). |
| `nameSuffix` | `string` | `''` | Factory name suffix (`mockUserFixture` with `nameSuffix: 'Fixture'`). |
| `listLength` | `number` | `2` | Array length generated for list fields. |
| `enumsAsRandom` | `boolean` | `false` | If `true`, enum fields pick a random value at runtime via `faker.helpers.arrayElement([...])`; otherwise the first enum value is used deterministically. |
| `terminateCircularRelationships` | `boolean` | `true` | Break reference cycles: circular list fields become `[]`, circular nullable fields become `null`. See [Circular types](#circular-types). |
| `addTypename` | `boolean` | `true` | Include a `__typename: 'TypeName'` literal on object type mocks. |
| `includeNullableFields` | `boolean` | `true` | If `true`, nullable fields are populated with mock values (more useful mocks); if `false`, they are set to `null`. |

## How values are chosen

1. **Field-name heuristics** (checked first, for `String`/`ID`/`Int`/`Float` fields).
2. **Custom scalar map** (`scalars` config merged over built-in defaults).
3. **Type-based fallback** for built-in scalars.
4. **Nested factories** for object / input / interface / union fields; enums inline a value.

### Field-name heuristics

Defined as an ordered, easily extendable table (`FIELD_HEURISTICS` in `src/heuristics.ts`, exported from the package). First match that fits the field's scalar category wins. Most patterns are case-insensitive; the date pattern is case-sensitive so `...At` only matches camelCase boundaries (`createdAt`, not `format`).

| Field name (pattern) | Faker call |
| --- | --- |
| `id`, `uuid`, `guid` | `faker.string.uuid()` |
| `*email` | `faker.internet.email()` |
| `firstName` / `first_name` | `faker.person.firstName()` |
| `lastName` / `last_name` | `faker.person.lastName()` |
| `name`, `fullName` / `full_name` | `faker.person.fullName()` |
| `username` / `user_name` | `faker.internet.username()` |
| `*phone*` | `faker.phone.number()` |
| `*url`, `*website` | `faker.internet.url()` |
| `*avatar`, `*image` | `faker.image.url()` |
| `*price`, `*amount`, `*cost`, `*total` | `faker.commerce.price()` (wrapped in `Number(...)` for Int/Float fields) |
| `description`, `bio`, `content`, `body` | `faker.lorem.paragraph()` |
| `title` | `faker.lorem.sentence()` |
| `city` | `faker.location.city()` |
| `country` | `faker.location.country()` |
| `*address` | `faker.location.streetAddress()` |
| `zip`, `zipCode`, `postalCode` | `faker.location.zipCode()` |
| `date`, `*Date`, `*At`, `*_at` | `faker.date.recent().toISOString()` |
| `age` | `faker.number.int({ min: 0, max: 100 })` |
| `color` / `colour` | `faker.color.human()` |
| `company` | `faker.company.name()` |

### Type-based fallbacks

| GraphQL scalar | Faker call |
| --- | --- |
| `ID` | `faker.string.uuid()` |
| `String` | `faker.lorem.word()` |
| `Int` | `faker.number.int()` |
| `Float` | `faker.number.float()` |
| `Boolean` | `faker.datatype.boolean()` |

### Custom scalars

Built-in defaults (override or extend via the `scalars` option):

| Scalar | Expression |
| --- | --- |
| `DateTime` | `faker.date.recent().toISOString()` |
| `Date` | `faker.date.recent().toISOString().slice(0, 10)` |
| `Time` | `faker.date.recent().toISOString().slice(11)` |
| `JSON`, `JSONObject` | `{}` |
| `BigInt` | `faker.number.int()` |
| `UUID` | `faker.string.uuid()` |

Any string you provide is emitted **verbatim** as the value expression:

```yaml
config:
  scalars:
    DateTime: 'faker.date.past().toISOString()'
    Money: 'Number(faker.commerce.price())'
    GeoJSON: '{ type: "Point", coordinates: [0, 0] }'
```

Custom scalars with no built-in or configured mapping fall back to `faker.lorem.word()`.

## Type coverage

- **Object types**: full factory with `__typename` (configurable) and every field populated.
- **Input object types**: factory without `__typename`.
- **Interface types**: factory that delegates to the first (alphabetical) implementing type's factory.
- **Union types**: factory that delegates to the first (alphabetical) member's factory.
- **Enums**: first value deterministically (or random with `enumsAsRandom`).
- **Lists**: arrays of `listLength` freshly generated elements, recursively.
- **Nullability**: NonNull fields always get a value; nullable fields also get a value by default (`includeNullableFields: false` to null them out).

Output is deterministic and diff-friendly: types and fields are emitted in alphabetical order.

## Circular types

Self-referential and mutually-recursive types would recurse forever at runtime, so with `terminateCircularRelationships: true` (the default) any field whose target type can reach back to the containing type is short-circuited:

- circular **list** fields → `[]`
- circular **nullable** fields → `null`
- circular **NonNull, non-list** fields → still call the nested factory

**Limitation:** a cycle made up *exclusively* of NonNull, non-list fields (e.g. `type A { b: B! }` / `type B { a: A! }`) cannot be terminated and the generated factories will recurse infinitely at runtime. Break such cycles in the schema, or override the field when calling the factory. Cycles that pass through at least one list or nullable field are always safe — codegen itself never infinite-loops regardless (cycle detection runs on the type graph, and factories reference each other by name rather than being inlined).

## Development

```sh
npm install
npm run build   # tsc → dist/ (.js + .d.ts)
npm test        # vitest
```

## Publishing

Releases are published to npm automatically by GitHub Actions
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)) whenever a
GitHub Release is published. The workflow builds, tests, and runs
`npm publish` with [provenance](https://docs.npmjs.com/generating-provenance-statements).

**One-time setup:** add an npm automation token as the `NPM_TOKEN` repo secret:

```sh
# create a "Automation" token at https://www.npmjs.com/settings/<user>/tokens
gh secret set NPM_TOKEN --repo dazuku/graphql-codegen-mock-builder
```

**Cutting a release:**

```sh
npm version patch          # bumps package.json + creates a git tag
git push --follow-tags
gh release create v0.1.1 --generate-notes   # triggers the publish workflow
```

To publish manually from your machine instead:

```sh
npm login
npm publish                # prepublishOnly runs the build; publishConfig sets public access
```

## License

MIT

