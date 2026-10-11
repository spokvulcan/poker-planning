"use client";

import { useQuery, type OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useAuth } from "./auth-provider";

/**
 * A read made as the viewer (their membership, their history): the one way a
 * page reads as the person looking. It opens once Convex has confirmed their
 * session in this browser, and is skipped for a visitor and while the viewer
 * loads. Until it opens it answers undefined, as a read that hasn't, so a
 * page never takes a read made before Convex knew the session for its answer.
 */
export function useCallerQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): Query["_returnType"] | undefined {
  const { viewer } = useAuth();
  const open = viewer.status === "signedIn" && viewer.confirmed;
  return useQuery(query, ...((open ? args : ["skip"]) as OptionalRestArgsOrSkip<Query>));
}
