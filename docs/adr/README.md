# Architecture Decision Records

This directory holds ADRs (Architecture Decision Records) using the
[Michael Nygard format](https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md).

## When to write an ADR

Per AGENTS.md Section 9.2, all non-trivial architecture decisions MUST be
captured here, including:

- Build tool choice
- New runtime dependency
- Public API design change
- Significant refactor
- Spec change that propagates into code
- Reversal of a previously-accepted ADR

## Filename convention

`NNNN-kebab-case-title.md`, numbered sequentially. Never renumber.

## Lifecycle

ADRs are immutable once accepted. To change a decision:

1. Write a new ADR that supersedes the old one.
2. Update the old one's status to `Superseded by NNNN`.
3. Add a back-reference in the new ADR's `Context` section.

## Index

| # | Title | Status |
| - | ----- | ------ |
| [0001](./0001-tech-stack.md) | Tech Stack Selection | Accepted |
