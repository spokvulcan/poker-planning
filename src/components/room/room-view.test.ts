import { describe, it, expect } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { RoomUserData } from "@/convex/model/memberships";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
import { applyCardPick } from "./room-view";

// The room a browser sees once its own card pick lands, by the rules the
// round applies a moment later: what the pick's optimistic update shows.

const ROOM_ID = "room-1" as Id<"rooms">;
const ME = "user-me" as Id<"users">;
const ADA = "user-ada" as Id<"users">;

function member(id: Id<"users">, isSpectator = false): RoomUserData {
  return { _id: id, name: id, isSpectator, role: "participant", joinedAt: 0, membershipId: `m-${id}` as Id<"roomMemberships"> };
}

/** A vote as the viewer is sent it: their own with its card, anyone else's face down until the reveal. */
function vote(userId: Id<"users">, cardLabel?: string): SanitizedVote {
  return { _id: `vote-${userId}` as Id<"votes">, _creationTime: 0, roomId: ROOM_ID, userId, cardLabel, hasVoted: true };
}

function roomData(overrides: Partial<RoomWithRelatedData> = {}, room: Partial<Doc<"rooms">> = {}): RoomWithRelatedData {
  return {
    room: {
      _id: ROOM_ID,
      _creationTime: 0,
      name: "Sprint 42",
      roomType: "canvas",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: 0,
      lastActivityAt: 0,
      retained: false,
      ...room,
    },
    users: [member(ME), member(ADA)],
    votes: [],
    isOwnerAbsent: false,
    ...overrides,
  };
}

const cards = (data: RoomWithRelatedData) => data.votes.map((v) => [v.userId, v.cardLabel ?? null, v.hasVoted]);

describe("applyCardPick", () => {
  it("casts the viewer's vote beside everyone else's", () => {
    const after = applyCardPick(roomData({ votes: [vote(ADA)] }), ME, "5");

    expect(cards(after)).toEqual([
      [ADA, null, true],
      [ME, "5", true],
    ]);
  });

  it("changes the card of a vote the viewer already cast", () => {
    const after = applyCardPick(roomData({ votes: [vote(ME, "3"), vote(ADA)] }), ME, "8");

    expect(cards(after)).toEqual([
      [ME, "8", true],
      [ADA, null, true],
    ]);
  });

  it("keeps the room and its members as they were, so nothing that reads only them changes", () => {
    const before = roomData();

    const after = applyCardPick(before, ME, "5");

    expect(after.room).toBe(before.room);
    expect(after.users).toBe(before.users);
  });

  it("takes a card the room's own deck deals", () => {
    const tshirt = roomData({}, { votingScale: { type: "tshirt", cards: ["S", "M", "L", "XL"], isNumeric: false } });

    expect(cards(applyCardPick(tshirt, ME, "XL"))).toEqual([[ME, "XL", true]]);
  });

  it("changes nothing the round would refuse", () => {
    const revealed = roomData({}, { isGameOver: true });
    const open = roomData();
    const spectating = roomData({ users: [member(ME, true), member(ADA)] });

    expect(applyCardPick(revealed, ME, "5")).toBe(revealed);
    expect(applyCardPick(open, ME, "XL")).toBe(open);
    expect(applyCardPick(spectating, ME, "5")).toBe(spectating);
    expect(applyCardPick(open, "user-gone" as Id<"users">, "5")).toBe(open);
  });
});
