# Plan: align Goala with Pi Dream

Status: implemented in Goala 0.4.0; retained as the reviewed design record

Baselines inspected on 2026-08-05:

- `pi-goala` `main` at `3ca4daa8f04559f01b2fc7d6d42559f22a584188`
- `pi-dream` `origin/main` at `a2795c7b1666a8e1d3601dc91b7142fd86c72049`
- the local Pi Dream checkout at `2d55837fd8d77c0ee45c6ce72087131da3949337` differs from `origin/main` only by a README-only signing clarification

This document was reviewed before runtime or product-code changes began.

## Decision

Dream remains a standalone, general-purpose durable-memory product. It must not know about Goala, Goals, Goal phases, acceptance criteria, verification receipts, or Goala's execution graph.

Goala remains a standalone Goal controller. When Dream is also installed, Goala may read promoted Dream memory through a small, generic, versioned-memory API. Goala sends nothing back to Dream.

Dream continues to learn from ordinary completed Pi sessions. Goala's planning, execution, repair, and verification sessions are already part of that evidence. The repository remains the source of truth for what was built.

```text
Dream alone
  └── Stores, sessions, dreams, Candidates, review, Remember this

Goala alone
  └── Goal, plan, execute, repair, independently verify

Dream + Goala
  ├── Dream exposes promoted memory through a generic read API
  ├── Goala optionally uses that memory while running a Goal
  └── Dream later sees Goala's normal Pi sessions like any other sessions
```

## Ownership

| Concern | Owner |
| --- | --- |
| Active Goal, criteria, plan, phases, progress, defects | Goala |
| Plan/execute/repair/verify control loop | Goala |
| Advisory or binding use of remembered guidance in a Goal | Goala |
| Durable memory Stores and versions | Dream |
| Repository and shared-memory discovery | Dream |
| Dream jobs, Candidate Memory, review, promotion, rollback | Dream |
| Completed Pi sessions used as Dream evidence | Dream's existing session pipeline |
| Built source code and documents | The project repository |

The key boundary is:

> Dream exposes memory. Goala decides how to use it. Dream does not interpret Goala.

## What changes in Dream

Dream needs only a small read-only library surface for versioned memory. This is useful to any extension, not specifically Goala.

Add a root `interop.ts` entry point exported as `pi-dream/interop`. Keep Dream's default extension export and all standalone behaviour unchanged.

Suggested contract:

```ts
export interface MemoryStoreVersion {
  storeId: string;
  name: string;
  scope: "repository" | "workspace";
  commit: string;
}

export interface MemoryDocumentReference {
  storeId: string;
  storeName: string;
  storeScope: "repository" | "workspace";
  commit: string;
  path: string;
  sha256: string;
}

export interface MemoryHit extends MemoryDocumentReference {
  excerpt: string;
  score: number;
}

export interface MemoryDocument extends MemoryDocumentReference {
  content: string;
}

export interface MemorySearchContext {
  repositoryIdentity: string;
  stores: MemoryStoreVersion[];
}

export interface DreamMemoryReader {
  discover(cwd: string): Promise<MemorySearchContext>;
  search(context: MemorySearchContext, query: string): Promise<MemoryHit[]>;
  read(reference: MemoryDocumentReference): Promise<MemoryDocument>;
}

export function createMemoryReader(): Promise<DreamMemoryReader>;
```

### Contract rules

- The API contains no Goal, Goala, phase, execution-graph, receipt, verification, or evidence-staging types.
- `discover` returns only the active repository Store and its Primary shared-memory Store. It never exposes unrelated Stores.
- Store commits are immutable versions. Every search hit refers to an exact Store ID, commit, path, and document hash.
- `search` is deterministic and bounded: no model call, no per-turn retrieval, at most eight results, at most 100 KiB read per document, and at most 1 MiB scanned in total.
- `read` reads the exact referenced commit even if a newer Store becomes active later.
- Existing path, symlink, UTF-8, document-size, metadata, and secret protections apply.
- The API is read-only. It cannot mutate an active Store, create a Candidate, start a Dream, promote memory, stage evidence, or write under `PI_DREAM_HOME`.
- Errors use stable codes so a consumer can distinguish “Dream is not installed” from an installed but unhealthy provider.
- The provider is constructed without `ExtensionAPI`; importing it must not register commands or event handlers.

### Why Dream needs this API

Dream currently exposes memory to agents through managed session attachments. That works well for ordinary sessions, but another extension needs a stable programmatic way to:

- discover which promoted memories apply to a repository;
- find relevant documents without understanding Dream's registry or Git layout;
- retain exact version references across several sessions;
- read an older immutable version after a later Dream has been promoted.

The API exposes Dream's existing Store abstraction without exposing its implementation or coupling it to a consumer.

### What does not change in Dream

- Dream still works fully when Goala is absent.
- `/memory` and `/dream` remain unchanged.
- Session selection remains repository-based.
- Dream does not group sessions by Goal or parse Goala state.
- Dream does not receive a Verified Goal Episode or completion receipt.
- Dream does not add `goal://` provenance.
- Dream workers continue to learn from selected Pi sessions and existing Stores.
- Candidate creation, verification, review, Remember this, and rollback remain unchanged.

## What changes in Goala

Goala stops owning durable episodic memory and becomes an optional consumer of Dream's generic reader.

### 1. Add a narrow optional adapter

Add `extensions/goala/dream.ts` as the only Goala module that imports `pi-dream/interop`.

- Load the module dynamically once.
- Treat only the exact package-not-found case as “Dream unavailable”; surface other failures clearly.
- Declare `pi-dream` as an optional peer dependency and a pinned development dependency for typechecking and integration tests.
- Keep Goala fully functional without Dream: plan, execute, repair, and verify continue without long-term memory.
- Never import Dream's internal services, registry, worktree paths, or Git backend.
- Never call a Dream write, Candidate, promotion, or session API.

### 2. Read Dream memory once when a Goal begins

At `/goal` creation, when Dream is available:

1. call `discover` for the current repository;
2. call `search` once using the Goal objective;
3. show the bounded relevant documents to the user;
4. let the user skip a document or use it as advisory or binding guidance;
5. read the selected exact versions and store a bounded immutable document
   snapshot in Goala's Goal state.

Non-interactive modes may select the highest-ranked bounded results as advisory only. They must never infer a binding constraint.

There is no repeated semantic search during planning, execution, or verification.

### 3. Keep all Goal-specific semantics in Goala

Goala defines its own internal reference:

```ts
interface GoalMemoryReference {
  storeId: string;
  storeName: string;
  storeScope: "repository" | "workspace";
  commit: string;
  path: string;
  sha256: string;
  authority: "advisory" | "binding";
  content: string;
}
```

Dream knows only `MemoryDocumentReference`. Goala adds `authority` because advisory versus binding is a Goal decision, not a Dream concept.

- Advisory guidance may inform planning and execution but can be overridden by stronger current repository evidence. Material conflicts must be surfaced.
- Binding guidance is explicitly approved by the user and becomes part of Goala's acceptance contract.
- Planning and execution receive the captured exact-version snapshot; they do
  not perform another search or depend on Dream remaining available.
- Final verification receives binding references because they are acceptance constraints. It does not receive advisory memory or executor completion claims.
- Dream verifies the content hash during `read`; a missing version or mismatch
  prevents that document from entering Goal context.
- Promoting a newer Dream Store during a Goal does not change the stored references. The newer version applies to the next Goal.

Add `/goal context` to display the selected Store names, short commits, paths, hashes, and advisory/binding status. It is diagnostic only; a new Goal is the explicit way to select newer memory.

### 4. Remove Goala's duplicate memory product

- Remove Goala's `/memory` and `/memory-status` commands.
- Remove the `memory_search` and `memory_evidence` model tools.
- Remove automatic SQLite recall and verified-episode writes.
- Remove normal runtime imports of `extensions/goala/memory.ts`.
- Remove `memory` configuration, `PI_GOALA_MEMORY_ROOT`, and `PI_GOALA_MEMORY_ENABLED`.
- Bump the Goala configuration and Goal-state schemas with backward normalization.
- Drop legacy recalled packets when restoring older Goal state; do not silently consult SQLite.
- Update the package description, keywords, README, architecture, configuration, security, evaluation, and changelog so Goala no longer claims durable-memory ownership.
- Keep Dream's `/memory` and `/dream` as the only memory UX when both packages are installed.

### 5. Do not send Goal output to Dream

Goala makes no API call when a Goal passes or fails.

It does not send Dream:

- the Goal;
- acceptance criteria;
- an execution graph;
- a Verified Goal Episode;
- a completion receipt;
- changed files or repository commits;
- verifier findings;
- a special session group.

Goala's ordinary Pi sessions already contain the request, plan, execution, repair, verification, and final result. Dream's existing repository-scoped session pipeline can use those sessions later without understanding which extension produced them.

The project repository records what was built. Dream may derive reusable knowledge from the sessions and existing memory when the user runs a Dream, then produce a normal Candidate for review.

If real usage later shows that Dream cannot interpret related sessions reliably, session grouping should be considered as a generic Pi/session-lineage capability. It is not part of this alignment.

### 6. Remove the legacy SQLite implementation completely

The alignment does not migrate Goala's SQLite episodes into Dream. A migration
would require a new evidence-ingestion concept and would reintroduce the
coupling this design removes.

- Delete the SQLite module and its tests.
- Delete the legacy memory seeding/evaluation code.
- Remove every command, tool, configuration field, environment variable, and
  completion-write path that uses the database.
- Add no reader, migration, export, fallback, or compatibility code for old
  databases. Existing user files are simply outside the current product.

## Delivery topology

Deliver two small dependent PRs:

1. **Pi Dream PR:** export and test the generic read-only `pi-dream/interop` API.
2. **Goala PR:** optionally consume that API and remove Goala's duplicate durable-memory behaviour.

The Goala PR must not merge until the packed Pi Dream interop version exists and combined-package tests pass. Development may use a pinned local `file:` dependency, but the committed release contract must reference the published version.

## File-level plan

### Pi Dream PR

| Area | Planned change |
| --- | --- |
| `interop.ts` | Public generic reader entry point and exports |
| `src/domain/*` | Generic public Store-version and document-reference types if needed |
| `src/services/*` | Read-only adapter over existing repository, Store, workspace, and content services |
| `package.json` | Export `.` and `./interop`; include both entries in the tarball |
| `test/unit/*` | Discovery, scope, bounds, version reads, hashes, errors, and read-only guarantees |
| `test/e2e/*` | Packed import plus standalone Dream regression |
| `README.md`, `docs/specification.md` | Document the generic consumer API without mentioning Goala |

### Goala PR

| Area | Planned change |
| --- | --- |
| `extensions/goala/dream.ts` | Optional dynamic adapter and exact-version reads |
| `extensions/goala/workflow.ts` | Persist Goala-owned memory references and authority in Goal state |
| `extensions/goala/context.ts` | Render advisory guidance and binding acceptance constraints |
| `extensions/goala/session.ts` | Carry selected references through phase handoffs |
| `extensions/goala/tools.ts` | Remove Goala memory tools; validate exact referenced content where required |
| `extensions/goala/index.ts` | One search at Goal creation, selection UX, `/goal context`, no completion write |
| `extensions/goala/config.ts` | Remove SQLite memory configuration and environment overrides |
| `extensions/goala/memory.ts` | Delete; no migration or export code remains |
| `extensions/goala/presenters.ts` | Show selected memory context and availability |
| `package.json` | Optional Pi Dream peer, pinned dev dependency, corrected product metadata |
| `README.md`, `docs/*`, `CHANGELOG.md` | Explain standalone and combined installation behaviour |
| `test/*`, `eval/*` | Reader adapter, context stability, no-Dream, coexistence, and trust-boundary coverage |

`CONTEXT.md` retains only Goala-owned Goal language. Dream job, Candidate, and
promotion terms are outside Goala's domain model.

## Acceptance scenarios

1. **Dream alone:** installation and all existing memory/dream flows behave exactly as before; the package exposes an optional generic reader.
2. **Goala alone:** `/goal`, `/plan`, `/execute`, and `/verify` work without Dream, SQLite, or `/memory` commands.
3. **Both installed:** Dream alone owns `/memory` and `/dream`; Goala owns `/goal`, `/plan`, `/execute`, and `/verify`.
4. **No reverse dependency:** Pi Dream source, API types, docs, tests, and UX contain no Goala or Goal concepts.
5. **Bounded retrieval:** Goala performs one Dream search when a Goal begins and no semantic searches on later turns.
6. **Exact versions:** every selected reference includes Store ID, commit, path, and hash; later reads use that exact version.
7. **Mid-Goal promotion:** promoting a newer Candidate does not change the active Goal's selected references; a new Goal sees the new active Store.
8. **Advisory conflict:** current repository evidence may override advisory guidance, but the plan makes the conflict and decision visible.
9. **Binding conflict:** user-approved binding guidance is included in acceptance criteria and independently verified.
10. **Unavailable Dream:** removing or disabling Dream produces a clear memory-unavailable status without breaking the Goal workflow or falling back to SQLite.
11. **No output write:** final PASS and FAIL make zero calls into Dream and create no Dream records, Stores, Candidates, or receipts.
12. **Normal learning:** a later `/dream` can select the completed Goala-created Pi sessions through Dream's existing repository session flow.
13. **No legacy path:** the shipped package contains no SQLite implementation,
    migration, export, fallback, or database-opening code.
14. **Packaging:** isolated packed installs work with Dream alone, Goala alone, and both together, regardless of extension load order.

## Verification matrix

### Pi Dream

- Unit: repository/Primary shared discovery, unrelated-Store exclusion, deterministic bounds, exact-commit reads, hash accuracy, path safety, stable errors.
- Contract: attempts to mutate through the reader are impossible; importing interop registers no commands or handlers.
- Package: both `import("pi-dream")` and `import("pi-dream/interop")` resolve from the packed artifact.
- Regression: `npm run check` and existing standalone Pi Dream E2E remain green.

### Goala

- Unit: optional-provider loading, Goal-owned authority, state normalization, exact-reference rendering, hash mismatch, unavailable provider.
- Integration: a fake reader proves one discovery/search per Goal, exact-version reads across phases, and zero Dream calls on completion.
- Host coexistence: Dream owns `/memory` regardless of load order; idle tools and unrelated extensions remain untouched.
- E2E: real Pi RPC with both packed packages covers Goal creation with selected Dream guidance, phase handoffs, verification, and subsequent ordinary Dream session discovery.
- Regression: `npm run check` and `npm pack --dry-run` pass with no SQLite database created.

## Risks and controls

| Risk | Control |
| --- | --- |
| Generic API accidentally leaks Dream internals | Export immutable domain references and content only; no registry paths or service objects |
| Optional package resolution fails in Pi's npm layout | Test packed combined installs before merging and match only the exact module-not-found error |
| Search adds startup cost | Hard Store, document, byte, and result caps; no model call |
| Binding guidance becomes a hidden instruction channel | Explicit user approval; Goala-owned authority; visible references; verifier checks |
| Memory changes during a multi-session Goal | Persist immutable Store commit references and read exact versions |
| Dream starts depending on Goala semantics later | Keep Goala absent from interop types, tests, docs, session selection, and worker prompts |
| Useful final outcomes are missed by Dream | Rely on existing completed-session evidence first; add generic session-lineage support only if measured failures justify it |
| Users expect legacy memory to remain active | Breaking-change note: old data is not read or migrated; Dream is the only durable-memory provider |

## Non-goals

- No Goal-specific API or type in Dream.
- No Verified Goal Episode or completion receipt.
- No execution-graph ingestion or Goal-based session grouping.
- No Goala output write to Dream.
- No direct Dream Store mutation from Goala.
- No automatic Candidate promotion.
- No retrieval on every turn.
- No embeddings, vector database, remote memory service, or network search.
- No SQLite fallback during normal Goala execution.
- No legacy SQLite migration in this change.
- No change to Dream's existing session-to-Candidate learning flow.
- No change to Goala's plan/execute/repair/verify control loop beyond the memory boundary.

## Merge and release order

1. Review and approve this plan.
2. Implement and publish the generic Pi Dream interop reader.
3. Pin the published interop version in Goala development dependencies.
4. Implement the Goala consumer and remove its normal SQLite memory path.
5. Run both repositories' checks and packed standalone/combined E2E from clean temporary Pi homes.
6. Merge Goala only after Dream-alone, Goala-alone, and combined installations pass.
7. Release Goala with a breaking-change note for removed `/memory*` commands,
   configuration, and legacy compatibility.

Implementation is authorized separately; commit, push, migration, and release
remain separate actions.

## Definition of done

Dream works unchanged as a standalone memory product. Goala works unchanged as a standalone Goal controller. When both are installed, Goala can read exact promoted Dream memory without Dream learning anything about Goala, and Dream continues to learn from the same ordinary Pi sessions it already understands.
