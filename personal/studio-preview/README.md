# Studio preview groundwork — visual implementation blocked

This directory is reserved for an isolated `/personal/studio-preview/` prototype. It does **not** yet contain a page or a room renderer and must not be described as a completed preview. Existing homepage, `/personal/`, access guard, games and navigation are unchanged.

The required reference is Library `libfile_37cb302f7d948191aad24dc04ca87540`, `empty-courtyard-studio-concept.png` (1536 × 1024). On 2026-10-28 Library resolved the authorized file and returned a signed transfer, but the current Library transfer helper failed with `library file transfer failed: download failed`. One bounded retry with a second destination in this executor failed identically. Neither attempt produced readable image bytes. The underlying HTTP/network reason was not exposed by the helper. This is a failed transfer, not a denied approval or an uncertain write. Visual implementation is explicitly contingent on inspecting the actual reference pixels.

## Independent work completed

- `view-controls.js`: pointer and touch look-direction input with a fixed-position camera contract; full horizontal rotation, bounded pitch, drag threshold, click/drag separation even when dragging back to the starting point, multi-touch/cancel suppression, scoped arrow keys and Home, and explicit cleanup. The future renderer must apply the emitted direction to its own fixed camera position. This module contains no orbit or walking controls.
- `object-store.js`: empty initial layout; at most six optional groups; validated destinations to existing site routes; repeated add/delete/reset; versioned local persistence with in-memory operation if storage is blocked or full. Reset affects only the prototype key. The future interface must confirm reset and label editing as local to this browser, neither global publishing nor secure administration.
- Tests for the state and direction math, plus actual Chromium pointer/touch event tests using a minimal input fixture. These do not test a room, picking geometry, mobile layout, navigation, rendering performance or Android hardware.

## Resume after reference access is restored

1. Make the exact required reference readable in this executor through a supported Library route and inspect its pixels before creating the room.
2. Add the static page, warm wood/green materials, pitched beams, arched window or recesses, left garden opening, and a mostly empty room. Use actual 3D geometry and keep the camera position fixed.
3. Connect optional object groups to ray picking and accessible fallback links; implement add/delete, confirmed reset, persistence status and mobile layout. Preserve existing access semantics at existing destinations.
4. Test the rendered scene, mouse/touch look, picking, repeated edits/reset, persistence failures, keyboard alternatives, browser Back, narrow layouts, fallback behavior, and repository checks. Capture desktop/mobile screenshots for review and save approved deliverables to Library.
5. Publishing the scoped test route is now authorized, but only after implementation and tests pass. Push and verify the exact remote commit and Pages deployment; return the public URL and disclose live-browser limits. Do not replace the homepage or current `/personal/` destination.

## Checks

```sh
node --test tests/*.test.mjs
python3 -m http.server 8765 --bind 127.0.0.1
# In another terminal, with Playwright available:
node tests/studio-controls-browser.cjs
```

The server is for local verification only; it is not a user-accessible preview or a deployment.
