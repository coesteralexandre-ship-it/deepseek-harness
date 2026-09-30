import { randomUUID } from 'node:crypto'

/** Short random id with a readable prefix, e.g. `call-3f9a2c`. */
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 6)}`
}
