/**
 * Express 5 (path-to-regexp v8) types every route param as `string |
 * string[]`, since a param name can now match repeated segments. None of
 * this app's routes use repeated params, so in practice params always come
 * through as a single string — this just narrows the type without a cast
 * at every call site. If a param is unexpectedly an array, we take the
 * first segment rather than throw, since these values immediately go
 * through parseInt()/Number() and an obviously-invalid id is safely
 * rejected downstream by the existing isNaN checks.
 */
export function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
