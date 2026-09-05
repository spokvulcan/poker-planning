/**
 * TeamContent — the team page's wiring from the members-only read to the
 * team mutations (spec §5): an admin gets live rename, role, remove, rotate
 * and delete controls that reach the right mutation with the right target
 * and never act on their own row; a member gets none of them; a refused
 * write (the last-admin rule) surfaces the server's copy and keeps the
 * confirmation open. Convex, routing, chrome and the Base UI overlays are
 * mocked at their seams; the retro-defaults panel is real.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { LAST_ADMIN_MESSAGE } from "@/convex/teamCopy";
import { DEFAULT_RETRO_PERMISSIONS } from "@/convex/permissions";

type Team = {
  _id: string;
  name: string;
  inviteToken: string;
  retroDefaults: { attribution: "named" | "anonymous"; joinPolicy: "anyone" | "permanentAccounts" | "teamMembers"; permissions: typeof DEFAULT_RETRO_PERMISSIONS };
  createdAt: number;
  myUserId: string;
  myRole: "admin" | "member";
  roomCount: number;
  members: { userId: string; name: string; role: "admin" | "member"; joinedAt: number }[];
};

const mocks = vi.hoisted(() => ({
  team: undefined as Team | undefined,
  retros: [] as unknown[] | undefined,
  openActions: { items: [], rooms: [] } as { items: unknown[]; rooms: unknown[] } | undefined,
  facts: undefined as { open: number; done: number; dropped: number; retros: number } | undefined,
  calls: [] as { fn: string; args: unknown }[],
  fail: {} as Record<string, string>,
  push: vi.fn(),
  toasts: [] as { kind: "success" | "error"; message: string }[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: unknown) => {
      const fn = getFunctionName(ref as never);
      if (fn === "retro:listForTeam") return mocks.retros;
      if (fn === "teams:openActions") return mocks.openActions;
      if (fn === "teams:facts") return mocks.facts;
      return mocks.team;
    },
    useMutation: (ref: unknown) => {
      const fn = getFunctionName(ref as never);
      return async (args: unknown) => {
        mocks.calls.push({ fn, args });
        if (mocks.fail[fn]) throw new Error(mocks.fail[fn]);
      };
    },
  };
});
vi.mock("next/navigation", () => {
  const router = { push: (href: string) => mocks.push(href), replace: vi.fn() };
  return { useParams: () => ({ teamId: "team-1" }), useRouter: () => router };
});
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));
vi.mock("@/components/user-menu/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/retro/history-row", () => ({
  HistoryRows: ({ rows }: { rows: { roomId: string; name: string }[] }) => (
    <ul data-testid="retro-rows">
      {rows.map((row) => (
        <li key={row.roomId}>{row.name}</li>
      ))}
    </ul>
  ),
}));
vi.mock("@/utils/copy-text-to-clipboard", () => ({ copyTextToClipboard: async () => true }));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string) => mocks.toasts.push({ kind: "success", message }),
    error: (message: string) => mocks.toasts.push({ kind: "error", message }),
  },
}));
// Base UI overlays need a portal and pointer environment jsdom lacks; their
// structure is not under test, the wiring through them is.
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render: el, children }: { render: ReactElement; children?: ReactNode }) =>
    cloneElement(el, undefined, children),
  TooltipContent: () => null,
}));
vi.mock("@/components/ui/alert-dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? <div role="dialog">{children}</div> : null,
    AlertDialogContent: pass,
    AlertDialogHeader: pass,
    AlertDialogFooter: pass,
    AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    AlertDialogCancel: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
      <button disabled={disabled}>{children}</button>
    ),
    AlertDialogAction: ({ children, onClick, disabled }: { children?: ReactNode; onClick?: () => void; disabled?: boolean }) => (
      <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
  };
});

import { TeamContent } from "./team-content";

function team(myRole: "admin" | "member"): Team {
  return {
    _id: "team-1",
    name: "Acme",
    inviteToken: "tok",
    retroDefaults: { attribution: "named", joinPolicy: "anyone", permissions: { ...DEFAULT_RETRO_PERMISSIONS } },
    createdAt: 0,
    myUserId: "me",
    myRole,
    roomCount: 3,
    members: [
      { userId: "me", name: "Me", role: myRole, joinedAt: 0 },
      { userId: "u2", name: "Bea", role: "admin", joinedAt: 1 },
      { userId: "u3", name: "Cal", role: "member", joinedAt: 2 },
    ],
  };
}

const calledWith = (fn: string) => mocks.calls.filter((c) => c.fn === fn).map((c) => c.args);
const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => {
  mocks.openActions = { items: [], rooms: [] };
  mocks.facts = undefined;
  mocks.team = team("admin");
  mocks.retros = [];
  mocks.calls = [];
  mocks.fail = {};
  mocks.toasts = [];
  mocks.push.mockReset();
});
afterEach(cleanup);

describe("TeamContent as an admin", () => {
  it("shows role and remove controls for every other member and none for the caller's own row", () => {
    render(<TeamContent />);
    expect(screen.getByRole("button", { name: "Make Bea a member" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make Cal an admin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Cal" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Me an admin|Me a member|Remove Me/ })).toBeNull();
    expect(screen.getByText("(you)")).toBeTruthy();
  });

  it("renames on blur with the trimmed name, and skips a no-op", async () => {
    render(<TeamContent />);
    const input = screen.getByRole("textbox", { name: "Team name" });
    fireEvent.change(input, { target: { value: "  Acme  " } });
    fireEvent.blur(input);
    expect(calledWith("teams:rename")).toEqual([]);

    fireEvent.change(input, { target: { value: "  Beta Crew " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    await waitFor(() => expect(calledWith("teams:rename")).toEqual([{ teamId: "team-1", name: "Beta Crew" }]));
  });

  it("promote and demote reach the mutations with the right target", () => {
    render(<TeamContent />);
    fireEvent.click(screen.getByRole("button", { name: "Make Cal an admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Make Bea a member" }));
    expect(calledWith("teams:promote")).toEqual([{ teamId: "team-1", targetUserId: "u3" }]);
    expect(calledWith("teams:demote")).toEqual([{ teamId: "team-1", targetUserId: "u2" }]);
  });

  it("removal asks first, then removes exactly that member", async () => {
    render(<TeamContent />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Cal" }));
    expect(dialog().getByText("Remove Cal?")).toBeTruthy();
    expect(calledWith("teams:removeMember")).toEqual([]);

    fireEvent.click(dialog().getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(calledWith("teams:removeMember")).toEqual([{ teamId: "team-1", targetUserId: "u3" }])
    );
    expect(mocks.toasts.at(-1)?.kind).toBe("success");
  });

  it("rotates the invite link", async () => {
    render(<TeamContent />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    await waitFor(() => expect(calledWith("teams:rotateInvite")).toEqual([{ teamId: "team-1" }]));
    expect(screen.getByRole("textbox", { name: "Invite link" }).getAttribute("value")).toMatch(/\/team\/join\/tok$/);
  });

  it("a retro-defaults change writes the whole bundle by value", async () => {
    render(<TeamContent />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Attribution" })).getByRole("radio", { name: "Anonymous" }));
    await waitFor(() =>
      expect(calledWith("teams:updateRetroDefaults")).toEqual([
        { teamId: "team-1", retroDefaults: { ...team("admin").retroDefaults, attribution: "anonymous" } },
      ])
    );
  });

  it("deleting shows the spec's confirmation, deletes, and leaves the page", async () => {
    render(<TeamContent />);
    fireEvent.click(screen.getByRole("button", { name: "Delete team" }));
    expect(dialog().getByText("Delete Acme?")).toBeTruthy();
    expect(dialog().getByText(/Its 3 retros and their action items are removed permanently\. This cannot be undone\./)).toBeTruthy();

    fireEvent.click(dialog().getByRole("button", { name: "Delete team" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/retros"));
    expect(calledWith("teams:remove")).toEqual([{ teamId: "team-1" }]);
  });

  it("a refused leave shows the server's copy and keeps the confirmation open", async () => {
    mocks.fail["teams:leave"] = LAST_ADMIN_MESSAGE;
    render(<TeamContent />);
    fireEvent.click(screen.getByRole("button", { name: "Leave team" }));
    fireEvent.click(dialog().getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(mocks.toasts).toContainEqual({ kind: "error", message: LAST_ADMIN_MESSAGE }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a failed delete keeps the confirmation open for another try", async () => {
    mocks.fail["teams:remove"] = "boom";
    render(<TeamContent />);
    fireEvent.click(screen.getByRole("button", { name: "Delete team" }));
    fireEvent.click(dialog().getByRole("button", { name: "Delete team" }));

    await waitFor(() => expect(mocks.toasts).toContainEqual({ kind: "error", message: "boom" }));
    expect(dialog().getByRole("button", { name: "Delete team" })).toBeTruthy();
    expect((dialog().getByRole("button", { name: "Delete team" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("TeamContent — the Team's retros", () => {
  it("lists the rows the listing query returns, in its order, and New retro pre-selects the Team", () => {
    mocks.retros = [
      { roomId: "r1", name: "First", stageKind: "close", createdAt: 1 },
      { roomId: "r2", name: "Second", stageKind: "collect", createdAt: 2 },
    ];
    render(<TeamContent />);
    const rows = within(screen.getByTestId("retro-rows")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["First", "Second"]);
    expect(screen.getByRole("link", { name: /New retro/ }).getAttribute("href")).toBe("/retro/new?team=team-1");
  });

  it("shows the empty line when the Team has no retros yet", () => {
    mocks.retros = [];
    render(<TeamContent />);
    expect(screen.getByText("No retros yet. Start one and this team keeps it.")).toBeTruthy();
    expect(screen.queryByTestId("retro-rows")).toBeNull();
  });
});

describe("TeamContent — the open action items (spec §5, §13)", () => {
  it("lists the Team's open items with the retro each came from, and completes one in place through the room's mutation", () => {
    mocks.openActions = {
      items: [
        {
          _id: "a1",
          roomId: "r1",
          roomName: "First",
          text: "Write the runbook",
          status: "open",
          createdBy: "u1",
          creatorName: "Ada",
          createdAt: 1,
          updatedAt: 1,
          rights: { edit: true, manage: false },
        },
      ],
      rooms: [{ roomId: "r1", name: "First", members: [], attending: true }],
    };
    render(<TeamContent />);
    const list = screen.getByTestId("team-open-actions");
    expect(list.getAttribute("data-count")).toBe("1");
    expect(within(list).getByText("Write the runbook")).toBeTruthy();
    expect(within(list).getByText(/First/)).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Done" }));
    fireEvent.click(within(list).getByRole("button", { name: "Save" }));
    expect(mocks.calls).toEqual([
      { fn: "retro:setActionStatus", args: { roomId: "r1", actionId: "a1", status: "done" } },
    ]);
  });

  it("reads the empty line with nothing open across the Team", () => {
    mocks.openActions = { items: [], rooms: [] };
    render(<TeamContent />);
    expect(screen.getByText("No open action items across this team's retros.")).toBeTruthy();
  });

  it("reads the count line above the list once the facts arrive, the same for admin and member (spec §17)", () => {
    mocks.facts = { open: 3, done: 12, dropped: 2, retros: 14 };
    for (const role of ["admin", "member"] as const) {
      mocks.team = team(role);
      render(<TeamContent />);
      expect(screen.getByTestId("team-count-line").textContent).toBe("3 open · 12 done · 2 dropped across 14 retros");
      cleanup();
    }
  });

  it("shows no count line while the facts load", () => {
    render(<TeamContent />);
    expect(screen.queryByTestId("team-count-line")).toBeNull();
  });
});

describe("TeamContent as a member", () => {
  it("shows the roster and invite link but no admin controls", () => {
    mocks.team = team("member");
    render(<TeamContent />);
    expect(screen.getByRole("heading", { name: "Acme" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Team name" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Make |Remove /})).toBeNull();
    expect(screen.queryByRole("button", { name: "Rotate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete team" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave team" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    for (const radio of screen.getAllByRole("radio")) {
      expect((radio as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
