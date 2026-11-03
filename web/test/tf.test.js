import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import ROSLIB from 'roslib';
import { TFTree } from '../src/tf.js';

test('late TF resolves the simulation base frame and transforms scan points', (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  context.mock.method(ROSLIB, 'Topic', function () {
    return { subscribe() {} };
  });
  const ros = new EventEmitter();
  const tree = new TFTree(ros, 'rt5/base_footprint');
  tree.addEventListener('frames', () => {
    const candidates = ['rt5/base_footprint', 'base_footprint'];
    tree.setFixedFrame(candidates.find((frame) => tree.frames().includes(frame)) || candidates[0]);
  });
  let pose;
  tree.subscribe('laser_link', (transform) => {
    pose = transform;
  });
  const transform = (parent, child, x) => ({
    header: { frame_id: parent },
    child_frame_id: child,
    transform: { translation: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  });
  tree.update([transform('base_footprint', 'laser_link', 0.1)]);
  context.mock.timers.tick(50);
  assert.equal(tree.fixedFrame, 'base_footprint');
  assert.equal(pose.translation.x, 0.1);
  tree.update([transform('rt5/base_footprint', 'laser_link', 0.2)]);
  context.mock.timers.tick(50);
  assert.equal(tree.fixedFrame, 'rt5/base_footprint');
  assert.equal(pose.translation.x, 0.2);
  ros.emit('close');
  assert.equal(tree.lookup('laser_link'), null);
});

test('/tf is only subscribed while a frame is wanted', (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const open = [];
  context.mock.method(ROSLIB, 'Topic', function ({ name }) {
    return {
      subscribe: () => open.push(name),
      unsubscribe: () => open.splice(open.indexOf(name), 1),
    };
  });
  const tree = new TFTree(new EventEmitter(), 'base_footprint');
  assert.deepEqual(open, []);
  const callback = () => {};
  tree.subscribe('laser_link', callback);
  assert.deepEqual(open, ['/tf', '/tf_static']);
  tree.subscribe('camera_link', callback);
  assert.equal(open.length, 2);
  tree.unsubscribe('laser_link', callback);
  assert.equal(open.length, 2);
  tree.unsubscribe('camera_link', callback);
  assert.deepEqual(open, []);
});
