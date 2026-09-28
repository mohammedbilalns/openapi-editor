# Architecture

This is a map for contributors. It shows how a document moves through the app and the rules that keep large specs fast. The visual rules are in [DESIGN.md](DESIGN.md). The app is a static single-page app (TanStack Start in SPA mode) with no backend.

```
text ──parseYaml──▶ ApiDocument ──store actions──▶ new ApiDocument ──▶ IndexedDB (autosave)
                                                        ├──▶ validateDocument ──▶ issues (Problems, inline)
                                                        └──▶ serializeToYaml  ──▶ YAML inspector, export
```

## Data model

`src/lib/openapi/types.ts` defines `ApiDocument`. This is the editor's own model, not the raw OpenAPI object.

- **Maps for entities.** `routes`, `schemas` and `securitySchemes` are `Map<NodeId, …>`. A route is one operation (a path plus a method), not a path item.
- **`NodeId` refs.** Ids come from `crypto.randomUUID()`. A schema reference is a typed edge, `{ kind: 'ref', targetId }`, not a `$ref` string. When you rename a schema, only that node changes, and every ref still points to it. The serializer writes `$ref` strings on export.
- **Extras bags for lossless round-trips.** Most objects have an `extra` bag (schemas use `extraKeywords`) for keys the editor does not model, such as `x-*`, `externalDocs`, `examples`, `links`, `callbacks` and `style`. Export writes them back unchanged. The UI does not edit them. `src/test/fixtures/lossless-spec.ts` is the contract: import followed by export must reproduce it exactly.
- Reusable `parameters`, `responses`, `requestBodies` and `headers` components are copied into the operations that use them. Unused ones produce an import warning.

## Store

`src/lib/openapi/store.ts` (zustand) holds only the document and its history. Selection lives in the URL. Panel state lives in `useUiPrefs`, which is saved to localStorage.

- **Structural sharing.** An action copies only the node it touches and the Map that holds it (`commitRoute`, `commitSchema`). Everything else keeps its object identity. Documents are never mutated, and caching, rendering and saving all rely on that.
- **History** is an array of documents, where `history[historyIndex] === document`. It holds at most 50 undo steps. Because nodes are shared, a snapshot costs one Map copy, not a deep clone.
- **Coalescing.** Text edits to the same field within `historyCoalesceMs` (1 s) replace the current history entry, so a burst of typing is one undo step. Structural edits never coalesce.
- **`sealHistory()`** ends a burst early. Editors call it when a control loses focus and around multi-step changes such as a schema type change.
- `initializeDocument` (hydration) resets history. `setDocument` (import) and `resetDocument` can be undone.

## Selectors and derived data

Components read through `selectors.ts` (hooks) and `derive.ts` (plain functions), both in `src/lib/openapi/`.

- **Never subscribe to the whole store.** A bare `useEditorStore()` re-renders on every keystroke. Select the smallest value you need. For example, `useRoute(id)` returns the same object until that route changes.
- **Memoize derived values on identity.** Derived lists (route ids, the sidebar tree, schema options, usage counts) are cached at module level, in `WeakMap`s or single-entry memos keyed on the Map or node they come from. All subscribers share one computation and get the same reference until the input changes.
- Rows are `React.memo` components that get small row models (`toRouteSummary`), which stay equal while their node is unchanged.

## Parsing and serializing

`parser.ts` turns text into an `ApiDocument`:

- Text that starts with `{` or `[` goes through `JSON.parse`. Anything else, including invalid JSON, goes through js-yaml with the core schema.
- Inputs over 50 MB are refused. When a document uses YAML anchors and aliases, the parser checks once that the aliases do not expand far beyond the size of the file ("billion laughs").
- Imports parse in a Web Worker (`openapi.worker.ts`). A newer import cancels the one in progress, and a parse that runs longer than 60 s ends the worker. The document comes back as a structured clone, which is fine because it is new.

`serializer.ts` turns an `ApiDocument` into YAML:

- It uses js-yaml with `noRefs`, so the output has no anchors or aliases. Strings that a YAML 1.1 reader would read as another type are quoted.
- **Incremental emission.** `serializeToYaml` caches the YAML of each operation and each component schema in `WeakMap`s keyed on the node, together with the schema names it references. After an edit, only the changed nodes are emitted again and the pieces are joined. The output is byte-identical to a full dump, and tests check this after every kind of edit.
- **This is why YAML stays on the main thread.** Posting the document to a worker clones it, and the clone has new object identities, so every cache lookup would miss. On the main thread, a refresh after a small edit to a 14 MB spec takes 35 to 70 ms, while a full dump takes one to two seconds.

## Analysis

`src/lib/openapi/analysis/` runs validation and YAML in idle callbacks on the main thread, never inside an input event. For each channel, only the latest request counts.

- Validation runs 500 ms after the last change, as long as something uses its results. YAML runs 300 ms after the last change, and only while the YAML tab is visible or during an export.
- `toIssues` (`issues.ts`) gives each issue its entity, the field inside it (`operationId`, `param:{id}`, `response:{code}`, `field:{name}` and so on) and a URL with a hash anchor. `issueProps` sets `aria-invalid` and `aria-describedby` on the matching input.
- Issues keep their identity per owner between runs, so `useIssuesFor(id)` re-renders only when that entity's issues change.

## Persistence

`src/lib/persistence.ts` runs outside React on top of `src/lib/storage/repository.ts`.

- **Per-record storage (database version 2).** A small project record holds info, servers, tags, security and record order. Each route and each schema is its own record. Data saved in the version 1 format is still read.
- **Identity diff.** `saveProject` compares the document with the last one loaded or saved, by object identity, so editing one route writes one record.
- **Autosave** runs 250 ms after the last change, and never later than 2 s into a burst of edits. `Mod+S` saves at once.
- **Flush when the page goes away.** On `pagehide`, or when the tab is hidden, the write transaction starts synchronously, so it is queued before the page closes. While a change is unsaved, a `beforeunload` guard asks before leaving.
- **Revisions for multiple tabs.** Each save increases a revision number. A write that expects an older revision is refused (`SaveConflictError`), and a BroadcastChannel tells other tabs about each save. The tab that lost stops saving and offers a reload.

## Routing

Routes are files in `src/routes/`. The URL owns selection (`/routes/$routeId`, `/schemas/$schemaId`, `/settings/$section`), so back, forward and deep links all work. An import creates new ids, so the app goes to `/` afterwards. If a route or schema no longer exists, the screen shows an inline empty state instead of a 404, because undo can bring it back.

`_app.tsx` is the layout for every screen. Its loader reads the saved document from IndexedDB, and it sets `ssr: false`. The build prerenders the SPA shell in an environment without IndexedDB. Without `ssr: false`, the loader ran during that prerender and found no saved document. The client then reused that result instead of loading from IndexedDB, so the saved document never appeared and autosave never started. Put anything that uses browser storage behind this route.

## Service worker

`src/sw.js` is a template. The `serviceWorker()` plugin in `vite.config.ts` injects the list of hashed `assets/` files as the precache list, derives the cache version from that list and emits `/sw.js`. The worker is registered only in production builds.

- Navigations go to the network first and fall back to the cached shell. `/assets/*` is served from the cache first. Icons and the manifest are served from the cache and refreshed in the background.
- Cache lookups use `ignoreVary: true`. Module scripts send an `Origin` header and servers answer with `Vary: Origin`, but precache requests have no `Origin`. Without the flag every lookup missed, and the app never loaded offline.

## Testing

- **Unit and component tests** (`pnpm test`) use Vitest, jsdom, Testing Library and fake-indexeddb. They live next to the code as `*.test.ts(x)`. They include a snapshot-isolation suite that fails if a store action mutates an earlier document.
- **Performance guard** (`pnpm test:perf`) parses, serializes and edits a generated spec of about 14 MB. Its time limits are generous, so it catches algorithmic regressions rather than slow machines. It runs alone because tests running in parallel skew the timings. `pnpm bench` prints detailed numbers.
- **End-to-end tests** (`pnpm test:e2e`) run Playwright against the production build (`vite preview`), on desktop Chrome and a Pixel 7 profile. They cover persistence, a large import and offline use. Set `E2E_DEV=1` to use the dev server, or `E2E_BASE_URL` to use a server that is already running.
