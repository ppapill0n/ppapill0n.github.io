# Freeplay

`/play/` offers all seven shared gate games without an entry button or a required win. `/play/?game=gomoku` (or any registry ID) selects a game directly. Invalid IDs return to the chooser. Restart keeps the selected game and draws a fresh challenge. Browser Back/Forward follows the selection history.

## Shared boundaries

- `gate/registry.js` remains the source of adapters, targets, physics, artwork and worker URLs. No game is duplicated here.
- `controller.js` owns one mounted adapter, invalidates old callbacks before destruction, buffers initialization callbacks, and destroys all work when choosing again or leaving.
- `play.js` owns navigation and EN/KO shell copy. Existing game controls retain their semantics. Freeplay substitutes instructions that do not mention entering another page.
- The dial may opt into a narrower `[data-game-input-scope]`; its gate scope remains unchanged.
- `gate/common/access-guard.js` is shared with `/personal/`. It reads the existing same-tab one-hour pass and never renews it. Missing, expired, invalid or unavailable storage returns to `/gate/`. Page hiding conceals the page; focus, visibility, storage and bfcache restoration revalidate it. Page navigation and expiry destroy freeplay's mounted adapter.
- Winning, selecting, restarting and changing language never issue a pass. `/gate/` still uses its original selector, settled-win rules, explicit Enter action and pass reset.
- This is a same-tab convenience gate, not authentication for a static website.

## Verification

- `node --test tests/*.test.mjs`
- `HAPPY_DOM_MODULE=/path/to/happy-dom/lib/index.js node tests/freeplay-dom.mjs`
- `HAPPY_DOM_MODULE=/path/to/happy-dom/lib/index.js node tests/gomoku-dom.mjs`
- `node tests/selection-simulation.mjs 300000`
- `node tests/gomoku-winnability.mjs`
- With a static server and Playwright/Chromium: `SITE_URL=http://127.0.0.1:8765 node tests/freeplay-browser.cjs`

The DOM test uses real game adapters but stubs canvas drawing and worker transport. It is not layout or physical-device verification. The browser suite exercises routing, access, responsive widths and pointer controls separately.

## Gallery thumbnails

The chooser contains only a gameplay thumbnail and the localized game name per link. Its page heading remains screen-reader-only; the back arrow retains a localized accessible name. The gallery uses three desktop columns and two compact columns at 650 px and below. Image dimensions reserve a 4:3 frame; a failed image hides only the broken image, leaving the link and name usable. Below-the-fold previews load lazily.

`thumbnails/*.webp` are real screenshots captured from the deployed shared games on 2026-10-09 at commit `7b6148deca908593686cd485161aa1e659190239`, through normal browser play after earning a gate pass. They are cropped/resized and padded to 600 × 450; no generated or reconstructed game imagery is used. The seven previews total less than 50 kB. A future game-art change should refresh its screenshot and the gallery asset version together.
