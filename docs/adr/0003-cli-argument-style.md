# ADR 0003: CLI Argument Style and Dependency Posture

**Status:** Accepted
**Date:** 2026-05-20
**Decider:** arielfikru
**Phase:** P4 (xflip-cli)

## Context

`@xflip/cli` is the third user-facing surface of the project (after the
library and the viewer web component). Its UX has to feel native to the
Node CLI ecosystem without dragging in dependencies that contradict the
project's "small, auditable" posture (AGENTS.md §3.5 keeps `@xflip/core`
zero-dep; the CLI is allowed deps but should resist them unless they pay
clear rent).

By the end of P4.5 the CLI ships five subcommands (`inspect`, `validate`,
`extract`, `create`, `layers add`) and a `help` dispatcher. The argument
shapes evolved organically across P4.1–P4.5; before P4.7 they should be
captured as a deliberate style so future commands (e.g. an eventual
`layers remove`, a thumbnail generator) stay consistent.

Three classes of decision need locking down:

1. **Parser choice** — `commander`, `yargs`, `meow`, `cac`, or
   `node:util.parseArgs`.
2. **Argument shape** — flags-only vs positional sub-args, where short
   flags are allowed, how `--help` is wired.
3. **Exit-code contract** — distinguishing usage errors from runtime
   errors so shell pipelines can react.

## Decision

### 1. Use `node:util.parseArgs`; zero non-`@xflip` runtime dependencies

`parseArgs` (stable since Node 18.11) handles every shape we actually
need: long flags with values, boolean flags, short-flag aliases,
positionals, and a strict mode that rejects unknown options. It does
**not** generate help text or subcommand routing — but those are 30
lines of hand-rolled code and a `Map`, not a 200 KB dependency tree.

Counter-considered: `commander` (most popular, but pulls a v12 runtime
of its own, opinionated help formatting), `cac` (lighter, still a dep),
`meow` (transitive `yargs-parser`). All add install weight, audit
surface, and an upgrade treadmill. None unlock features we couldn't write
in <50 lines.

The CLI's `package.json` therefore declares **only** `@xflip/core` as a
runtime dependency. `node:util.parseArgs` carries the parsing weight.

### 2. Flag-only argument style; one positional per command

Every option that takes a value is a **long flag** (`--front`,
`--effect-type`, `--strict-ancillary-crc`). Short aliases are reserved
for the single universal flag, `-h` / `--help`. We do **not** use short
aliases for command-specific flags.

Rationale:

- xflip-spec terminology is multi-word (`flip-axis`, `effect-type`,
  `strict-ancillary-crc`). Mapping these to single letters (`-a`?, `-e`?)
  would force memorization without saving meaningful keystrokes for the
  expected usage pattern (one-shot invocations from scripts and tooling).
- Long flags self-document on review — a CI log showing `xflip create
  --front a --back b --width 512 --height 720` is readable; one with
  `-f a -b b -w 512 -H 720` is not.
- `parseArgs` short-flag support is limited to single-character aliases
  with no value-coupling tricks; sidestepping it removes a footgun.

Each command takes **at most one positional**, always the input `.xflip`
file (`inspect`, `validate`, `extract`, `layers add`). `create` has no
positionals — its inputs are sources, not "the file being acted on", so
they live behind `--front` / `--back`. Extra positionals are an error.

### 3. Output destinations always behind `--output` / `--to`; explicit `--force` gate

Commands that write files (`create`, `extract`, `layers add`) take the
destination as a flag, never as a positional. Refusing to overwrite is
the default; `--force` opts in. `layers add` additionally rejects
in-place writes (`--output` equal to input path) without `--force`,
even though both forms hit the same code path on the filesystem — the
in-place case is the higher-risk operation and deserves a distinct
error message.

### 4. Exit-code contract

Three exit codes, no others:

| Code | Class | Examples |
| ---- | ----- | -------- |
| `0`  | Success | Valid file printed, output written |
| `1`  | Runtime error | Malformed `.xflip`, I/O failure, refused overwrite, invalid `--meta` / `--response` JSON |
| `2`  | Usage error | Unknown command/flag, missing required flag, value out of range |

The split lets shell pipelines treat `validate` as a real predicate
(`xflip validate x.xflip && deploy`) while reserving `2` for "the user
typed something wrong". `parseArgs` throws on unknown options; we catch
and convert to `2`. Internal errors from `@xflip/core` (which subclass
`XflipError`) become `1`. Anything else propagates and surfaces a stack
trace from the entry shim — those are bugs in the CLI, not user errors.

### 5. Help text formatting

- `xflip help` prints a top-level command list.
- `xflip help <command>` and `xflip <command> --help` print the same
  per-command help.
- Per-command help describes flags in a two-column block, with required
  flags noted inline.
- We hand-write help strings rather than generate them — total help
  surface is small, and the lock-step between flag definitions and help
  text is enforced by per-command tests asserting both.

### 6. Programmatic exports mirror the CLI

Every subcommand has a pure function (`inspect()`, `validate()`,
`extract()`, `buildFile()`, `addLayer()`) plus serializer / formatter
helpers that the CLI thin-wraps for filesystem I/O. The pure layer is
what tests exercise; the CLI itself owns argv parsing, stderr/stdout
formatting, and exit-code mapping. This makes the codec/CLI boundary
testable without spawning child processes and lets downstream tools
embed the same logic.

## Consequences

**Positive:**

- Install footprint of `@xflip/cli` is `@xflip/core` (≤ 10 KB gzip) +
  Node built-ins. `pnpm why` stays uncluttered.
- The CLI is forkable: anyone can read all of `cli.ts` in one sitting.
- Long flags survive copy-paste across docs, blog posts, CI YAML, and
  shell history without ambiguity.
- Exit-code split makes the CLI scriptable.

**Negative:**

- We will not match `git`-style terseness (`xflip add -f` will never be
  shorter than `xflip layers add --face front`). Acceptable: this is a
  build/CI tool, not an interactive shell.
- Hand-rolled help text is duplication-prone. Mitigated by the
  per-command snapshot-ish tests in `cli.test.ts`.
- `parseArgs` lacks subcommand routing — we dispatch manually. The
  dispatcher is ~30 lines and grows linearly with subcommands; if it
  ever crosses ~200 lines we'll revisit.

## Alternatives Considered

- **`commander`** — most ergonomic for a much bigger CLI; overkill here.
- **`cac`** — lighter, but still imports its own help renderer and value
  parsing. The marginal ergonomic win didn't justify a runtime dep on a
  package we couldn't easily audit end-to-end.
- **`yargs`** — too heavy; pulls i18n surface, command middleware, and
  several transitive deps. Tailored for sprawling CLIs, not five
  subcommands.
- **Positional sub-arguments** (e.g. `xflip create front.png back.jpg
  card.xflip 512 720`) — reads compactly in docs but is unreviewable in
  CI logs and forces an unstable argument order.

## References

- [Node `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)
- [GNU "Standards for Command Line Interfaces"](https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html)
- AGENTS.md §3.5 (zero-dep stance) — CLI inherits the spirit but is
  permitted Node built-ins
- ADR 0001 — overall tech stack rationale
