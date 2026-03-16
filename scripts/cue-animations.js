/*
  cue-animations.js

  Role of this file:
  - Store all GSAP cue animation definitions in one place.
  - Keep cue animations separate from cue detection logic.

  How animations are triggered:
  - The cue controller detects when a cue enters or leaves its
    data-cue-start/data-cue-end window.
  - On enter: it calls a "play..." function from this file.
  - On leave: it calls "hideCueAnimation(...)"

  Where to modify animations later:
  - Edit the timeline setup inside:
    - createDefaultTimeline()
    - createSpecialTimeline()
    - createCue4Timeline()
*/

const ORANGE = "#FF9D29";
const WHITE = "#FFFFFF";

function getSplitTargets({ cueEl, SplitText }) {
  const splitInstance = SplitText ? new SplitText(cueEl, { type: "chars" }) : null;
  const characters = splitInstance?.chars?.length ? splitInstance.chars : [cueEl];
  return { splitInstance, characters };
}

function setInitialState({ gsap, characters, yOffset }) {
  gsap.set(characters, {
    opacity: 0,
    y: yOffset,
    color: ORANGE,
    willChange: "opacity, transform, color",
  });
}

// --- Default cue animation ---
// A clean character reveal that is easy to tune from Webflow data attributes.
function createDefaultTimeline({ gsap, characters, yOffset, stagger, ease }) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(characters, {
    opacity: 1,
    y: 0,
    color: WHITE,
    duration: 0.8,
    ease,
    stagger,
  });
  return timeline;
}

// --- Special cue animation ---
// Uses the same reveal, plus a subtle glow pulse on the full cue element.
function createSpecialTimeline({ gsap, cueEl, characters, yOffset, stagger, ease }) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(characters, {
    opacity: 1,
    y: 0,
    color: WHITE,
    duration: 0.9,
    ease,
    stagger,
  });
  timeline.to(
    cueEl,
    {
      textShadow: "0 0 16px rgba(255,157,41,0.35)",
      duration: 0.35,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    },
    0.1
  );
  return timeline;
}

// --- Cue 4 premium animation ---
// Prepared as a dedicated block so we can swap/extend it later (including Three.js hook-ups).
function createCue4Timeline({ gsap, cueEl, characters, yOffset, stagger, ease }) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(characters, {
    opacity: 1,
    y: 0,
    color: WHITE,
    filter: "blur(0px)",
    scale: 1,
    duration: 1.05,
    ease,
    stagger,
  });
  timeline.fromTo(
    cueEl,
    { letterSpacing: "0.02em" },
    {
      letterSpacing: "0.06em",
      duration: 0.45,
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
  const { splitInstance, characters } = getSplitTargets({ cueEl, SplitText });
  const yOffset = Number.parseFloat(cueEl.dataset.cueY) || 18;
  const stagger = Math.min(
    0.04,
    Math.max(0.02, Number.parseFloat(cueEl.dataset.cueStagger) || 0.03)
  );
  const ease = cueEl.dataset.cueEase || "power3.out";

  setInitialState({ gsap, characters, yOffset });
  if (cueType === "cue4") {
    gsap.set(characters, { filter: "blur(6px)", scale: 0.96 });
  }

  let timeline = null;
  if (cueType === "special") {
    timeline = createSpecialTimeline({
      gsap,
      cueEl,
      characters,
      yOffset,
      stagger,
      ease,
    });
  } else if (cueType === "cue4") {
    timeline = createCue4Timeline({
      gsap,
      cueEl,
      characters,
      yOffset,
      stagger,
      ease,
    });
  } else {
    timeline = createDefaultTimeline({
      gsap,
      characters,
      yOffset,
      stagger,
      ease,
    });
  }

  return {
    cueEl,
    cueType,
    splitInstance,
    characters,
    timeline,
  };
}

export function playDefaultCueAnimation(animationState) {
  animationState.timeline.play();
}

export function playSpecialCueAnimation(animationState) {
  animationState.timeline.play();
}

export function playCue4Animation(animationState) {
  animationState.timeline.play();
}

// Called when cue leaves its active window.
// This reverses the current timeline back to hidden state.
export function hideCueAnimation(animationState) {
  animationState.timeline.reverse();
}

export function destroyCueAnimation(animationState, gsap = window.gsap) {
  animationState.timeline.kill();
  gsap.set(animationState.characters, {
    clearProps: "opacity,transform,color,filter,scale,willChange",
  });
  gsap.set(animationState.cueEl, {
    clearProps: "textShadow,letterSpacing",
  });
  animationState.splitInstance?.revert();
}
