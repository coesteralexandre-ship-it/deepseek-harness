/** Short random id with a readable prefix, e.g. `call-3f9a2c`. Uses Web Crypto, available on the server and in the browser. */
export function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 6)}`
}
