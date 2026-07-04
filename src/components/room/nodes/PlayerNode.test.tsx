/**
 * PlayerNode — vote display driven by the round's phase (issue #227, user
 * stories 5, 8). The card face is asserted through what renders for a given
 * phase prop, never through how the component derives anything internally.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomUserData } from "@/convex/model/users";
import type { PlayerNodeData, PlayerNodeType } from "../types";
import { PlayerNode } from "./PlayerNode";

const USER: RoomUserData = {
  _id: "user-1" as Id<"users">,
  name: "Ada",
  isSpectator: false,
  role: "participant",
  joinedAt: 0,
  membershipId: "membership-1" as Id<"roomMemberships">,
};

function makeData(overrides: Partial<PlayerNodeData> = {}): PlayerNodeData {
  return {
    user: USER,
    isCurrentUser: false,
    isCardPicked: false,
    card: null,
    phase: "voting",
    role: "participant",
    ...overrides,
  };
}

function renderPlayer(data: PlayerNodeData) {
  return render(
    <ReactFlowProvider>
      <PlayerNode {...({ id: "player-1", data } as NodeProps<PlayerNodeType>)} />
    </ReactFlowProvider>,
  );
}

afterEach(cleanup);

describe("PlayerNode — vote display per phase", () => {
  it("shows the thinking face while voting without a card picked", () => {
    renderPlayer(makeData({ phase: "voting", isCardPicked: false }));
    expect(screen.getByText("🤔")).toBeDefined();
  });

  it("hides a picked card behind the voted check while voting", () => {
    renderPlayer(makeData({ phase: "voting", isCardPicked: true, card: null }));
    expect(screen.getByText("✅")).toBeDefined();
  });

  it("keeps a picked card hidden through the countdown", () => {
    renderPlayer(
      makeData({ phase: "countingDown", isCardPicked: true, card: null }),
    );
    expect(screen.getByText("✅")).toBeDefined();
  });

  it("shows the card value once revealed", () => {
    renderPlayer(makeData({ phase: "revealed", isCardPicked: true, card: "5" }));
    expect(screen.getByText("5")).toBeDefined();
  });

  it("shows the asleep face when revealed without a vote", () => {
    renderPlayer(makeData({ phase: "revealed", isCardPicked: false }));
    expect(screen.getByText("😴")).toBeDefined();
  });

  it("shows the spectator eyes regardless of phase", () => {
    renderPlayer(
      makeData({
        user: { ...USER, isSpectator: true },
        phase: "revealed",
        isCardPicked: false,
      }),
    );
    expect(screen.getByText("👀")).toBeDefined();
  });
});
