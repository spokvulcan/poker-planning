/**
 * Test data constants for e2e tests
 */

export const TEST_USERS = {
  participant1: {
    name: "Alice",
    role: "participant" as const,
  },
  participant2: {
    name: "Bob", 
    role: "participant" as const,
  },
  participant3: {
    name: "Charlie",
    role: "participant" as const,
  },
  spectator1: {
    name: "Observer",
    role: "spectator" as const,
  },
  longName: {
    name: "User with a very long name that might cause UI issues",
    role: "participant" as const,
  },
  specialChars: {
    name: "User@123!#$",
    role: "participant" as const,
  },
  unicode: {
    name: "用户名 🎯",
    role: "participant" as const,
  },
} as const;

export const CARD_VALUES = {
  fibonacci: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "∞", "?", "☕"],
  standard: ["0", "0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"],
  tShirt: ["XS", "S", "M", "L", "XL", "XXL", "?", "☕"],
} as const;

export const ROOM_NAMES = {
  default: "Planning Poker Room",
  sprint: "Sprint Planning",
  refinement: "Backlog Refinement",
  longName: "This is a very long room name that should be handled gracefully by the UI without breaking the layout",
  specialChars: "Room #123 @Special!",
  unicode: "会议室 🏢",
} as const;

export const ERROR_MESSAGES = {
  roomNotFound: "Room not found",
  connectionLost: "Connection lost. Trying to reconnect...",
  votingInProgress: "Voting is already in progress",
  alreadyRevealed: "Cards have already been revealed",
  duplicateName: "This name is already taken",
  roomFull: "Room is at capacity",
} as const;

export const TIMEOUTS = {
  shortWait: 500,
  normalWait: 1000,
  longWait: 3000,
  networkWait: 5000,
  roomLoad: 10000,
  multiUserSync: 2000,
} as const;

export const DELAYS = {
  betweenActions: 100,
  afterVote: 200,
  afterReveal: 500,
  networkSimulation: 1000,
} as const;

export const ROOM_CONFIG = {
  maxParticipants: 20,
  maxSpectators: 10,
  maxNameLength: 50,
  minNameLength: 1,
  defaultCardDeck: "fibonacci",
  timerDurations: [30, 60, 90, 120, 180, 300], // seconds
} as const;

export const TEST_SCENARIOS = {
  happyPath: {
    users: [TEST_USERS.participant1, TEST_USERS.participant2, TEST_USERS.participant3],
    votes: ["5", "8", "5"],
    expectedConsensus: false,
  },
  consensus: {
    users: [TEST_USERS.participant1, TEST_USERS.participant2, TEST_USERS.participant3],
    votes: ["5", "5", "5"],
    expectedConsensus: true,
  },
  withSpectator: {
    users: [TEST_USERS.participant1, TEST_USERS.participant2, TEST_USERS.spectator1],
    votes: ["3", "5", null], // spectator doesn't vote
    expectedVoteCount: 2,
  },
  largeTeam: {
    userCount: 15,
    voteDistribution: {
      "3": 5,
      "5": 6,
      "8": 3,
      "?": 1,
    },
  },
} as const;

/**
 * Generate test user names for bulk testing
 */
export function generateTestUsers(count: number, prefix: string = "User"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

/**
 * Get random card value from deck
 */
export function getRandomCardValue(deck: keyof typeof CARD_VALUES = "fibonacci"): string {
  const values = CARD_VALUES[deck];
  // Exclude special cards like ? and ☕ for random selection
  const votableValues = values.filter(v => !["?", "☕"].includes(v));
  return votableValues[Math.floor(Math.random() * votableValues.length)];
}

/**
 * Generate vote distribution for testing
 */
export function generateVoteDistribution(
  userCount: number,
  consensusLevel: "none" | "low" | "medium" | "high" = "medium"
): string[] {
  const votes: string[] = [];
  
  if (consensusLevel === "high") {
    // All vote the same
    const value = getRandomCardValue();
    return Array(userCount).fill(value);
  }
  
  const primaryValue = getRandomCardValue();
  const secondaryValue = getRandomCardValue();
  
  for (let i = 0; i < userCount; i++) {
    if (consensusLevel === "none") {
      // Everyone votes differently
      votes.push(getRandomCardValue());
    } else if (consensusLevel === "low") {
      // 30% vote the same
      votes.push(i < userCount * 0.3 ? primaryValue : getRandomCardValue());
    } else if (consensusLevel === "medium") {
      // 60% vote the same
      votes.push(i < userCount * 0.6 ? primaryValue : secondaryValue);
    }
  }
  
  // Shuffle to make it more realistic
  return votes.sort(() => Math.random() - 0.5);
}