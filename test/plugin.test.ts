import { buildSchema } from 'graphql';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { plugin, validate } from '../src/index';

const SDL = /* GraphQL */ `
  scalar DateTime

  enum Role {
    ADMIN
    USER
    GUEST
  }

  interface Node {
    id: ID!
  }

  type User implements Node {
    id: ID!
    email: String!
    name: String!
    firstName: String
    age: Int!
    createdAt: DateTime!
    role: Role!
    posts: [Post!]!
    bestFriend: User
    address: Address
  }

  type Address {
    city: String!
    country: String!
    zipCode: String
  }

  type Post implements Node {
    id: ID!
    title: String!
    body: String
    author: User!
    published: Boolean!
    rating: Float
  }

  union SearchResult = Post | User

  input CreateUserInput {
    email: String!
    firstName: String
  }

  type Query {
    user: User
    search: [SearchResult!]!
    node: Node
  }
`;

const schema = buildSchema(SDL);

function generate(config: Record<string, unknown> = {}): string {
  return plugin(schema, [], config) as string;
}

describe('generated output', () => {
  const output = generate();

  it('matches the snapshot', () => {
    expect(output).toMatchSnapshot();
  });

  it('emits an exported factory per object, input, interface, and union type', () => {
    expect(output).toContain('export function mockUser(overrides?: Partial<User>): User');
    expect(output).toContain('export function mockPost(overrides?: Partial<Post>): Post');
    expect(output).toContain('export function mockAddress');
    expect(output).toContain('export function mockCreateUserInput');
    expect(output).toContain('export function mockNode(overrides?: Partial<Node>): Node');
    expect(output).toContain('export function mockSearchResult');
    expect(output).toContain('export function mockQuery');
  });

  it('uses field-name heuristics before type-based fallbacks', () => {
    expect(output).toContain('email: faker.internet.email(),');
    expect(output).toContain('firstName: faker.person.firstName(),');
    expect(output).toContain('name: faker.person.fullName(),');
    expect(output).toContain('age: faker.number.int({ min: 0, max: 100 }),');
    expect(output).toContain('title: faker.lorem.sentence(),');
    expect(output).toContain('body: faker.lorem.paragraph(),');
    expect(output).toContain('city: faker.location.city(),');
    expect(output).toContain('country: faker.location.country(),');
    expect(output).toContain('zipCode: faker.location.zipCode(),');
    expect(output).toContain('id: faker.string.uuid(),');
  });

  it('falls back to type-based faker calls', () => {
    expect(output).toContain('published: faker.datatype.boolean(),');
    expect(output).toContain('rating: faker.number.float(),');
  });

  it('handles the DateTime custom scalar with the built-in default', () => {
    expect(output).toContain('createdAt: faker.date.recent().toISOString(),');
  });

  it('includes __typename on object types by default', () => {
    expect(output).toContain("__typename: 'User',");
    expect(output).toContain("__typename: 'Post',");
  });

  it('picks the first enum value deterministically by default', () => {
    expect(output).toContain('role: "ADMIN" as Role,');
  });

  it('generates lists with the default length of 2', () => {
    expect(output).toContain('search: Array.from({ length: 2 }, () => mockSearchResult()),');
  });

  it('calls nested factories for object and interface fields', () => {
    expect(output).toContain('address: mockAddress(),');
    expect(output).toContain('node: mockNode(),');
  });

  it('terminates circular relationships (nullable → null, lists → [])', () => {
    expect(output).toContain('bestFriend: null,');
    // User ↔ Post cycle: the list side breaks the cycle with [] ...
    expect(output).toContain('posts: [],');
    // ... while the NonNull non-list side still recurses.
    expect(output).toContain('author: mockUser(),');
  });

  it('delegates interfaces and unions to their first concrete member', () => {
    expect(output).toMatch(/export function mockNode[\s\S]*?\.\.\.mockPost\(\)/);
    expect(output).toMatch(/export function mockSearchResult[\s\S]*?\.\.\.mockPost\(\)/);
  });

  it('spreads overrides last in every factory', () => {
    const factories = output.match(/export function mock/g) ?? [];
    const overrideSpreads = output.match(/\.\.\.overrides,/g) ?? [];
    expect(factories.length).toBeGreaterThan(0);
    expect(overrideSpreads.length).toBe(factories.length);
  });

  it('does not import types when typesFile is unset', () => {
    expect(output).not.toContain('import type');
  });
});

describe('config options', () => {
  it('typesFile emits a sorted type-only import', () => {
    const output = generate({ typesFile: './types' });
    expect(output).toContain(
      "import type { Address, CreateUserInput, Node, Post, Query, Role, SearchResult, User } from './types';"
    );
  });

  it('addTypename: false drops __typename', () => {
    const output = generate({ addTypename: false });
    expect(output).not.toContain('__typename');
  });

  it('includeNullableFields: false nulls out nullable fields', () => {
    const output = generate({ includeNullableFields: false });
    expect(output).toContain('firstName: null,');
    expect(output).toContain('rating: null,');
    // NonNull fields still get values.
    expect(output).toContain('email: faker.internet.email(),');
  });

  it('listLength controls generated array lengths', () => {
    const output = generate({ listLength: 5 });
    expect(output).toContain('Array.from({ length: 5 }, () => mockSearchResult())');
  });

  it('enumsAsRandom picks a random enum value at runtime', () => {
    const output = generate({ enumsAsRandom: true });
    expect(output).toContain(
      'role: faker.helpers.arrayElement(["ADMIN", "USER", "GUEST"]) as Role,'
    );
  });

  it('namePrefix / nameSuffix control factory naming', () => {
    const output = generate({ namePrefix: 'a', nameSuffix: 'Mock' });
    expect(output).toContain('export function aUserMock(overrides?: Partial<User>): User');
    expect(output).toContain('author: aUserMock(),');
  });

  it('scalars config overrides the built-in custom scalar defaults', () => {
    const output = generate({ scalars: { DateTime: 'faker.date.past().toISOString()' } });
    expect(output).toContain('createdAt: faker.date.past().toISOString(),');
  });

  it('terminateCircularRelationships: false recurses into nullable circular fields', () => {
    const output = generate({ terminateCircularRelationships: false });
    expect(output).toContain('bestFriend: mockUser(),');
  });
});

describe('validate', () => {
  it('accepts a valid config', () => {
    expect(() =>
      validate(schema, [], { typesFile: './types', listLength: 3, addTypename: false }, '', [])
    ).not.toThrow();
  });

  it('rejects invalid config values', () => {
    expect(() => validate(schema, [], { listLength: -1 }, '', [])).toThrow(/listLength/);
    expect(() => validate(schema, [], { addTypename: 'yes' as never }, '', [])).toThrow(
      /addTypename/
    );
    expect(() => validate(schema, [], { scalars: { DateTime: 5 } as never }, '', [])).toThrow(
      /scalars\.DateTime/
    );
    expect(() => validate(schema, [], { typesPrefix: 1 as never }, '', [])).toThrow(/typesPrefix/);
    expect(() => validate(schema, [], { enumStyle: 'enum' as never }, '', [])).toThrow(
      /enumStyle/
    );
  });

  it('accepts the consumer-style config', () => {
    expect(() =>
      validate(schema, [], { typesPrefix: 'I', typesSuffix: '', enumStyle: 'ts-enum' }, '', [])
    ).not.toThrow();
  });
});

/** Transpiles generated output to CJS and executes it with faker (and any stubbed modules) in scope. */
function executeGenerated(
  output: string,
  extraModules: Record<string, unknown> = {}
): Record<string, any> {
  const js = ts.transpileModule(output, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const moduleObj = { exports: {} as Record<string, any> };
  const requireStub = (id: string) => {
    if (id === '@faker-js/faker') return { faker };
    if (id in extraModules) return extraModules[id];
    throw new Error(`Unexpected require in generated code: ${id}`);
  };
  new Function('require', 'module', 'exports', js)(requireStub, moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

/** Runs ts.createProgram (strict) over the given files and returns flattened diagnostic messages. */
function typeCheck(files: Record<string, string>): string[] {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const tmpDir = path.join(testDir, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const paths = Object.entries(files).map(([name, content]) => {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  });
  const program = ts.createProgram(paths, {
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    target: ts.ScriptTarget.ES2019,
    skipLibCheck: true,
    types: [],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('runtime behavior of generated factories', () => {
  function loadFactories(config: Record<string, unknown> = {}): Record<string, any> {
    return executeGenerated(generate(config));
  }

  it('factories return fresh faker data on every call', () => {
    const { mockUser } = loadFactories();
    const a = mockUser();
    const b = mockUser();
    expect(a.id).not.toBe(b.id);
    expect(a.email).toContain('@');
    expect(typeof a.age).toBe('number');
    expect(a.age).toBeGreaterThanOrEqual(0);
    expect(a.age).toBeLessThanOrEqual(100);
    expect(a.__typename).toBe('User');
    expect(a.role).toBe('ADMIN');
    expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
  });

  it('overrides win over generated values', () => {
    const { mockUser } = loadFactories();
    const user = mockUser({ email: 'fixed@example.com', age: 7 });
    expect(user.email).toBe('fixed@example.com');
    expect(user.age).toBe(7);
    expect(user.__typename).toBe('User');
  });

  it('nested factories produce nested objects and recursion terminates', () => {
    const { mockUser, mockPost } = loadFactories();
    const user = mockUser();
    expect(user.bestFriend).toBeNull();
    expect(user.posts).toEqual([]);
    expect(typeof user.address.city).toBe('string');

    const post = mockPost();
    expect(post.author.__typename).toBe('User');
    expect(post.author.posts).toEqual([]);
  });

  it('input factories and list lengths behave as configured', () => {
    const { mockCreateUserInput, mockQuery } = loadFactories({ listLength: 3 });
    const input = mockCreateUserInput();
    expect(input.__typename).toBeUndefined();
    expect(input.email).toContain('@');
    const query = mockQuery();
    expect(query.search).toHaveLength(3);
    expect(['Post', 'User']).toContain(query.search[0].__typename);
  });
});

describe('type safety of generated code', () => {
  const HANDWRITTEN_TYPES = `
export type Maybe<T> = T | null;

export enum Role {
  Admin = 'ADMIN',
  User = 'USER',
  Guest = 'GUEST',
}

export type Node = {
  id: string;
};

export type Address = {
  __typename?: 'Address';
  city: string;
  country: string;
  zipCode?: Maybe<string>;
};

export type User = {
  __typename?: 'User';
  address?: Maybe<Address>;
  age: number;
  bestFriend?: Maybe<User>;
  createdAt: string;
  email: string;
  firstName?: Maybe<string>;
  id: string;
  name: string;
  posts: Array<Post>;
  role: Role;
};

export type Post = {
  __typename?: 'Post';
  author: User;
  body?: Maybe<string>;
  id: string;
  published: boolean;
  rating?: Maybe<number>;
  title: string;
};

export type SearchResult = Post | User;

export type CreateUserInput = {
  email: string;
  firstName?: Maybe<string>;
};

export type Query = {
  __typename?: 'Query';
  node?: Maybe<Node>;
  search: Array<SearchResult>;
  user?: Maybe<User>;
};
`;

  it('the generated file type-checks against a typescript-plugin-style types file', () => {
    const messages = typeCheck({
      'types.ts': HANDWRITTEN_TYPES,
      'mocks.ts': generate({ typesFile: './types' }),
    });
    expect(messages).toEqual([]);
  });
});

describe('consumer-style output (typesPrefix + ts-enum + preResolveTypes:false)', () => {
  const CONSUMER_SDL = /* GraphQL */ `
    scalar ISO8601DateTime

    enum Status {
      active
      inactive
      pending
    }

    type Shipment {
      id: ID!
      status: Status!
      createdAt: ISO8601DateTime!
      reference: String
      stops: [Stop!]!
      parent: Shipment
    }

    type Stop {
      city: String!
      shipment: Shipment!
    }

    type Query {
      shipment: Shipment
    }
  `;

  const consumerSchema = buildSchema(CONSUMER_SDL);

  const CONSUMER_CONFIG = {
    typesFile: './consumer-types',
    typesPrefix: 'I',
    enumStyle: 'ts-enum',
    scalars: { ISO8601DateTime: 'faker.date.recent().toISOString()' },
    addTypename: true,
  };

  function generateConsumer(config: Record<string, unknown> = CONSUMER_CONFIG): string {
    return plugin(consumerSchema, [], config) as string;
  }

  // Emulates real graphql-codegen `typescript` plugin output with
  // typesPrefix: 'I', real TS enums (namingConvention.enumValues: 'keep'),
  // and preResolveTypes: false (optional __typename literals, Maybe includes undefined).
  const CONSUMER_TYPES = `
export type Maybe<T> = T | null | undefined;

export enum IStatus {
  active = 'active',
  inactive = 'inactive',
  pending = 'pending',
}

export type IShipment = {
  __typename?: 'Shipment';
  createdAt: string;
  id: string;
  parent?: Maybe<IShipment>;
  reference?: Maybe<string>;
  status: IStatus;
  stops: Array<IStop>;
};

export type IStop = {
  __typename?: 'Stop';
  city: string;
  shipment: IShipment;
};

export type IQuery = {
  __typename?: 'Query';
  shipment?: Maybe<IShipment>;
};
`;

  it('prefixes type references but not factory names', () => {
    const output = generateConsumer();
    expect(output).toContain(
      'export function mockShipment(overrides?: Partial<IShipment>): IShipment'
    );
    expect(output).toContain('export function mockStop(overrides?: Partial<IStop>): IStop');
    expect(output).toContain('shipment: mockShipment(),');
    expect(output).not.toContain('mockIShipment');
  });

  it('applies typesSuffix too', () => {
    const output = generateConsumer({ typesPrefix: 'I', typesSuffix: 'Type' });
    expect(output).toContain(
      'export function mockShipment(overrides?: Partial<IShipmentType>): IShipmentType'
    );
  });

  it('splits imports: type-only for types, value import for ts-enum enums', () => {
    const output = generateConsumer();
    expect(output).toContain(
      "import type { IQuery, IShipment, IStop } from './consumer-types';"
    );
    expect(output).toContain("import { IStatus } from './consumer-types';");
  });

  it('keeps enums in the type-only import under union style', () => {
    const output = generateConsumer({ ...CONSUMER_CONFIG, enumStyle: 'union' });
    expect(output).toContain(
      "import type { IQuery, IShipment, IStatus, IStop } from './consumer-types';"
    );
    expect(output).not.toContain("import { IStatus }");
    expect(output).toContain('status: "active" as IStatus,');
  });

  it('emits member-name-agnostic enum references under ts-enum', () => {
    const output = generateConsumer();
    expect(output).toContain('status: Object.values(IStatus)[0] as IStatus,');
    const random = generateConsumer({ ...CONSUMER_CONFIG, enumsAsRandom: true });
    expect(random).toContain(
      'status: faker.helpers.arrayElement(Object.values(IStatus)) as IStatus,'
    );
  });

  it('keeps __typename as the raw GraphQL type name and handles the custom scalar', () => {
    const output = generateConsumer();
    expect(output).toContain("__typename: 'Shipment',");
    expect(output).not.toContain("__typename: 'IShipment'");
    expect(output).toContain('createdAt: faker.date.recent().toISOString(),');
  });

  it('terminates the circular Shipment ↔ Stop / parent relationships', () => {
    const output = generateConsumer();
    expect(output).toContain('parent: null,');
    expect(output).toContain('stops: [],');
    expect(output).toContain('shipment: mockShipment(),');
  });

  it('type-checks with ZERO diagnostics against real-enum consumer types', () => {
    const messages = typeCheck({
      'consumer-types.ts': CONSUMER_TYPES,
      'consumer-mocks.ts': generateConsumer(),
    });
    expect(messages).toEqual([]);
  });

  it('resolves ts-enum references to a valid enum value at runtime, and overrides win', () => {
    const IStatus = { active: 'active', inactive: 'inactive', pending: 'pending' };
    const { mockShipment, mockStop } = executeGenerated(generateConsumer(), {
      './consumer-types': { IStatus },
    });
    const shipment = mockShipment();
    expect(shipment.status).toBe('active');
    expect(Object.values(IStatus)).toContain(shipment.status);
    expect(shipment.__typename).toBe('Shipment');
    expect(shipment.parent).toBeNull();
    expect(shipment.stops).toEqual([]);
    expect(typeof shipment.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(shipment.createdAt))).toBe(false);

    const overridden = mockShipment({ status: IStatus.pending, reference: 'REF-1' });
    expect(overridden.status).toBe('pending');
    expect(overridden.reference).toBe('REF-1');

    expect(mockStop().shipment.__typename).toBe('Shipment');
  });
});
