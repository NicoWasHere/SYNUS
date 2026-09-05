import * as THREE from 'three';

// position3d(target, {x, y, z}) / scale3d(target, {x, y, z} | number) - a
// one-liner for `target.position.set(x, y, z)` / `.scale.set(...)`,
// exactly the kind of thing every three.js template in this project used
// to write out by hand. `target` accepts anything with its own
// .position/.scale (a raw THREE.Object3D - a mesh, a camera, a light -
// or one of this file's shape wrappers below, read via its own .mesh) so
// these work both internally (every shape's own tick() below calls them)
// and directly from hand-written node code. Returns `target` unchanged so
// a call can sit inline (`position3d(mesh, opts.position)`) without
// needing its own statement.
export function position3d(target, { x = 0, y = 0, z = 0 } = {}) {
  const obj = target.mesh || target;
  obj.position.set(x, y, z);
  return target;
}

export function scale3d(target, scale) {
  const obj = target.mesh || target;
  if (typeof scale === 'number') {
    obj.scale.set(scale, scale, scale);
  } else {
    const { x = 1, y = 1, z = 1 } = scale || {};
    obj.scale.set(x, y, z);
  }
  return target;
}

// Shared by every shape class below - use(Sphere)/use(Box)/etc. (see
// use-instances.js) construct these with NO arguments (unlike ThreeSource,
// which needs width/height up front): a shape's own size/color/position
// are all things you want to keep editing after first Send, so they live
// in tick(opts) instead of the constructor, the same "build once, update
// every call" split every 2D effect class (Rotate, Scale, ...) already
// follows. tick() only rebuilds the actual THREE.BufferGeometry when a
// size-affecting option changes (geometryKey below) - everything else
// (color/wireframe/map/position/rotation/scale) just mutates the existing
// mesh in place, so animating them every tick (as t changes) is cheap.
class Shape3D {
  constructor() {
    this.mesh = null;
    this._geometryKey = null;
  }

  // geometryKey(opts): a plain string summarizing just the size-affecting
  // options, so tick() can tell "did anything that actually requires a
  // new geometry change" apart from "just the color/position changed
  // again this frame" (the common case, checked every single tick).
  // buildGeometry(opts): a fresh THREE.*Geometry for this shape.
  // Both implemented per-subclass below.

  _ensureGeometry(opts) {
    const key = this.geometryKey(opts);
    if (this.mesh && this._geometryKey === key) return;
    const geometry = this.buildGeometry(opts);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    } else {
      this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    }
    this._geometryKey = key;
  }

  // tick(opts) - opts:
  //   color      - any THREE.Color-accepted value (hex number, css
  //                string, ...). Default a neutral blue (0x4488ff).
  //   wireframe  - boolean. Default false.
  //   map        - a THREE.Texture (e.g. from a Scene3D's .toTexture()) to
  //                use as this mesh's material map. Default none.
  //   position   - {x, y, z}, world-space. Default 0,0,0 (unset lets a
  //                node keep manual control by never mentioning it).
  //   rotation   - {x, y, z}, radians.
  //   scale      - number or {x, y, z}.
  // Returns `this` - pass shapes straight into Scene3D.tick([...]), or
  // read shape.mesh directly for anything not covered here.
  tick(opts = {}) {
    this._ensureGeometry(opts);
    const { color = 0x4488ff, wireframe = false, map = null, position, rotation, scale } = opts;
    this.mesh.material.color.set(color);
    this.mesh.material.wireframe = wireframe;
    this.mesh.material.map = map || null;
    this.mesh.material.needsUpdate = true;
    if (position) position3d(this, position);
    if (rotation) {
      const { x = 0, y = 0, z = 0 } = rotation;
      this.mesh.rotation.set(x, y, z);
    }
    if (scale != null) scale3d(this, scale);
    return this;
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// use(Sphere).tick({ radius: 0.8, widthSegments: 32, heightSegments: 32, ...})
export class Sphere extends Shape3D {
  geometryKey({ radius = 0.8, widthSegments = 32, heightSegments = 32 } = {}) {
    return `${radius}|${widthSegments}|${heightSegments}`;
  }
  buildGeometry({ radius = 0.8, widthSegments = 32, heightSegments = 32 } = {}) {
    return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  }
}

// use(Box).tick({ size: 1 }) or { width, height, depth } independently
export class Box extends Shape3D {
  geometryKey({ size = 1, width, height, depth } = {}) {
    return `${width ?? size}|${height ?? size}|${depth ?? size}`;
  }
  buildGeometry({ size = 1, width, height, depth } = {}) {
    return new THREE.BoxGeometry(width ?? size, height ?? size, depth ?? size);
  }
}

// use(Torus).tick({ radius: 0.7, tube: 0.25, radialSegments: 16, tubularSegments: 48 })
export class Torus extends Shape3D {
  geometryKey({ radius = 0.7, tube = 0.25, radialSegments = 16, tubularSegments = 48 } = {}) {
    return `${radius}|${tube}|${radialSegments}|${tubularSegments}`;
  }
  buildGeometry({ radius = 0.7, tube = 0.25, radialSegments = 16, tubularSegments = 48 } = {}) {
    return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
  }
}

// use(Plane).tick({ width: 1.6, height: 1 }) - side: DoubleSide by
// default (unlike the other shapes here) since a flat plane is the one
// primitive where "invisible from the back" is the more surprising
// default, matching the old three_rect template's own behavior.
export class Plane extends Shape3D {
  geometryKey({ width = 1.6, height = 1 } = {}) {
    return `${width}|${height}`;
  }
  buildGeometry({ width = 1.6, height = 1 } = {}) {
    return new THREE.PlaneGeometry(width, height);
  }
  tick(opts = {}) {
    super.tick(opts);
    this.mesh.material.side = THREE.DoubleSide;
    return this;
  }
}

// use(Cylinder).tick({ radiusTop: 0.6, radiusBottom: 0.6, height: 1.2, radialSegments: 32 })
export class Cylinder extends Shape3D {
  geometryKey({ radiusTop = 0.6, radiusBottom = 0.6, height = 1.2, radialSegments = 32 } = {}) {
    return `${radiusTop}|${radiusBottom}|${height}|${radialSegments}`;
  }
  buildGeometry({ radiusTop = 0.6, radiusBottom = 0.6, height = 1.2, radialSegments = 32 } = {}) {
    return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
  }
}
