/**
 * The board header's menu (spec §4.3, §5, §15.2): Delete retro is owner-only
 * and asks with the counted confirmation; Claim ownership shows for a team
 * admin who is not the owner; Keep with a team… shows for the owner of a
 * teamless retro who has a Team, and adopts into the chosen one. Base UI
 * overlays are mocked at their seams; the wiring through them is under test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  exports: 0,
  calls: [] as { fn: string; args: unknown }[],
  fail: {} as Record<string, string>,
  counts: { cards: 47, openActions: 3 } as { cards: number; openActions: number } | undefined,
  push: vi.fn(),
  toasts: [] as { kind: "success" | "error"; message: string }[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (_ref: unknown, args: unknown) => (args === "skip" ? undefined : mocks.counts),
    useMutation: (ref: unknown) => {
      const fn = getFunctionName(ref as never);
      return async (args: unknown) => {
        mocks.calls.push({ fn, args });
        if (mocks.fail[fn]) throw new Error(mocks.fail[fn]);
      };
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string) => mocks.toasts.push({ kind: "success", message }),
    error: (message: string) => mocks.toasts.push({ kind: "error", message }),
  },
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ render: el, children }: { render: ReactElement; children?: ReactNode }) =>
    cloneElement(el, undefined, children),
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, title }: { children?: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) => (
    <button role="menuitem" onClick={onClick} disabled={disabled} title={title}>{children}</button>
  ),
}));
vi.mock("@/components/ui/alert-dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? <div role="alertdialog">{children}</div> : null,
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
vi.mock("@/components/ui/dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: pass,
    DialogHeader: pass,
    DialogFooter: pass,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

vi.mock("./use-export-markdown", () => ({
  useExportMarkdown: () => async () => {
    mocks.exports += 1;
  },
}));
vi.mock("./retro-settings-dialog", () => ({
  RetroSettingsDialog: ({ open, name, hasTeam, decision }: { open: boolean; name: string; hasTeam: boolean; decision: { allowed: boolean } }) =>
    open ? <div data-testid="settings" data-team={String(hasTeam)} data-allowed={String(decision.allowed)}>{name}</div> : null,
}));

import { RetroMenu } from "./retro-menu";
import { deleteRetroConfirm, keptByTeam } from "@/convex/retroCopy";

const roomId = "room-1" as never;
const acme = { _id: "team-1" as never, name: "Acme Squad" };
const calledWith = (fn: string) => mocks.calls.filter((c) => c.fn === fn).map((c) => c.args);

beforeEach(() => {
  mocks.exports = 0;
  mocks.calls = [];
  mocks.fail = {};
  mocks.toasts = [];
  mocks.counts = { cards: 47, openActions: 3 };
  mocks.push.mockReset();
});
afterEach(cleanup);

describe("RetroMenu — export (spec §15.3)", () => {
  it("every attendee, whatever their role, exports the retro as Markdown from the menu", async () => {
    render(<RetroMenu roomId={roomId} role="participant" isOwnerAbsent={false} myTeams={[]} />);
    const item = screen.getByRole("menuitem", { name: "Export as Markdown" }) as HTMLButtonElement;
    expect(item.disabled).toBe(false);
    fireEvent.click(item);
    await waitFor(() => expect(mocks.exports).toBe(1));
    expect(mocks.calls).toEqual([]);
  });
});

describe("RetroMenu — delete", () => {
  it("the owner sees the counted confirmation, deletes, and leaves for the team page", async () => {
    render(<RetroMenu roomId={roomId} team={acme} role="owner" isOwnerAbsent={false} myTeams={[{ ...acme, role: "member" }]} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete retro" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Delete this retro?")).toBeTruthy();
    expect(dialog.getByText(deleteRetroConfirm(47, 3))).toBeTruthy();
    expect(dialog.getByText(/47 cards, 3 open action items and its history are removed permanently\. This cannot be undone\./)).toBeTruthy();

    fireEvent.click(dialog.getByRole("button", { name: "Delete retro" }));
    await waitFor(() => expect(calledWith("retro:remove")).toEqual([{ roomId }]));
    expect(mocks.push).toHaveBeenCalledWith("/team/team-1");
  });

  it("a teamless owner lands on the homepage; singular counts read as singular", async () => {
    mocks.counts = { cards: 1, openActions: 1 };
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete retro" }));
    expect(screen.getByText(/1 card, 1 open action item and its history/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete retro" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
  });

  it("a participant sees Delete retro disabled with the owner-only copy", () => {
    render(<RetroMenu roomId={roomId} role="participant" isOwnerAbsent={false} myTeams={[]} />);
    const item = screen.getByRole("menuitem", { name: "Delete retro" }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe("Only the owner can do this.");
  });

  it("a failed delete keeps the confirmation open with the server's copy", async () => {
    mocks.fail["retro:remove"] = "Room owner has left.";
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete retro" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete retro" }));
    await waitFor(() => expect(mocks.toasts).toContainEqual({ kind: "error", message: "Room owner has left." }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("RetroMenu — the ratchet (ADR-0012)", () => {
  it("the owner of a named retro confirms with the register copy and ratchets", async () => {
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} attribution="named" />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Make anonymous…" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Make this retro anonymous?")).toBeTruthy();
    expect(dialog.getByText("Every author is removed permanently and this cannot be undone.")).toBeTruthy();

    fireEvent.click(dialog.getByRole("button", { name: "Make anonymous" }));
    await waitFor(() => expect(calledWith("retro:ratchet")).toEqual([{ roomId }]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.toasts.at(-1)).toEqual({ kind: "success", message: "This retro is now anonymous" });
  });

  it("is absent once the retro is anonymous, and disabled for a non-owner with the owner-only copy", () => {
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} attribution="anonymous" />);
    expect(screen.queryByRole("menuitem", { name: "Make anonymous…" })).toBeNull();
    cleanup();
    render(<RetroMenu roomId={roomId} role="facilitator" isOwnerAbsent={false} myTeams={[]} attribution="named" />);
    const item = screen.getByRole("menuitem", { name: "Make anonymous…" }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe("Only the owner can do this.");
  });

  it("a refused ratchet keeps the confirmation open with the server's copy", async () => {
    mocks.fail["retro:ratchet"] = "Room owner has left.";
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} attribution="named" />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Make anonymous…" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Make anonymous" }));
    await waitFor(() => expect(mocks.toasts).toContainEqual({ kind: "error", message: "Room owner has left." }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});

describe("RetroMenu — claim", () => {
  it("a team admin who is not the owner can claim; the server's refusal surfaces", async () => {
    mocks.fail["retro:claim"] = "The owner is still here — ask them to transfer ownership.";
    render(<RetroMenu roomId={roomId} team={acme} role="participant" isOwnerAbsent={false} myTeams={[{ ...acme, role: "admin" }]} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Claim ownership" }));
    await waitFor(() => expect(calledWith("retro:claim")).toEqual([{ roomId }]));
    expect(mocks.toasts.at(-1)).toEqual({ kind: "error", message: "The owner is still here — ask them to transfer ownership." });
  });

  it("is absent for a team member, for the owner, and on a teamless retro", () => {
    const { unmount } = render(<RetroMenu roomId={roomId} team={acme} role="participant" isOwnerAbsent={true} myTeams={[{ ...acme, role: "member" }]} />);
    expect(screen.queryByRole("menuitem", { name: "Claim ownership" })).toBeNull();
    unmount();
    render(<RetroMenu roomId={roomId} team={acme} role="owner" isOwnerAbsent={false} myTeams={[{ ...acme, role: "admin" }]} />);
    expect(screen.queryByRole("menuitem", { name: "Claim ownership" })).toBeNull();
    cleanup();
    render(<RetroMenu roomId={roomId} role="participant" isOwnerAbsent={true} myTeams={[{ ...acme, role: "admin" }]} />);
    expect(screen.queryByRole("menuitem", { name: "Claim ownership" })).toBeNull();
  });
});

describe("RetroMenu — keep with a team", () => {
  it("the owner of a teamless retro picks one of their Teams and adopts into it", async () => {
    render(
      <RetroMenu
        roomId={roomId}
        role="owner"
        isOwnerAbsent={false}
        myTeams={[{ ...acme, role: "member" }, { _id: "team-2" as never, name: "Beta", role: "admin" }]}
      />
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Keep with a team…" }));
    const dialog = within(screen.getByRole("dialog"));
    const button = dialog.getByRole("button", { name: "Keep with team" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText("Team"), { target: { value: "team-2" } });
    fireEvent.click(dialog.getByRole("button", { name: "Keep with team" }));

    await waitFor(() => expect(calledWith("retro:adoptIntoTeam")).toEqual([{ roomId, teamId: "team-2" }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.toasts.at(-1)).toEqual({ kind: "success", message: keptByTeam("Beta") });
  });

  it("is absent on a team retro, for a non-owner, and for someone with no Team", () => {
    render(<RetroMenu roomId={roomId} team={acme} role="owner" isOwnerAbsent={false} myTeams={[{ ...acme, role: "admin" }]} />);
    expect(screen.queryByRole("menuitem", { name: "Keep with a team…" })).toBeNull();
    cleanup();
    render(<RetroMenu roomId={roomId} role="facilitator" isOwnerAbsent={false} myTeams={[{ ...acme, role: "admin" }]} />);
    expect(screen.queryByRole("menuitem", { name: "Keep with a team…" })).toBeNull();
    cleanup();
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} />);
    expect(screen.queryByRole("menuitem", { name: "Keep with a team…" })).toBeNull();
  });
});

describe("RetroMenu — settings", () => {
  const settings = {
    name: "Sprint 12",
    joinPolicy: "anyone" as const,
    retro: {} as never,
    decision: { allowed: false as const, message: "Only facilitators and the owner can do this" },
  };

  it("opens the settings dialog with the retro and the decision, for a team retro", () => {
    render(<RetroMenu roomId={roomId} team={acme} role="participant" isOwnerAbsent={false} myTeams={[]} settings={settings} />);
    expect(screen.queryByTestId("settings")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Retro settings…" }));
    const dialog = screen.getByTestId("settings");
    expect(dialog.textContent).toBe("Sprint 12");
    expect(dialog.getAttribute("data-team")).toBe("true");
    expect(dialog.getAttribute("data-allowed")).toBe("false");
  });

  it("has no settings item when nothing is handed to it", () => {
    render(<RetroMenu roomId={roomId} role="owner" isOwnerAbsent={false} myTeams={[]} />);
    expect(screen.queryByRole("menuitem", { name: "Retro settings…" })).toBeNull();
  });
});
