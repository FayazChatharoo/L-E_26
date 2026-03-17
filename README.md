# L-E_26

## Hero Structure (Webflow)

Use this DOM structure for the pinned hero orchestration.

### Root
- `data-hero-sequence` on the main hero wrapper

### Stages
- `data-hero-stage="video"` for stage 1 content
- `data-hero-stage="dissolve"` for stage 2 content
- `data-hero-stage="tunnel"` for stage 3 content

### Video
- `data-hero-video` on the `<video>` element used by stage 1 scrub

### Canvas Mount (single Three.js canvas)
- `data-hero-canvas="dissolve"` on one container element
- This container is the only mount for Three.js renderer canvas
- No second canvas is required for tunnel stage

### Overlay
- `data-hero-overlay="black"` for transition blend layer

### Cues
- `data-hero-cue` on cue elements
- `data-cue-start="0..1"` and `data-cue-end="0..1"` per stage-local timing
- Optional: `data-cue-stage="video|dissolve|tunnel"` and `data-cue-id`
