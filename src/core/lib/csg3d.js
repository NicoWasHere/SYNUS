import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';

// use(CSG) - real boolean ops (subtract/union/intersect) between two
// shapes (use(Sphere)/use(Box)/etc, or a raw THREE.Mesh) via
// three-bvh-csg. The two inputs' meshes go in, a new mesh-shaped thing
// comes out - same "simple stateful object" shape as shape3d.js's own
// classes, so a CSG result can be fed straight into Scene3D.tick([...])
// or right back into ANOTHER .subtract()/.union() call to chain more
// than one cut:
//
//   const csg = use(CSG);
//   const box = use(Box);
//   const hole = use(Sphere);
//   box.tick({ size: 1.2 });
//   hole.tick({ radius: 0.7, position: { x: 0.5 } });
//   const cut = csg.subtract(box, hole);
//   let out = three.tick([cut]);
//
// toBrush() copies the source mesh's CURRENT transform (position/
// rotation/scale) onto the Brush before evaluating, so animating a
// shape's position/rotation every tick and re-running subtract()/etc
// every tick (this isn't cached - a boolean op has to be redone whenever
// either input actually moves) reflects that movement in the result.
function toBrush(target) {
  const mesh = target.mesh || target;
  const brush = new Brush(mesh.geometry, mesh.material);
  brush.position.copy(mesh.position);
  brush.rotation.copy(mesh.rotation);
  brush.scale.copy(mesh.scale);
  brush.updateMatrixWorld();
  return brush;
}

export class CSG {
  constructor() {
    this.evaluator = new Evaluator();
    this.mesh = null;
  }

  _op(operation, a, b) {
    // Free the PREVIOUS call's result geometry before building a new one
    // - this runs fresh every tick (it has to - the inputs can move), so
    // without this each tick would leak one more orphaned BufferGeometry.
    if (this.mesh) this.mesh.geometry.dispose();
    this.mesh = this.evaluator.evaluate(toBrush(a), toBrush(b), operation);
    return this;
  }

  subtract(a, b) {
    return this._op(SUBTRACTION, a, b);
  }
  union(a, b) {
    return this._op(ADDITION, a, b);
  }
  intersect(a, b) {
    return this._op(INTERSECTION, a, b);
  }

  dispose() {
    if (this.mesh) this.mesh.geometry.dispose();
  }
}
