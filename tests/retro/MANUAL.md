# Retro board: manual checklist

Run before a release that touches the retro canvas, on a real phone, a real
tablet and a desktop browser at the same time. These are the gestures and
third-party flows `retro-board.spec.ts` does not cover.

Setup: start a retro at `/retro/new` on the desktop, join it from the phone and
the tablet through its link, and write two stickies from each device in
different columns.

## Touch (phone and tablet)

- [ ] One-finger drag on the empty board pans, pinch zooms, and the page behind
      the board never scrolls.
- [ ] Tapping a pad opens a new sticky under that column with the keyboard up;
      the check button sticks it, and the desktop sees it face-down.
- [ ] Double-tapping the empty board opens a sticky there, as the board's
      empty-state hint promises for a double-click.
- [ ] Dragging your own sticky with one finger moves only that sticky, and it
      lands in the same place on the desktop.
- [ ] Tapping a sticky shows its tools (edit, delete, "Discuss this now"); the
      Vote button and a stack's count respond to a tap.
- [ ] In Vote, the budget's last vote disables Vote on the other topics, and
      tapping a voted topic again gives the vote back.

## Drag to stack (desktop, then touch)

- [ ] In Write, dropping your sticky on another of yours shows "Drop to stack"
      and stacks them; dropping it on someone else's face-down sticky only moves it.
- [ ] After the reveal, dropping a sticky on someone else's stacks them; the
      other devices show one sticky with a count, where the target was.
- [ ] Dropping a stack's top on another sticky brings the whole stack along.
- [ ] Opening a stack by its count and choosing "Take off the stack" puts that
      sticky back beside the stack.
- [ ] Two people vote for two loose stickies, one is stacked onto the other,
      and in Discuss the stack shows both votes.
- [ ] A marquee selection of two stickies (desktop: drag on the empty board)
      moves both together and never stacks.
- [ ] On touch, dragging a sticky onto another stacks it the same way.

## GIFs

- [ ] With `GIPHY_API_KEY` set: the GIF button opens trending GIFs and "Powered
      by GIPHY"; typing searches after a pause, a suggestion chip searches, and
      "More" loads the next page.
- [ ] A picked GIF appears in the editor with the text field focused; Enter
      sticks it with or without a caption. Others see it face-down in Write and
      animated after the reveal.
- [ ] Without the key (unset it and restart `npm run dev`): the picker opens on
      "Paste a link". A `https://giphy.com/gifs/…` page link and an
      `https://i.imgur.com/….gif` link are accepted; a `https://tenor.com/view/…`
      page link and any `http://` link are refused with "Paste a GIPHY, Tenor or
      Imgur link (https)."
- [ ] While editing, the remove button on a GIF takes it off the sticky, and
      the GIF button adds one to a sticky that had only words.
- [ ] On the phone, the picker fits the screen and scrolls inside itself.
- [ ] `/api/gifs` in a private window with no session answers 401.
