# A face-down sticky shows no size, and the reveal makes room for it

**Status:** accepted, 2026-09-24. Amends [ADR-0026](0026-the-retro-is-a-whiteboard-like-the-poker-room.md): the reveal can move stickies.

While a retro is in `write`, someone else's sticky reaches a viewer face-down, without its words, GIF or author ([ADR-0026](0026-the-retro-is-a-whiteboard-like-the-poker-room.md)). The viewer's browser can only draw it at one size, and a pad puts a new sticky under that size. When the face-down sticky holds a GIF or a long text it is taller face-up, and after the reveal it covers the top of the sticky that was put under it.

So a face-down sticky is drawn at one size whatever it holds, and its real size stays on the server until the reveal. Its author's browser, the only one that draws it face-up while writing, records how tall it is on the sticky's row, and nobody is sent it. The reveal reads it: a sticky that sat clear of a face-down sticky above it and would now be under the face-up one moves down, as close to it as it was, and takes the stickies below it along. A sticky that already overlapped a face-down one was put there on purpose, and only moves with it.

## Considered Options

- **Send a coarse size with a face-down sticky, such as whether it has a GIF or a height bucket, and draw it at that size** (rejected). ADR-0026 lets a face-down sticky carry its place, column and stack, and never its words, GIF or author. Whether it has a GIF is a fact about its GIF, and a GIF says a lot about the tone of what someone wrote, which is exactly what writing face-down keeps from anchoring everyone else. It would also fix half the problem: a long text is as tall as a GIF, and a height bucket says how much someone wrote.
- **Place a new sticky by the stored heights** (rejected). The writer would see the gap between the face-down sticky and where theirs landed, which is the height by another route.
- **Re-flow the board in a browser after the reveal** (rejected). One browser would have to write everyone's layout at a moment it can only guess, and nothing happens when it is closed.
- **Estimate each height on the server from the words and the GIF** (rejected). A GIF's height follows from its size, but where a text wraps depends on the font, the script and the sticky's styles, so the estimate would drift from what people see.

## Consequences

- Stickies move at the reveal and at no other time: down, never sideways, and no further than the sticky above needs. After the reveal everyone can see every sticky's size, so an overlap made then stays where it was put, until the retro goes back to `write` and is revealed again.
- A height is as fresh as the author's browser keeps it: recorded when the sticky is first drawn and after each change that browser sees. A sticky nobody measured, because it was revealed a moment after it was written or its author's browser was closed, counts at the face-down size, and the reveal moves nothing for it.
- The stored height is in no read at all, the author's included, so there is nothing for a new read path to forget to strip.
- A member records heights for their own stickies only, within bounds. A made-up height moves nothing a member couldn't move by hand, since anyone in the retro can move any sticky.
