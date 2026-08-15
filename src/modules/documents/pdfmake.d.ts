/**
 * Ambient module declarations for the untyped pdfmake 0.3.x build artifacts.
 *
 * `@types/pdfmake` types the package root (singleton API), but the bundled
 * `vfs_fonts.js` font data file ships as plain JS with no types. Declaring it
 * here keeps `tsc --noEmit` clean without `allowJs` noise. The rich
 * `Content`/`TDocumentDefinitions` types live in `@types/pdfmake/interfaces`
 * and resolve normally via the package's `types` entry.
 */

declare module 'pdfmake/build/vfs_fonts.js' {
  /** Map of font filename → base64-encoded TTF data. */
  const vfs: Record<string, string>;
  export = vfs;
}
