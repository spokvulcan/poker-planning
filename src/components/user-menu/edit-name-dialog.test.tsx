/**
 * EditNameDialog — a person's name is checked by the person-name rule the
 * server keeps it by: the field stops at the rule's limit, a blank name is
 * refused inline in the rule's words, and what's saved is the name as the
 * rule keeps it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { EditNameDialog } from "./edit-name-dialog";

function renderDialog(onSave = vi.fn(() => Promise.resolve())) {
  render(<EditNameDialog currentName="Ann" onSave={onSave} open={true} onOpenChange={() => {}} />);
  const field = screen.getByPlaceholderText("Enter your name") as HTMLInputElement;
  return {
    onSave,
    field,
    save: async (name: string) => {
      fireEvent.change(field, { target: { value: name } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
      });
    },
  };
}

afterEach(cleanup);

describe("EditNameDialog — the person-name rule", () => {
  it("stops typing at the person name's limit", () => {
    const { field } = renderDialog();

    expect(field.maxLength).toBe(50);
  });

  it("refuses a blank name inline, in the rule's words, and saves nothing", async () => {
    const { onSave, save } = renderDialog();

    await save("   ");

    expect(screen.getByText("Name is required")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the name without the spaces around it", async () => {
    const { onSave, save } = renderDialog();

    await save("  Ada Lovelace  ");

    expect(onSave).toHaveBeenCalledWith("Ada Lovelace");
  });
});
