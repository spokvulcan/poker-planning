/**
 * The poker room as one browser sees it (`rooms.get`), and what the viewer's
 * card pick does to it. The pick's optimistic update applies this, so the
 * card rises the moment it is clicked, by the rules the round applies a
 * moment later (`castVote`); Convex takes it back if the server refuses.
 * Pure.
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { phaseAllows, phaseOf } from "@/convex/phase";
import { deckOf } from "@/convex/scales";

/**
 * The room once a voter's card pick lands: their vote cast, or changed to that
 * card. What the round refuses changes nothing: a ballot from a spectator or
 * from someone no longer in the room, a card the room's deck doesn't deal, a
 * vote after the reveal. Only the votes change, so the room and its members
 * keep their objects and nothing that reads only them is rebuilt.
 */
export function applyCardPick(
  data: RoomWithRelatedData,
  voterId: Id<"users">,
  cardLabel: string
): RoomWithRelatedData {
  const voter = data.users.find((user) => user._id === voterId);
  if (!voter || voter.isSpectator) return data;
  if (!deckOf(data.room.votingScale).isLegalBallot(cardLabel)) return data;
  if (!phaseAllows(phaseOf(data.room), "vote")) return data;

  const own = data.votes.find((vote) => vote.userId === voterId);
  const votes = own
    ? data.votes.map((vote) => (vote === own ? { ...vote, cardLabel, hasVoted: true } : vote))
    : [
        ...data.votes,
        // A stand-in until the server's vote arrives.
        {
          _id: `optimistic:${voterId}` as Id<"votes">,
          _creationTime: 0,
          roomId: data.room._id,
          userId: voterId,
          cardLabel,
          hasVoted: true,
        },
      ];
  return { ...data, votes };
}
