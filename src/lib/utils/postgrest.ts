/**
 * PostgREST filter-string sanitization.
 *
 * supabase-js `.or()` takes a RAW PostgREST logic string
 * (e.g. `first_name.ilike.%x%,last_name.ilike.%x%`). Interpolating user
 * input into that string without sanitizing lets a crafted value break out
 * of the OR group: the characters `,` `(` `)` `.` are filter-syntax
 * metacharacters, so input like `x%,id.neq.00000000-…(` can append
 * arbitrary conditions and widen a search beyond its intended columns.
 *
 * `escapeOrFilterValue()` strips those metacharacters (plus quotes, which
 * could re-open quoted values). LIKE wildcards `%`/`_` are kept — they
 * only affect pattern matching, not query structure.
 */
export function escapeOrFilterValue(input: string): string {
  return input.replace(/[(),."'\\]/g, '');
}
