# Third-party notices

This is the central index for third-party components deliberately incorporated into this site. Complete notices live alongside each component; keep both the index and the component notice when updating or replacing it.

| Component | Use | Pinned source | License and complete notice |
| --- | --- | --- | --- |
| HTML5-Gomoku by Yao Yujian | Adapted incremental five-cell-window evaluator for the Gomoku gate's bounded AI | [yyjhao/HTML5-Gomoku, a664ec1e7788c7cbdfbe223fb86f34162f9e006d](https://github.com/yyjhao/HTML5-Gomoku/tree/a664ec1e7788c7cbdfbe223fb86f34162f9e006d), `js/ai-worker.js` | MIT; [complete copyright and license](gate/games/gomoku/vendor/LICENSE.txt). The same complete notice is retained in the shipped derivative [evaluator.js](gate/games/gomoku/vendor/evaluator.js). |

The upstream user interface, jQuery, and jQuery Mobile are not distributed. The evaluator has no third-party runtime imports. Our adapter, rules, UI, and bounded move chooser are separate from the adapted code. [Adaptation and replacement notes](gate/games/gomoku/README.md).

## Checked existing resources

The game refactor preserves the existing `gate/assets/character-reference.png` and the existing inline SVG symbols, including panda artwork, without adding outside artwork. Their earlier provenance was not independently audited as part of the Gomoku engine integration. The inspected game and academic styles use system fonts; no font package was introduced. This index is not a claim of a comprehensive historical asset or repository license audit.
