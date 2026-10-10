/**
 * The action items' field holds the next item's draft. Adding it clears the
 * field for the next one while the pending item takes its place in the list;
 * if the write is refused ("That's a lot of action items"), the words come
 * back to the field rather than being lost.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider, type Node, type NodeProps } from "@xyflow/react";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { ActionsNodeData, RetroBoardActions } from "../types";
import { ActionsNode } from "./actions-node";

afterEach(cleanup);

/** An add whose write lands or is refused when the test says so. */
function heldAdd() {
  const pending: ((landed: boolean) => void)[] = [];
  const addActionItem = vi.fn((_text: string) => new Promise<boolean>((resolve) => pending.push(resolve)));
  return { addActionItem, settle: (landed: boolean) => act(async () => pending.shift()?.(landed)) };
}

function renderActions(addActionItem: RetroBoardActions["addActionItem"]) {
  const actions = new Proxy({ addActionItem } as RetroBoardActions, {
    get: (target, key: string) => (target[key as keyof RetroBoardActions] ??= vi.fn() as never),
  });
  const data: ActionsNodeData = { items: [], members: [], canManage: RESOLVED_ALLOWED, actions };
  const props = { id: "actions", data, selected: false } as unknown as NodeProps<Node<ActionsNodeData, "actions">>;
  render(
    <ReactFlowProvider>
      <ActionsNode {...props} />
    </ReactFlowProvider>
  );
  const field = screen.getByLabelText("New action item") as HTMLInputElement;
  return {
    field,
    add: (text: string) => {
      fireEvent.change(field, { target: { value: text } });
      fireEvent.keyDown(field, { key: "Enter" });
    },
  };
}

describe("ActionsNode", () => {
  it("gives a refused item's words back to the field", async () => {
    const { addActionItem, settle } = heldAdd();
    const { field, add } = renderActions(addActionItem);

    add("Timebox standups");
    expect(addActionItem).toHaveBeenCalledWith("Timebox standups");
    await settle(false);

    expect(field.value).toBe("Timebox standups");
  });

  it("leaves the field clear for the next item once one is added", async () => {
    const { addActionItem, settle } = heldAdd();
    const { field, add } = renderActions(addActionItem);

    add("Timebox standups");
    await settle(true);

    expect(field.value).toBe("");
  });
});
