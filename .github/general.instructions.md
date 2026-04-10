---
applyTo: '**/*.*'
---

# mantra: keep simple things simple, make complex thing possible
---

# Keep changes atomic (small and focused)

- Keep changes atomic-ish, doing more than one thing is okay as long as its in the same domain and related.
 - never do a change that requires a dependency to change without also changing the dependency in the same commit

---

# A `.agents/` directory exists for agent needs
check there for resources, ie reference repos that i ask for you to download.

**This file is .gitignore'd -- so harness tooling may not always see it**
- critical that you use bash commands for navigating these files if harness tool calls does not show them.
- some harnesses like github copilot have `includeIgnoredFiles` options. use those.
- if `eza` or `rg` or similar dont return anything then its safe to say they dont exist in the repo.

- !important, this file dir is usually ignored and one must use the `includeIgnoredFiles` option or similar in your harness search tools to access it.
- prefer using the `#readFile` tool or a `eza -T` (use option for ignoring node_modules and .git dirs) command to navigate the file contents of `.agents` since some harness tools ignore any files in .gitignore'd directories when using `#search` tools.
- for searching this directory prefer using ripgrep `rg` bash command over `#search` tools for the same reason as above.


#### Search flow reccomendations

- **Goal:** locate docs + implementation for module `X` inside repository `Y` under repos.
- **Steps:**
  - List agent repos: `ls -la .agents/repos`
  - Broad search for `X` across repos: `rg --hidden -n "X" .agents/repos`
  - Narrow search to repo `Y` for common patterns:
    - `rg -n "import\s+\{[^}]*X[^}]*\}|\bX\b" .agents/repos/Y --hidden`
    - `rg -n "module\s+X|export\s+.*X" .agents/repos/Y --hidden`
  - Inspect likely locations in `Y`:
    - docs: `Y/**/README*`, SCHEMA.md, `Y/**/*.md`
    - package entrypoints: `Y/packages/*/package.json`
    - source: `Y/**/src/**/*X*.{ts,js,mts,cts}`
    - migration/notes: `Y/migration/**/*{X,upgrade}*.md`
- **Decision rules:**
  - If markdown doc named like the module exists under `packages/*` prefer it for overview.
  - Prefer `packages/*/src` implementations for source-level details.
  - If mapping versions, inspect `migration/` or `MIGRATION.md`.
- **Example generic shell commands (variables: X, Y):**
```bash
ls -la .agents/repos
rg --hidden -n "X" .agents/repos
rg --hidden -n "import\\s+\\{[^}]*X[^}]*\\}|\\bX\\b" .agents/repos/Y
ls -la .agents/repos/Y/packages
rg -n "export .*X|default .*X" .agents/repos/Y/packages -S
```
---

# this is a jj (jujutsu) repository

use `jj log --no-graph` to see the commit history and details of recent edits and an idea for the current expect commit message header formatting (if any)

use `jj commit -m "your commit message"` to create a new commit with your changes

`jj help` if you get stuck. most sub commands have `--help` for more specific guidance on usage. Keep any useful ones at the "agent found commands" section below for easy reference.


When reverting a working copies state, just use `jj new @-` this will create a new change ontop the same parent as the current change, effectively reverting the working copy to the previous state WHILE keeping a reference to the old change.

When you do this make sure the mark the current for change for deletion/cleanup by updating its description via `jj desc @ -m` to start with "DEPRECATE" or similar.


#### agent found commands


---

# !important Use a scientific debugging loop for fixes.
    - Before changing code, state a clear hypothesis for the root cause and why the change should fix it.
    - Validate the hypothesis with tests, logs, or user repro feedback.
    - If the hypothesis fails, explicitly update beliefs, form a new hypothesis, and iterate.
    - Keep each hypothesis-test-change cycle atomic and scoped.

---

# this is a changesets repository

see https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md

While not every changeset is going to need a huge amount of detail, a good idea of what should be in a changeset is:

WHAT the change is
WHY the change was made
HOW a consumer should update their code

`pnpm changeset add -m` to create a new changeset, follow the prompts to fill in the details.
 - !import not passing the message will hang the agent harness usually
 - alternatialy `pnpx changeset add --empty` and edit the file added.
 - or make a file with a relevante unique kebab-case `.md` in the `.changeset/` directory
