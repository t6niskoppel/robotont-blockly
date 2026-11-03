// Minimal TF client for ros3d: follows /tf and /tf_static through rosbridge and answers
// subscribe(frame, callback) with that frame's pose in the fixed frame (what ROS3D.SceneNode and the
// laser/point-cloud displays expect from a TFClient).
import ROSLIB from 'roslib';

const multiply = (a, b) => ({
  // pose a * pose b; poses are {t:[x,y,z], q:[x,y,z,w]}
  t: rotate(a.q, b.t).map((v, i) => v + a.t[i]),
  q: quatMultiply(a.q, b.q),
});
function quatMultiply([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
function rotate(q, [x, y, z]) {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
}
const invert = ({ t, q }) => {
  const inv = [-q[0], -q[1], -q[2], q[3]];
  return { t: rotate(inv, t).map((v) => -v), q: inv };
};

export class TFTree extends EventTarget {
  constructor(ros, fixedFrame) {
    super();
    this.fixedFrame = fixedFrame;
    this.links = new Map(); // child -> {parent, pose}
    this.callbacks = new Map(); // frame -> Set(callback)
    this.dirty = false;
    this.ros = ros;
    this.topics = [];
    ros.on('close', () => {
      this.links.clear();
      this.topics = []; // the connection is gone; the next subscriber opens new ones
    });
    this.timer = setInterval(() => {
      if (this.dirty) {
        this.dirty = false;
        this.publish();
      }
    }, 50);
  }
  update(transforms) {
    for (const { header, child_frame_id: child, transform: tr } of transforms) {
      const strip = (name) => name.replace(/^\//, '');
      this.links.set(strip(child), {
        parent: strip(header.frame_id),
        pose: {
          t: [tr.translation.x, tr.translation.y, tr.translation.z],
          q: [tr.rotation.x, tr.rotation.y, tr.rotation.z, tr.rotation.w],
        },
      });
    }
    this.dispatchEvent(new Event('frames'));
    this.dirty = true;
  }
  toRoot(frame) {
    // pose of `frame` in its tree's root, or null if the chain is broken
    let pose = { t: [0, 0, 0], q: [0, 0, 0, 1] },
      current = frame.replace(/^\//, ''),
      depth = 0;
    while (this.links.has(current) && depth++ < 64) {
      const link = this.links.get(current);
      pose = multiply(link.pose, pose);
      current = link.parent;
    }
    return { root: current, pose };
  }
  lookup(frame) {
    const a = this.toRoot(this.fixedFrame),
      b = this.toRoot(frame);
    if (a.root !== b.root) return null;
    return multiply(invert(a.pose), b.pose);
  }
  setFixedFrame(frame) {
    if (frame === this.fixedFrame) return;
    this.fixedFrame = frame;
    this.dirty = true;
  }
  frames() {
    return [
      ...new Set([...this.links.keys(), ...[...this.links.values()].map((link) => link.parent)]),
    ];
  }
  // /tf is one of the busiest topics, so it is only listened to while something wants a frame.
  listen() {
    if (this.topics.length) return;
    for (const name of ['/tf', '/tf_static']) {
      const topic = new ROSLIB.Topic({
        ros: this.ros,
        name,
        messageType: 'tf2_msgs/msg/TFMessage',
      });
      topic.subscribe((message) => this.update(message.transforms));
      this.topics.push(topic);
    }
  }
  subscribe(frame, callback) {
    if (!this.callbacks.has(frame)) this.callbacks.set(frame, new Set());
    this.callbacks.get(frame).add(callback);
    this.dirty = true;
    this.listen();
  }
  unsubscribe(frame, callback) {
    this.callbacks.get(frame)?.delete(callback);
    if ([...this.callbacks.values()].some((set) => set.size)) return;
    for (const topic of this.topics) topic.unsubscribe?.();
    this.topics = [];
    this.links.clear();
  }
  publish() {
    for (const [frame, callbacks] of this.callbacks) {
      const pose = this.lookup(frame);
      if (!pose) continue;
      const message = {
        translation: { x: pose.t[0], y: pose.t[1], z: pose.t[2] },
        rotation: { x: pose.q[0], y: pose.q[1], z: pose.q[2], w: pose.q[3] },
      };
      for (const callback of callbacks) callback(message);
    }
  }
}
