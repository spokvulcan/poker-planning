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
  calls: [] as { fn: string; args: unknown }[],
  fail: {} as Record<string, string>,
  push: vi.fn(),
  toasts: [] as { kind: "success" | "error"; message: string }[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => mocks.team,
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
  mocks.team = team("admin");
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
