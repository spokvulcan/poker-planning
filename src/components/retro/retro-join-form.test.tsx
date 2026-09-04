/**
 * The retro join form (spec §4.2, §4.4, §18.1): joining a retro is a
 * deliberate act with no spectator toggle, and the join decision's copy
 * disables the form before a refused join is attempted.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  auth: { authUserId: "auth-1" as string | null, accountType: "anonymous" as "anonymous" | "permanent" | null },
}));

vi.mock("convex/react", () => ({ useMutation: () => mocks.join }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/useEnsureSession", () => ({
  useEnsureSession: () => async () => mocks.auth.authUserId,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { RetroJoinForm } from "./retro-join-form";
import { JOIN_DENIED_PERMANENT } from "@/convex/retroCopy";
import type { Id } from "@/convex/_generated/dataModel";

const roomId = "room1" as Id<"rooms">;

beforeEach(() => {
  mocks.join.mockReset().mockResolvedValue("user1");
  mocks.auth.accountType = "anonymous";
});
afterEach(cleanup);

describe("RetroJoinForm", () => {
  it("has no spectator toggle and joins with the name only", async () => {
    render(<RetroJoinForm roomId={roomId} roomName="Sprint 12" joinPolicy="anyone" isTeamMember={false} />);
    expect(screen.queryByLabelText(/spectator/i)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Join retro" }));

    await waitFor(() => expect(mocks.join).toHaveBeenCalledTimes(1));
    expect(mocks.join.mock.calls[0][0]).toEqual({ roomId, name: "Ada", authUserId: "auth-1" });
    expect("isSpectator" in mocks.join.mock.calls[0][0]).toBe(false);
  });

  it("is disabled with the denial copy when the join policy refuses this account", () => {
    render(
      <RetroJoinForm roomId={roomId} roomName="R" joinPolicy="permanentAccounts" isTeamMember={false} />
    );
    expect(screen.getByText(JOIN_DENIED_PERMANENT)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    expect((screen.getByRole("button", { name: "Join retro" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a team member passes every policy", () => {
    render(<RetroJoinForm roomId={roomId} roomName="R" joinPolicy="teamMembers" isTeamMember />);
    expect(screen.queryByText(/This retro is for/)).toBeNull();
  });
});
