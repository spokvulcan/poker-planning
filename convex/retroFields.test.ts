import { describe, it, expect } from "vitest";
import { edited, ownedBy } from "./retroFields";

// The optional-field rules the model and the board's optimistic updates
// share, so a sticky's GIF and an action item's owner come out the same on
// both sides.

describe("edited", () => {
  it("keeps a field the edit leaves out, takes it off for null, and else sets it", () => {
    expect(edited("cat.gif", undefined)).toBe("cat.gif");
    expect(edited("cat.gif", null)).toBeUndefined();
    expect(edited("cat.gif", "dog.gif")).toBe("dog.gif");
    expect(edited(undefined, "dog.gif")).toBe("dog.gif");
  });
});

describe("ownedBy", () => {
  it("names an owner, keeps one with no name to give by id alone, and gives an unowned item neither", () => {
    const names = new Map([["ann", "Ann"]]);
    const nameOf = (id: string) => names.get(id);

    expect(ownedBy("ann", nameOf)).toEqual({ ownerId: "ann", ownerName: "Ann" });
    expect(ownedBy("bob", nameOf)).toEqual({ ownerId: "bob" });
    expect(ownedBy(undefined, nameOf)).toEqual({});
  });
});
