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
- `data-hero-canvas-root` on a persistent container under `data-hero-sequence`
- This element is the only mount for the shared Three.js renderer canvas
- Do not mount shared canvas inside a stage element (`video/dissolve/tunnel`)

### Overlay
- `data-hero-overlay="black"` for transition blend layer

### Cues
- `data-hero-cue` on cue elements
- `data-cue-start="0..1"` and `data-cue-end="0..1"` per stage-local timing
- Optional: `data-cue-stage="video|dissolve|tunnel"` and `data-cue-id`

## WebGPU Loading (Webflow + Netlify, no bundler)

Add this in Webflow `</head>` custom code:

```html
<script async src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.webgpu.js",
    "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.tsl.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
```

Add this in Webflow `</body>` custom code:

```html
<script type="module" src="https://<netlify-site>/scripts/app.js"></script>
```

The app boot flow now:
- tries WebGPU preflight first
- falls back to WebGL on init/dependency/device errors
- commits exactly one backend per session

## WebGPU Smoke POC

To validate WebGPU boot on an isolated page:
- add a canvas with `data-webgpu-poc-canvas`
- load the same `scripts/app.js`

Expected console:
- success: `[Hero][RenderBackend] webgpu`
- unsupported/failure: `[Hero][RenderBackend] webgpu-unavailable`
