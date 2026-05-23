/**
 * Type shim for `@iframe-resizer/child`.
 *
 * @iframe-resizer/child is a scoped package bundled as a dependency of
 * `iframe-resizer` 5.x. It auto-initialises on import with no exports.
 * Declaring it here keeps TypeScript happy when its own .d.ts types don't
 * match the ESM import pattern.
 */
declare module '@iframe-resizer/child' {
  // The child script auto-initialises on import. No explicit API surface.
  const _: undefined;
  export default _;
}
