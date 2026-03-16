/*
  cue-animations.js

  Role of this file:
  - Store all GSAP cue animation definitions in one place.
  - Keep cue animations separate from cue detection logic.

  How animations are triggered:
  - The cue controller detects when a cue enters or leaves its
    data-cue-start/data-cue-end window.
  - On enter: it calls a "play..." function from this file.
  - On leave: it calls "hideCueAnimation(...)".

  Where to modify animations later:
  - Edit the timeline setup inside:
    - createDefaultTimeline()
    - createSpecialTimeline()
    - createCue4Timeline()
*/

const ORANGE = "#FF9D29";
const WHITE = "#FFFFFF";

function getSplitTargets({ cueEl, SplitText }) {
  // Use words (not characters) so each cue reveal finishes sooner.
  const splitInstance = SplitText ? new SplitText(cueEl, { type: "words" }) : null;
  const words = splitInstance?.words?.length ? splitInstance.words : [cueEl];
  return { splitInstance, words };
}

function setInitialState({ gsap, words, yOffset }) {
  gsap.set(words, {
    opacity: 0,
    y: yOffset,
    color: ORANGE,
    willChange: "opacity, transform, color",
  });
}

// --- Default cue animation ---
// Tight, clean word reveal with shorter total duration.
function createDefaultTimeline({ gsap, words, stagger, ease }) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(words, {
    opacity: 1,
    y: 0,
    color: WHITE,
    duration: 0.42,
    ease,
    stagger,
  });
  return timeline;
}

// --- Special cue animation ---
// Same quick reveal, with a compact glow accent.
function createSpecialTimeline({ gsap, cueEl, words, stagger, ease }) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(words, {
    opacity: 1,
    y: 0,
    color: WHITE,
    duration: 0.48,
    ease,
    stagger,
  });
  timeline.to(
    cueEl,
    {
      textShadow: "0 0 12px rgba(255,157,41,0.28)",
      duration: 0.2,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    },
    0.05
  );
  return timeline;
}

// --- Cue 4 premium animation ---
// Distinct animation block for cue 4, kept separate for future upgrades
// (for example, triggering a Three.js overlay later).
//
// DOM reference for cue 4:
// - data-cue-id="cue-4" (preferred)
// - or data-cue-number="4"
function createCue4Timeline({ gsap, cueEl, words, stagger, ease }) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(words, {
    opacity: 1,
    y: 0,
    color: WHITE,
    filter: "blur(0px)",
    scale: 10,
    duration: 0.56,
    ease,
    stagger,
  });
  timeline.fromTo(
    cueEl,
    { letterSpacing: "0.02em" },
    {
      letterSpacing: "0.045em",
      duration: 0.22,
      ease: "sine.out",
      yoyo: true,
      repeat: 1,
    },
    0
  );
  return timeline;
}

// Creates and returns one animation state object per cue.
export function createCueAnimationState({
  cueEl,
  cueType,
  gsap = window.gsap,
  SplitText = window.SplitText,
}) {
  const { splitInstance, words } = getSplitTargets({ cueEl, SplitText });

  // yOffset controls how far words travel before settling at y: 0.
  const yOffset = Number.parseFloat(cueEl.dataset.cueY) || 14;

  // Word stagger is intentionally small so reveals stay premium but finish quickly.
  const stagger = Math.min(
    0.06,
    Math.max(0.03, Number.parseFloat(cueEl.dataset.cueStagger) || 0.045)
  );

  const ease = cueEl.dataset.cueEase || "power3.out";

  setInitialState({ gsap, words, yOffset });

  if (cueType === "cue4") {
    gsap.set(words, {
      filter: "blur(5px)",
      scale: 0.97,
      willChange: "opacity, transform, color, filter",
    });
  }

  let timeline = null;

  if (cueType === "special") {
    timeline = createSpecialTimeline({
      gsap,
      cueEl,
      words,
      stagger,
      ease,
    });
  } else if (cueType === "cue4") {
    timeline = createCue4Timeline({
      gsap,
      cueEl,
      words,
      stagger,
      ease,
    });
  } else {
    timeline = createDefaultTimeline({
      gsap,
      words,
      stagger,
      ease,
    });
  }

  return {
    cueEl,
    cueType,
    splitInstance,
    words,
    timeline,
  };
}

export function playDefaultCueAnimation(animationState) {
  // Enter animation speed.
  animationState.timeline.timeScale(1);
  animationState.timeline.play();
}

export function playSpecialCueAnimation(animationState) {
  // Enter animation speed.
  animationState.timeline.timeScale(1);
  animationState.timeline.play();
}

export function playCue4Animation(animationState) {
  // Enter animation speed.
  animationState.timeline.timeScale(1);
  animationState.timeline.play();
}

// Called when cue leaves its active window.
// Exit is intentionally faster than enter to reduce overlap.
export function hideCueAnimation(animationState) {
  animationState.timeline.timeScale(2.2);
  animationState.timeline.reverse();
}

export function destroyCueAnimation(animationState, gsap = window.gsap) {
  animationState.timeline.kill();
  gsap.set(animationState.words, {
    clearProps: "opacity,transform,color,filter,scale,willChange",
  });
  gsap.set(animationState.cueEl, {
    clearProps: "textShadow,letterSpacing",
  });
  animationState.splitInstance?.revert();
}
