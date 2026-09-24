---
title: "Jira Integration Is Here: Import Issues, Push Estimates, Stay in Sync"
date: "2026-02-27"
spoiler: "AgileKit now connects to Jira Cloud. Pull sprint issues into your planning sessions, push story point estimates back when your team agrees on a number, and stop copy-pasting between tabs."
tags: ["jira", "integration", "agile", "estimation", "planning-poker", "scrum"]
---

<Tldr>
AgileKit now talks to Jira Cloud. Connect your Atlassian account, import sprint issues into a planning room, and have story point estimates written back to Jira the moment your team reaches consensus. Your tokens are encrypted, refresh on their own, and you can disconnect whenever you want.
</Tldr>

You know the routine. Open Jira in one tab, AgileKit in another. Copy an issue title, paste it into the room, estimate it, then go back to Jira and type the number into the story points field. Repeat forty times. Forget to update three of them.

That workflow is done. AgileKit now connects to Jira Cloud directly, so your sprint backlog flows into planning sessions and your estimates flow back out.

## Import Issues from Jira

Instead of creating issues by hand, you can pull them straight from your Jira project:

1. Open your planning room
2. Click **Import from Jira** in the issues panel
3. Pick your project, board, and sprint
4. Check the issues you want to estimate
5. Hit **Import**

The issues show up in your room with their original Jira titles. Each one has a link icon that opens the Jira issue in a new tab, so you can always jump to the full context if the team needs more detail mid-discussion.

## Estimates Go Back Automatically

Once your team reaches consensus on an imported issue, AgileKit can write the story point estimate back to Jira for you. The field updates without anyone leaving the session or opening another tab.

You turn this on per-room in the integration settings. There's also an option to post a comment on the Jira issue noting the estimate and that it came from a planning session, which is handy if your team likes an audit trail.

## Changes Sync Both Ways

If someone renames an issue in Jira while your session is running, AgileKit picks up the change within seconds. Deleted issues get flagged in the room too. This happens through Jira webhooks, so you don't need to refresh anything.

## Setting It Up

The whole thing takes about two minutes.

### 1. Connect Your Jira Account

Head to your [Dashboard Settings](/dashboard/settings) and find the Integrations section. Click **Connect Jira** and you'll be sent to Atlassian to authorize access.

AgileKit asks for read and write access to your issues and sprints. The write access is only used for pushing estimates back. If you just want to import issues without writing anything to Jira, you can leave the auto-push toggle off in room settings.

### 2. Map a Room to a Jira Project

Open a planning room and go to the room's integration settings. Pick your Jira project and board from the dropdowns. AgileKit auto-detects your story points field, whether your team uses the standard "Story Points" field or the newer "Story point estimate" custom field.

Two toggles to know about:

- **Auto-import new sprint issues** pulls issues in when a new sprint starts, so the room is ready before the meeting begins
- **Auto-push estimates** sends consensus values back to Jira as story points the moment voting closes

### 3. Run Your Session

That's the whole setup. [Start a session](/room/new) and estimate as usual. Imported issues work exactly like ones you create manually: your team votes, discusses, reaches consensus. The only visible difference is the Jira link on each issue card and the sync running quietly in the background.

## Security

All OAuth tokens are encrypted at rest with AES-256-GCM. AgileKit never sees or stores your Jira password. Tokens refresh automatically before they expire, so you won't get kicked out mid-session.

If you want to disconnect, go to your [settings page](/dashboard/settings) and remove the connection. That deletes all stored tokens and stops every sync immediately.

## What's Coming Next

This is the first integration. GitHub Issues is next on the list, following the same pattern: pull issues in, push estimates out, keep everything in sync.

If you hit a bug or have thoughts on how this should work, [open an issue on GitHub](https://github.com/jkrumm/planning-poker/issues). Check out the full [feature list](/features) to see everything else AgileKit can do.

### Missing your tool?

Does your team use Linear, Trello, Shortcut, YouTrack, or another project management tool? [Open a feature request on GitHub](https://github.com/jkrumm/planning-poker/issues) and let us know. The more requests a tool gets, the sooner it moves up the roadmap.

---

Want to try it? [Create a planning room](/room/new) and connect Jira from your [dashboard settings](/dashboard/settings).
