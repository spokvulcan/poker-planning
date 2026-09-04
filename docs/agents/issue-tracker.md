# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The `wayfinder` skill's map, tickets, blocking edges and frontier query map onto GitHub as follows.
`OWNER/REPO` is `spokvulcan/poker-planning`.

- **The map** is an issue labelled `wayfinder:map`. Find it with
  `gh issue list --label "wayfinder:map" --state open`.
- **Tickets** are **native sub-issues** of the map, each labelled `wayfinder:research` /
  `wayfinder:prototype` / `wayfinder:grilling` / `wayfinder:task`.
- **Claiming** a ticket is `gh issue edit <n> --add-assignee @me`. An open, unassigned child is unclaimed.

### Attaching a ticket to the map

Sub-issues take the child's **id**, not its number, and `gh api` needs `-F` (typed) not `-f` (string):

```bash
CHILD_ID=$(gh api repos/OWNER/REPO/issues/<child-number> --jq .id)
gh api --method POST repos/OWNER/REPO/issues/<map-number>/sub_issues -F sub_issue_id=$CHILD_ID
```

### Blocking edges

GitHub's native issue dependencies. Same id-not-number rule:

```bash
BLOCKER_ID=$(gh api repos/OWNER/REPO/issues/<blocker-number> --jq .id)
gh api --method POST repos/OWNER/REPO/issues/<blocked-number>/dependencies/blocked_by -F issue_id=$BLOCKER_ID
# remove:
gh api --method DELETE repos/OWNER/REPO/issues/<blocked-number>/dependencies/blocked_by/$BLOCKER_ID
```

### The frontier

Open, unblocked, unclaimed children of the map:

```bash
gh api repos/OWNER/REPO/issues/<map-number>/sub_issues \
  --jq '.[] | select(.state=="open") | select(.issue_dependencies_summary.blocked_by==0) | select(.assignee==null) | "#\(.number) \(.title)"'
```

### Resolving a ticket

`gh issue comment <n> --body "..."` with the answer, then `gh issue close <n>`, then edit the map body to
append a one-line entry under **Decisions so far** linking the closed ticket.
