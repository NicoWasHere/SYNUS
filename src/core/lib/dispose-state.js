// disposeState(state) - frees every GPU/media resource a node's
// useInstances() calls built up (state._instances - see hooks.js), for
// when the NODE ITSELF is going away (removed/renamed in the project),
// not on an ordinary edit - state otherwise persists across edits by
// design, specifically so shader programs/canvases/fx instances DON'T
// get rebuilt just because you tweaked a line.
//
// Without this, a removed node's WebGL textures/framebuffers (and, for
// VideoSource/WebcamSource/AudioSource, still-decoding video or a live
// mic/camera stream) just become JS garbage - reclaimed whenever the
// garbage collector gets around to it, which is neither immediate nor
// guaranteed soon, and doesn't fully release GPU resources on its own at
// all. See graph.js's syncFromProject(), which calls this right before
// actually deleting a node.
//
// Each dispose() call is wrapped individually so one broken/unusual
// instance (e.g. a media source whose permission request never
// resolved) can't stop the rest of a node's resources from being freed.
export function disposeState(state) {
  if (!state || !state._instances) return;
  for (const instance of Object.values(state._instances)) {
    try {
      instance.dispose?.();
    } catch (e) {
      console.error('disposeState: failed to dispose an instance', e);
    }
  }
}

// disposeNewInstances(state, keysBefore) - frees only the useInstances()
// entries that were CREATED SINCE `keysBefore` was snapshotted (a plain
// Set of state._instances' own keys, taken before some tentative work
// happened), leaving anything that already existed at that point
// completely untouched. Used by graph.js's applyAndValidate() to clean
// up after a rolled-back trial tick: a node surviving the rollback keeps
// every instance it already had (its shader programs, canvases, etc. -
// exactly the persistence useInstances exists to provide across an
// ordinary edit), but anything the trial's (ultimately rejected) code
// freshly allocated - a brand-new use(X, ...) call that only existed in
// the code being rolled back - needs to be freed rather than silently
// leaked as unreachable GPU/media resources.
export function disposeNewInstances(state, keysBefore) {
  if (!state || !state._instances) return;
  for (const key of Object.keys(state._instances)) {
    if (keysBefore && keysBefore.has(key)) continue;
    try {
      state._instances[key].dispose?.();
    } catch (e) {
      console.error('disposeNewInstances: failed to dispose an instance', e);
    }
    delete state._instances[key];
  }
}
