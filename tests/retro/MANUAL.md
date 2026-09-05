# Retro board: manual checklist (spec §21.4)

Run before a release that touches the canvas, on a real phone and a real
tablet. Nothing here is automated: these are the gestures a headless browser
cannot fake faithfully.

Seed: a retro at `group` with six cards across two prompts, two of them
already in a cluster.

## Real touch drag

- [ ] Drag your own card with one finger: it follows the finger, nothing
      else moves, and it settles where it was dropped for a second browser.
- [ ] Drag another person's card as a participant at defaults: it does not
      move (own-card rights, spec §8.1).
- [ ] One-finger drag on empty canvas pans; it never draws a marquee.

## Pinch zoom

- [ ] Pinch out past 0.70: cards go from headline to detail
      (`data-zoom-level` on the board root follows).
- [ ] Pinch in below 0.35: cards become tinted blocks and every cluster
      chip stays the same size on screen.
- [ ] Pinch never scrolls the page behind the canvas.

## Proximity hulls on touch

- [ ] In `group`, drag a card next to another: a dashed hull appears around
      both; drag it away again and the hull dissolves.
- [ ] Hulls never appear in any other stage, and never around a card that
      is already in a cluster.

## Tap-select-then-group

- [ ] Tap two cards: both show a selection ring and the bar reads
      "2 selected". Tap one again: it leaves the selection.
- [ ] "Group 2 cards" forms a cluster; neither card moves; the chip sits
      between them.

## The bottom sheet on iOS Safari

- [ ] The sheet opens from the menu button, scrolls inside itself, and
      closes on the X and on a swipe down.
- [ ] The stage strip, the roster and the retro menu all work inside it.
- [ ] "Add card" opens the composer above the keyboard; the prompt picker
      and the text field are both reachable; posting closes it.
- [ ] The safe area at the bottom keeps the bar above the home indicator.
