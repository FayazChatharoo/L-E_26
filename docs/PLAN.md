## Hero Sequence Orchestration v2 (Storyboard-Aligned)

### Summary
Keep one pinned hero and one master `ScrollTrigger` over `~5000px` scroll distance.  
Master progress (`0..1`) is partitioned into `video (0.00-0.60)`, `dissolve (0.60-0.80)`, `tunnel (0.80-1.00)`, with a controlled black-overlay transition around the video-to-3D handoff.

### Implementation Changes
- **Single orchestrator ownership**
  - `hero-orchestrator.js` owns: pinning, master progress, stage mapping, visibility classes, transition overlay, resize, destroy.
  - Scenes remain isolated and scroll-agnostic, each exposing: `init()`, `update(p)`, `resize()`, `destroy()`.

- **Progress map and transition windows (default)**
  - Total scroll: `5000px`.
  - Stage 1 Video: `0.00-0.60` (`0-3000px`).
  - Stage 2 Dissolve: `0.60-0.80` (`3000-4000px`).
  - Stage 3 Tunnel: `0.80-1.00` (`4000-5000px`).
  - Fade-to-black window: `0.56-0.62` (crosses stage boundary for seamless switch).
  - Dissolve warm-start window: initialize renderer/model at `p >= 0.54` (lazy but ready before reveal).
  - Tunnel warm-start window: initialize at `p >= 0.76`.

- **Stage 1 video + cue system**
  - `hero-video.js` maps local progress to `video.currentTime` (independent from physical 15s duration).
  - Cue source: DOM `data-*` attributes; orchestrator passes local video progress.
  - Cue schema:
    - Cue container: `[data-hero-cue]`
    - Time window: `data-cue-start`, `data-cue-end` in `0..1` relative to video stage.
    - Optional: `data-cue-id`, `data-cue-once="true"`.
  - Module emits/toggles state classes only (`is-active`, `is-past`) so existing Webflow/GSAP/SplitText animations can hook without extra ScrollTriggers.

- **Stage 2 dissolve**
  - `hero-dissolve.js` updates dissolve uniform by local progress.
  - During `0.60-0.80`, overlay fades out early then dissolve becomes primary visual.
  - Dissolve text (“It’s about what your customer needs to feel.”) controlled via stage-local cue window (same cue mechanism, stage namespace).

- **Stage 3 tunnel**
  - `hero-tunnel.js` maps local progress to tunnel travel/material motion.
  - Tunnel text (“Turns followers into buying fans.”) uses stage-local cue window and class toggles.

- **DOM hooks**
  - Root: `[data-hero-sequence]`
  - Stage mounts: `[data-hero-stage="video|dissolve|tunnel"]`
  - Video element: `[data-hero-video]`
  - Black overlay: `[data-hero-overlay="black"]`
  - WebGL mounts: `[data-hero-canvas="dissolve|tunnel"]`

### Module/File Structure
- `scripts/app.js`
- `scripts/utils.js`
- `scripts/hero/hero-orchestrator.js`
- `scripts/hero/hero-video.js`
- `scripts/hero/hero-dissolve.js`
- `scripts/hero/hero-tunnel.js`

### Step-by-Step Build Plan (progressive)
1. Implement `hero-video.js` first:
   - video readiness/preload guards, progress-to-time mapping, cue parsing/toggling, cleanup.
2. Implement `hero-orchestrator.js`:
   - single pinned `ScrollTrigger`, progress partitioning, black overlay animation, lazy init thresholds, central lifecycle.
3. Wire `app.js` home-page init (`data-page="home"`).
4. Add dissolve/tunnel modules with shared scene contract and no internal scroll logic.
5. Integrate stage texts via cue windows; connect to existing SplitText/Webflow animations via class/state changes.
6. Validate performance and coexistence with Webflow interactions; finalize destroy/re-init safety.

### Test Plan
- Progress boundary checks: `0`, `0.56`, `0.60`, `0.62`, `0.80`, `1.0`.
- Video behavior:
  - metadata-ready guard, no invalid `currentTime` writes, smooth scrub.
- Transition behavior:
  - black overlay fully covers swap period, no flash/frame pop.
- Lifecycle:
  - no duplicate ScrollTriggers, clean destroy/re-init, resize correctness.
- Coexistence:
  - existing Webflow GSAP animations still run; no duplicate GSAP imports.

### Assumptions / Defaults
- Keep `60/20/20` split from storyboard.
- Fade window default `0.56-0.62` unless art direction requests different pacing.
- Cue timings are normalized per-stage (`0..1`) in HTML data attributes.
- Hero scroll distance target is fixed at `~5000px`, independent of video duration.
