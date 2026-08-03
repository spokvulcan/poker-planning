/**
 * IssueItem — denial copy on the title and the actions menu comes from the
 * resolved decisions, not from the component's own text: a game-flow denial
 * turns the (non-clickable) title's tooltip into the denial message instead
 * of falling back to the plain title, and an issue-management denial renders
 * the menu button disabled with the message as tooltip and accessible label.
 * Decisions come from the real computePermissions.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { computePermissions } from "@/hooks/usePermissions";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  denialMessage,
  RESOLVED_ALLOWED,
  type ResolvedDecision,
  type RoomPermissions,
} from "@/convex/permissions";
import { IssueItem } from "./issue-item";

const allEveryone: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

/** Minimal RoomWithRelatedData fixture — only the fields the mapping reads. */
function roomData(permissions: RoomPermissions): RoomWithRelatedData {
  return {
    room: { permissions },
    users: [{ _id: "u1", role: "participant" }],
    isOwnerAbsent: false,
  } as unknown as RoomWithRelatedData;
}

const ISSUE = {
  _id: "issue-1",
  title: "Write tests",
  status: "pending",
} as unknown as Doc<"issues">;

function renderItem(opts: {
  canManageIssues?: ResolvedDecision;
  canControlGameFlow?: ResolvedDecision;
  onStartVoting?: (id: Id<"issues">) => void;
}) {
  return render(
    <IssueItem
      issue={ISSUE}
      isCurrent={false}
      onStartVoting={opts.onStartVoting ?? (() => {})}
      onUpdateTitle={() => {}}
      onUpdateEstimate={() => {}}
      onDelete={() => {}}
      canManageIssues={opts.canManageIssues ?? RESOLVED_ALLOWED}
      canControlGameFlow={opts.canControlGameFlow ?? RESOLVED_ALLOWED}
    />
  );
}

afterEach(cleanup);

describe("IssueItem — start-voting denial copy", () => {
  it("game-flow denied: the title stays a span but its tooltip is the denial message", () => {
    const perms = computePermissions(
      roomData({ ...allEveryone, gameFlow: "facilitators" }),
      "u1"
    );
    renderItem({ canControlGameFlow: perms.gameFlow });

    const title = screen.getByText("Write tests");
    expect(title.tagName).toBe("SPAN");
    expect(title.getAttribute("title")).toBe(
      denialMessage(
        { kind: "category", category: "gameFlow", level: "facilitators" },
        "insufficient-role"
      )
    );
  });

  it("game-flow allowed: the title is a button with the start-voting tooltip", () => {
    const onStartVoting = vi.fn();
    renderItem({ onStartVoting });

    const title = screen.getByRole("button", {
      name: "Write tests",
    });
    expect(title.getAttribute("title")).toBe("Click to vote on: Write tests");

    fireEvent.click(title);
    expect(onStartVoting).toHaveBeenCalledWith("issue-1");
  });
});

describe("IssueItem — issue-management denial", () => {
  it("renders the actions button disabled with the denial message as tooltip and label", () => {
    const perms = computePermissions(
      roomData({ ...allEveryone, issueManagement: "facilitators" }),
      "u1"
    );
    renderItem({ canManageIssues: perms.issueManagement });

    const message = denialMessage(
      { kind: "category", category: "issueManagement", level: "facilitators" },
      "insufficient-role"
    );
    const actions = screen.getByRole("button", { name: message });
    expect(actions).toHaveProperty("disabled", true);
    expect(actions.getAttribute("title")).toBe(message);
  });
});
