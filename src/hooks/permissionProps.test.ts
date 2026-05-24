import { describe, it, expect } from "vitest";
import { permissionProps } from "./usePermissions";
import { RESOLVED_ALLOWED } from "@/convex/permissions";

describe("permissionProps — allowed", () => {
  it("returns an empty overlay so the control keeps its own state and label", () => {
    expect(permissionProps(RESOLVED_ALLOWED)).toEqual({});
  });

  it("does not emit disabled:false (would re-enable a cooldown/no-votes control)", () => {
    expect(permissionProps(RESOLVED_ALLOWED)).not.toHaveProperty("disabled");
  });
});

describe("permissionProps — denied", () => {
  const message = "Only facilitators and the owner can do this.";

  it("disables and labels the control with the denial message", () => {
    expect(permissionProps({ allowed: false, message })).toEqual({
      disabled: true,
      title: message,
      "aria-label": message,
    });
  });

  it("uses the same message for title and aria-label", () => {
    const overlay = permissionProps({ allowed: false, message });
    expect(overlay).toHaveProperty("title", message);
    expect(overlay).toHaveProperty("aria-label", message);
  });
});
