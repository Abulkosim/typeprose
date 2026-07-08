---
name: commit-push
description: Autonomously group pending changes into logical commits, write conventional-commit messages, then commit and push each one individually. Use whenever work is done and needs to be committed and pushed — "commit and push", "ship this", "save my work", or at the end of a task.
---

# Commit & Push

Turn the current working-tree changes into one or more **logically grouped** commits, each with a well-written message, and push them to `origin` **one at a time** (N commits → N pushes, in order).

The goal is autonomy: run end-to-end without asking the user to confirm groupings or messages, unless something genuinely blocks you (merge conflict, detached HEAD, no remote, secrets in the diff).

## Procedure

### 1. Survey the working tree

Run these in one batch:

```bash
git status --short
git diff --stat
git diff                 # unstaged changes
git diff --staged        # already-staged changes
git log --oneline -10    # match the repo's message style
```

If there is nothing to commit, stop and say so. Do not create empty commits.

### 2. Group the changes logically (delegate to Sonnet)

Spawn a subagent with **`model: sonnet`** (via the Agent tool) to decide the grouping and write the messages. This keeps the planning cheap and consistent. Give the subagent the full `git status`, `git diff`, and recent `git log` output, and ask it to return **strict JSON only**:

```json
{
  "commits": [
    {
      "message": "feat(web): add live WPM counter to typing HUD",
      "files": ["apps/web/src/hud.tsx", "apps/web/src/wpm.ts"],
      "rationale": "one line — why these files belong together"
    }
  ]
}
```

Rules to pass to the subagent:

- **Group by intent, not by directory.** Each commit should be one coherent, self-contained change (a feature, a fix, a refactor, a chore, docs, config). A change and its tests belong in the same commit.
- **Order matters.** Emit commits in dependency order — foundational/shared changes first, things that build on them after. They will be committed and pushed in array order.
- **Every changed file must appear in exactly one commit.** No file left out, no file in two groups. Include untracked files that are part of the work.
- **Messages follow the repo's existing convention.** This repo uses Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `docs`, `test`, sometimes scoped like `feat(web):`). Match it. Subject line imperative, ≤ ~72 chars, no trailing period. Add a short body only when the *why* isn't obvious from the subject.
- Prefer **fewer, meaningful commits** over splitting hairs. If everything is genuinely one change, return one commit.
- If a file is only partially related to two intents, keep it whole in the more relevant group (do not split hunks).
- **Do not add a `Co-Authored-By` trailer** (or any other AI/agent attribution) to commit messages. Keep messages to the subject and, when needed, a plain body — nothing else.

Parse the returned JSON. If it doesn't parse or a file is missing/duplicated, fix it yourself rather than re-prompting.

### 3. Commit and push each group, one by one

For **each** commit object in order:

```bash
git reset                                   # clear the index first
git add -- <files for this group>           # stage only this group's files
git commit -m "<message>"                   # or -F for multi-line bodies
git push origin <current-branch>            # push THIS commit before moving on
```

- Reset the index before each group so only that group's files are staged.
- **Push after every commit** — do not batch the pushes. If there are three commits, there are three separate `git push` calls, each immediately after its commit.
- Use a heredoc / `-F` file for messages with a body so newlines survive.
- If a push is rejected (remote ahead), `git pull --rebase origin <branch>` once, then retry the push. If the rebase conflicts, stop and report — don't force-push.

### 4. Report

Summarize what happened: each commit hash + subject, and confirm each was pushed. If anything was skipped or failed, say so plainly.

## Guardrails

- Never `git push --force` or `--force-with-lease` unless the user explicitly asks.
- Never commit obvious secrets (`.env`, private keys, tokens). If the diff contains them, stop and flag it.
- If on a detached HEAD or the default branch has protection issues, report instead of guessing.
- Don't amend or rewrite already-pushed commits.
- Match the repo style — do not invent a message format the repo doesn't use.
