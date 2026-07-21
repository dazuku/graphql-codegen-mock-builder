/**
 * Field-name → faker-expression heuristics.
 *
 * Entries are evaluated in order; the first entry whose `match` regex tests
 * true against the field name AND that provides an expression for the field's
 * scalar category (`string` for String/ID fields, `number` for Int/Float
 * fields) wins. Boolean and custom-scalar fields never use heuristics
 * (custom scalars are resolved through the `scalars` map instead).
 *
 * To extend: append (or prepend, for higher priority) entries to this array.
 * Most patterns are case-insensitive (`/i`); the date entry is deliberately
 * case-sensitive so the `...At` suffix only matches camelCase boundaries
 * (`createdAt` yes, `format` no).
 */
export interface FieldHeuristic {
  /** Human-readable label, for documentation purposes. */
  name: string;
  /** Regex tested against the raw field name. */
  match: RegExp;
  /** Expression used when the field's scalar is String or ID. */
  string?: string;
  /** Expression used when the field's scalar is Int or Float. */
  number?: string;
}

export const FIELD_HEURISTICS: FieldHeuristic[] = [
  { name: 'id', match: /^(id|uuid|guid)$/i, string: 'faker.string.uuid()' },
  { name: 'email', match: /email$/i, string: 'faker.internet.email()' },
  { name: 'firstName', match: /^first_?name$/i, string: 'faker.person.firstName()' },
  { name: 'lastName', match: /^last_?name$/i, string: 'faker.person.lastName()' },
  { name: 'fullName', match: /^(name|full_?name)$/i, string: 'faker.person.fullName()' },
  { name: 'username', match: /^user_?name$/i, string: 'faker.internet.username()' },
  { name: 'phone', match: /phone/i, string: 'faker.phone.number()' },
  { name: 'url', match: /(url|website)$/i, string: 'faker.internet.url()' },
  { name: 'image', match: /(avatar|image)$/i, string: 'faker.image.url()' },
  {
    name: 'money',
    match: /(price|amount|cost|total)$/i,
    string: 'faker.commerce.price()',
    number: 'Number(faker.commerce.price())',
  },
  {
    name: 'longText',
    match: /^(description|bio|content|body)$/i,
    string: 'faker.lorem.paragraph()',
  },
  { name: 'title', match: /^title$/i, string: 'faker.lorem.sentence()' },
  { name: 'city', match: /^city$/i, string: 'faker.location.city()' },
  { name: 'country', match: /^country$/i, string: 'faker.location.country()' },
  { name: 'address', match: /address$/i, string: 'faker.location.streetAddress()' },
  { name: 'zip', match: /^(zip|zip_?code|postal_?code)$/i, string: 'faker.location.zipCode()' },
  {
    // Case-sensitive: `createdAt`/`updated_at`/`shipDate`/`date`, but not `format`.
    name: 'date',
    match: /(^date$|Date$|_at$|[a-z0-9]At$)/,
    string: 'faker.date.recent().toISOString()',
  },
  { name: 'age', match: /^age$/i, number: 'faker.number.int({ min: 0, max: 100 })' },
  { name: 'color', match: /^colou?r$/i, string: 'faker.color.human()' },
  { name: 'company', match: /^company$/i, string: 'faker.company.name()' },
];

export type ScalarCategory = 'string' | 'number';

/**
 * Returns the faker expression for the first matching heuristic that supports
 * the field's scalar category, or undefined when no heuristic applies.
 */
export function findHeuristicExpression(
  fieldName: string,
  category: ScalarCategory
): string | undefined {
  for (const heuristic of FIELD_HEURISTICS) {
    if (heuristic.match.test(fieldName) && heuristic[category] !== undefined) {
      return heuristic[category];
    }
  }
  return undefined;
}
