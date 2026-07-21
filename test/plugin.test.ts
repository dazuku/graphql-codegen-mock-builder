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
  });
});

describe('runtime behavior of generated factories', () => {
  function loadFactories(config: Record<string, unknown> = {}): Record<string, any> {
    const output = generate(config);
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
      throw new Error(`Unexpected require in generated code: ${id}`);
    };
    new Function('require', 'module', 'exports', js)(requireStub, moduleObj, moduleObj.exports);
    return moduleObj.exports;
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
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const tmpDir = path.join(testDir, '.tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const typesPath = path.join(tmpDir, 'types.ts');
    const mocksPath = path.join(tmpDir, 'mocks.ts');
    fs.writeFileSync(typesPath, HANDWRITTEN_TYPES);
    fs.writeFileSync(mocksPath, generate({ typesFile: './types' }));

    const program = ts.createProgram([typesPath, mocksPath], {
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2019,
      skipLibCheck: true,
      types: [],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const messages = diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n')
    );
    expect(messages).toEqual([]);
  });
});
