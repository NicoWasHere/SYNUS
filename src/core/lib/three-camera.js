// orbitCamera(camera, opts) - positions a real THREE.Camera on a sphere
// around `target` and points it there, using nothing but the camera's
// own ordinary position/lookAt API (the same two calls any hand-written
// three.js scene would use) - this is just the spherical-coordinates
// trig spelled out once instead of every project re-deriving it. Meant
// to be called every tick with a changing azimuth/elevation (e.g.
// azimuth: t * 0.3) to orbit around a mesh - see the `three`/`three_text`
// node templates, which do exactly that by default.
export function orbitCamera(camera, { azimuth = 0, elevation = 0, radius = 3, target = [0, 0, 0] } = {}) {
  const [tx, ty, tz] = target;
  camera.position.set(
    tx + radius * Math.cos(elevation) * Math.sin(azimuth),
    ty + radius * Math.sin(elevation),
    tz + radius * Math.cos(elevation) * Math.cos(azimuth)
  );
  camera.lookAt(tx, ty, tz);
}
