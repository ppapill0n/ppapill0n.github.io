# Personal studio — isolated 3D preview

Preview route: `/personal/studio-preview/`. It is directly accessible for review and has `noindex, nofollow`; it is not access control. The homepage, current `/personal/` page, gate, games and their existing links/guards are unchanged.

## Behavior

The initial layout is empty. The real WebGL room includes a timber plank floor, a pitched roof with exposed beams, cream walls and green trim, a left courtyard opening and window seat, an arched far window, a recessed shelf niche, a closed panel door and warm sconces. The room continues behind the camera; it is not a panorama or a cutout.

The camera position stays at `[0, 1.6, 2.7]`. Mouse/touch drag rotates viewing direction with full yaw and bounded pitch. It never orbits or walks. Arrow keys work while the canvas is focused, and Home / 처음 시점 restores the initial direction. A drag that returns to its origin still cannot activate navigation. Multi-touch and canceled gestures do not click.

공간 편집 adds up to six plant/book/game groups to predetermined floor positions. Each has a name and one of three existing site destinations. Clicking geometry uses ray picking with architecture occlusion; visible name links and the editor list provide keyboard alternatives. The footer also contains native fallback links usable without WebGL or JavaScript. Existing personal/game destinations retain their normal gate behavior.

The editor stores only its versioned layout in localStorage key `personal-studio-preview:v1`. It is local to one browser/origin, not global publishing or secure administration. Unsupported, malformed, unavailable or full storage does not prevent in-memory editing. Reset requires an explicit second action and touches only the preview key. Labels are text, and destinations are an allowlist rather than arbitrary URLs.

## Implementation and limits

- Static HTML/CSS/ES modules, no build pipeline, backend, CDN or runtime network dependency. Three.js 0.180.0 is pinned and vendored with its MIT license; see the central third-party notice.
- Procedural geometry/materials and deterministic canvas wood grain. Lighting is stylized, without physically accurate global illumination or photorealistic assets.
- Rendering happens on view/layout/visibility changes, not a continuous animation loop. Floor boards are instanced, pixel ratio is capped at 1.5, only one light casts shadows, and removed object geometry is disposed.
- WebGL 2 is required for the room. Initialization/context loss falls back to readable navigation. Device-specific GPU performance and physical Android/iOS behavior remain unverified; mobile tests use Chromium touch emulation.
- Object positions, shape choices and destinations are deliberately limited for this prototype. There is no arbitrary object upload, move/rotate gizmo, synchronized editing or admin account.
- `?inspect` enables explicit QA diagnostics for fixed camera coordinates, direction, object count, GPU geometry count and picking. Normal loads do not expose these diagnostics.

## Reference provenance

The original concept is Library `libfile_37cb302f7d948191aad24dc04ca87540`, `empty-courtyard-studio-concept.png`. Its supported transfer and one bounded retry failed in this executor. The parent inspected the pixels and explicitly authorized substituting its verified visual specification: warm empty attic/studio, honey wood floor, cream plaster, forest-green trim, gable beams, left glazed garden opening/window seat, far arched window and recessed niche, right panel door, amber sconces. No additional transfer retry or restriction bypass was used. Final original-image comparison is delegated to the parent using the review screenshots.

## Verification

```sh
node --test tests/*.test.mjs
python3 -m http.server 8765 --bind 127.0.0.1
# Separate terminal, Playwright + Chromium installed:
node tests/studio-controls-browser.cjs
node tests/studio-preview-browser.cjs
node tests/freeplay-browser.cjs
node tests/academic-browser.cjs
```

The studio browser suite covers actual WebGL rendering, fixed camera position through mouse/touch/keyboard rotation, a full rear view, real geometry picking, drag/click separation, navigation and Back, refresh persistence, repeated add/delete/reset/cancel, geometry cleanup, safe text labels, mobile portrait/landscape layouts, keyboard dialog behavior, storage failures, corrupt data, no JavaScript, no WebGL and context-loss fallback. The existing freeplay suite verifies eight game routes, their guards and session expiry.

Review screenshots are included under `review/` as explicit deliverables and are not loaded by the application. Library upload was attempted through the required batch helper but failed at tool discovery with a network error; no Library file IDs were created or claimed. The served screenshot paths provide the alternative delivery route.
