import Matter from 'matter-js';

// new PhysicsWorld({ gravity = 1 }) inside a node's code(), or
// use(PhysicsWorld) via useInstances. A thin wrapper around matter-js (a
// real 2D physics engine - gravity, collision, restitution/bounciness all
// handled for you) - this project only drives its OWN clock and reads
// body positions/angles back out; it doesn't render anything itself,
// same "just simulation, you draw it however you like" split as the rest
// of this project's own generators.
//
//   const use = useInstances(state);
//   if (!state.world) {
//     state.world = new PhysicsWorld({ gravity: 1 });
//     state.world.addPlatform({ x: width / 2, y: height * 0.7, width: width * 0.6, angle: 45, restitution: 1.1 });
//   }
//   if (t - (state.lastSpawn ?? -1) >= 1) {
//     state.world.addBall({ x: width / 2, y: 0, radius: 20 });
//     state.lastSpawn = t;
//   }
//   state.world.tick();
//   for (const body of state.world.all()) { ...draw body.x/y/angle... }
//
// All positions are in plain PIXELS (matching screenSize(), and what
// Canvas2D's own ctx calls already expect) - not the 0..1 uv space
// Warp/Ripple/Instance use elsewhere, since physics (radii, gravity feel,
// platform sizes) reads far more naturally in real screen units. Convert
// to 0..1 yourself (divide by width/height) if you're feeding positions
// into Instance/particle2d's own callback instead of drawing with
// Canvas2D directly.
//
// angle is in DEGREES (matching Rotate's own tick(src, degrees)
// convention), not matter-js's native radians.
export class PhysicsWorld {
  constructor({ gravity = 1 } = {}) {
    this.engine = Matter.Engine.create();
    this.engine.gravity.y = gravity;
    this._bodies = new Map(); // id -> { body, kind, ...shape dims for drawing }
    this._nextId = 0;
  }

  // Adds a dynamic circular body ("a ball") - falls, bounces, collides
  // with everything else in the world. Returns an id for get()/remove().
  // restitution: 0 = no bounce, 1 = bounces back at full speed (matter-js
  // uses the HIGHER of the two colliding bodies' own restitution, so a
  // "super bouncy" platform alone is enough to make any ball bounce hard
  // off it) - values above 1 work too, just increasingly gain energy
  // with each bounce instead of settling down.
  addBall({ x, y, radius = 20, restitution = 0.8, friction = 0.05, ...opts } = {}) {
    const body = Matter.Bodies.circle(x, y, radius, { restitution, friction, ...opts });
    Matter.World.add(this.engine.world, body);
    const id = this._nextId++;
    this._bodies.set(id, { body, kind: 'ball', radius });
    return id;
  }

  // Adds a static rectangular platform (doesn't move or fall, but still
  // participates in collisions) - angle in degrees, e.g. 45 for a
  // diagonal ramp.
  addPlatform({ x, y, width, height = 20, angle = 0, restitution = 0.8, ...opts } = {}) {
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      angle: (angle * Math.PI) / 180,
      restitution,
      ...opts,
    });
    Matter.World.add(this.engine.world, body);
    const id = this._nextId++;
    this._bodies.set(id, { body, kind: 'platform', width, height });
    return id;
  }

  // Manually rotates any body (static platforms included) to a new angle in
  // degrees - static bodies don't move on their own from physics forces,
  // but setting this every tick (e.g. `angle: 45 + Math.sin(t) * 20`) still
  // correctly updates its collision shape, so balls bounce off wherever it
  // currently is.
  setAngle(id, angleDegrees) {
    const entry = this._bodies.get(id);
    if (!entry) return;
    Matter.Body.setAngle(entry.body, (angleDegrees * Math.PI) / 180);
  }

  remove(id) {
    const entry = this._bodies.get(id);
    if (!entry) return;
    Matter.World.remove(this.engine.world, entry.body);
    this._bodies.delete(id);
  }

  // One body's current state - x/y in pixels, angle in degrees.
  get(id) {
    const entry = this._bodies.get(id);
    if (!entry) return null;
    return this._describe(id, entry);
  }

  // Every current body, as an array of { id, kind, x, y, angle, ...
  // radius (balls) or width/height (platforms) } - enough to draw each
  // one directly without needing to track your own separate list.
  all() {
    return [...this._bodies.keys()].map((id) => this._describe(id, this._bodies.get(id)));
  }

  _describe(id, entry) {
    const { body, kind, radius, width, height } = entry;
    return {
      id,
      kind,
      x: body.position.x,
      y: body.position.y,
      angle: (body.angle * 180) / Math.PI,
      vx: body.velocity.x,
      vy: body.velocity.y,
      radius,
      width,
      height,
    };
  }

  // Advances the simulation by dtMs (default one frame at 60fps) - call
  // once per tick. matter-js has its OWN Runner that would otherwise
  // drive this off its own requestAnimationFrame loop; calling
  // Engine.update() directly bypasses that so this project's own clock
  // stays the only thing driving time, same convention as ThreeSource/
  // HydraSource's autoLoop:false.
  tick(dtMs = 1000 / 60) {
    Matter.Engine.update(this.engine, dtMs);
  }

  dispose() {
    Matter.World.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
  }
}
