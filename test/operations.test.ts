import { buildSchema, parse } from 'graphql';
import * as ts from 'typescript';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { plugin } from '../src/index';

// User <-> Org form a NonNull, non-list reference cycle: schema mode cannot mock
// these without overflowing. Operations mode walks the finite selection set, so
// a fragment that stops short of the cycle terminates.
const SDL = /* GraphQL */ `
  scalar DateTime

  enum NotificationType {
    ASSIGNED
    MENTIONED
  }

  type User {
    id: ID!
    fullName: String!
    emailAddress: String!
    org: Org!
  }

  type Org {
    id: ID!
    name: String!
    owner: User!
  }

  type Rfp {
    id: ID!
    displayId: Int!
    name: String!
  }

  union Target = Rfp | Org

  type Notification {
    id: ID!
    createdAt: DateTime!
    type: NotificationType!
    actor: User!
    target: Target
  }

  type Query {
    notifications: [Notification!]!
  }
`;

const schema = buildSchema(SDL);

const DOC = /* GraphQL */ `
  fragment ActorParts on User {
    id
    fullName
    emailAddress
  }

  fragment NotificationParts on Notification {
    id
    createdAt
    type
    actor {
      ...ActorParts
    }
    target {
      ... on Rfp {
        id
        displayId
        name
      }
      ... on Org {
        id
        name
      }
    }
  }

  query GetNotifications {
    notifications {
      ...NotificationParts
    }
  }
`;

function generate(config: Record<string, unknown> = {}): string {
  return plugin(schema, [{ document: parse(DOC) }], {
    mode: 'operations',
    typesFile: './types',
    typesPrefix: 'I',
    scalars: { DateTime: 'faker.date.recent().toISOString()' },
    ...config,
  }) as string;
}

/** Transpile to CJS and run with faker stubbed (types import is erased). */
function execute(output: string): Record<string, any> {
  const js = ts.transpileModule(output, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const moduleObj = { exports: {} as Record<string, any> };
  const requireStub = (id: string) => {
    if (id === '@faker-js/faker') return { faker };
    throw new Error(`Unexpected require: ${id}`);
  };
  new Function('require', 'module', 'exports', js)(requireStub, moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

describe('operations mode — emitted structure', () => {
  const output = generate();

  it('emits a factory per fragment and operation, typed to the near-op-file names', () => {
    expect(output).toContain(
      'export function mockActorParts(overrides?: Partial<IActorPartsFragment>): IActorPartsFragment'
    );
    expect(output).toContain(
      'export function mockNotificationParts(overrides?: Partial<INotificationPartsFragment>): INotificationPartsFragment'
    );
    expect(output).toContain(
      'export function mockGetNotificationsQuery(overrides?: Partial<IGetNotificationsQuery>): IGetNotificationsQuery'
    );
  });

  it('imports faker and the result types', () => {
    expect(output).toContain("import { faker } from '@faker-js/faker';");
    expect(output).toContain('IActorPartsFragment');
    expect(output).toContain("from './types';");
  });

  it('namespaces base enums under Types when configured (near-operation-file)', () => {
    const nsOutput = generate({ enumStyle: 'ts-enum', baseTypesNamespace: 'Types' });
    expect(nsOutput).toContain('Types.INotificationType');
    expect(nsOutput).not.toContain(' as INotificationType');
  });

  it('uses the email heuristic for `emailAddress` (not the address heuristic)', () => {
    expect(output).toContain('emailAddress: faker.internet.email()');
    expect(output).not.toContain('emailAddress: faker.location.streetAddress()');
  });

  it("accepts graphql-codegen's object-form namingConvention (inherited from a shared block)", () => {
    const objOutput = generate({
      namingConvention: { typeNames: 'change-case-all#pascalCase', enumValues: 'keep' },
    });
    // typeNames drives factory/type names exactly as the string form does.
    expect(objOutput).toContain(
      'export function mockNotificationParts(overrides?: Partial<INotificationPartsFragment>): INotificationPartsFragment'
    );
  });
});

describe('operations mode — runtime behavior', () => {
  const { mockActorParts, mockNotificationParts, mockGetNotificationsQuery } = execute(generate());

  it('builds only the selected fields, with __typename', () => {
    const actor = mockActorParts();
    expect(actor.__typename).toBe('User');
    expect(typeof actor.id).toBe('string');
    expect(typeof actor.fullName).toBe('string');
    // `org` was not selected — the finite selection set is what terminates the cycle.
    expect('org' in actor).toBe(false);
  });

  it('walks a fragment over a NonNull-cyclic type without overflowing', () => {
    const n = mockNotificationParts();
    expect(n.__typename).toBe('Notification');
    expect(typeof n.id).toBe('string');
    expect(Number.isNaN(Date.parse(n.createdAt))).toBe(false);
    expect(n.type).toBe('ASSIGNED'); // first enum value (union style)
    expect(n.actor.__typename).toBe('User');
    expect('org' in n.actor).toBe(false);
  });

  it('pins a union field to the first inline-fragment member', () => {
    const n = mockNotificationParts();
    expect(n.target.__typename).toBe('Rfp');
    expect(typeof n.target.id).toBe('string');
    expect(typeof n.target.displayId).toBe('number');
    expect(typeof n.target.name).toBe('string');
  });

  it('builds operation results with lists of the selected shape', () => {
    const q = mockGetNotificationsQuery();
    expect(q.__typename).toBe('Query');
    expect(Array.isArray(q.notifications)).toBe(true);
    expect(q.notifications).toHaveLength(2);
    expect(q.notifications[0].__typename).toBe('Notification');
    expect(q.notifications[0].target.__typename).toBe('Rfp');
  });

  it('overrides win over generated values', () => {
    const n = mockNotificationParts({ id: 'fixed-1' });
    expect(n.id).toBe('fixed-1');
    expect(n.__typename).toBe('Notification');
  });
});
