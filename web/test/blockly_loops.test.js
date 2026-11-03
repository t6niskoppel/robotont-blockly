import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Blockly from 'blockly';
import '../src/blockly/blocks.js';
import { compile } from '../src/blockly/compiler.js';
import { Runner } from '../src/blockly/runtime.js';

test('Blockly while/until blocks compile with a required condition', () => {
  const workspace = new Blockly.Workspace();
  try {
    const start = workspace.newBlock('robot_start');
    const loop = workspace.newBlock('controls_whileUntil');
    start.getInput('DO').connection.connect(loop.previousConnection);
    assert.throws(() => compile(workspace), /empty socket/);
    const condition = workspace.newBlock('logic_boolean');
    condition.setFieldValue('TRUE', 'BOOL');
    loop.getInput('BOOL').connection.connect(condition.outputConnection);
    assert.deepEqual(compile(workspace).main[0].condition, { op: 'value', value: true });
    assert.equal(compile(workspace).main[0].until, false);
    loop.setFieldValue('UNTIL', 'MODE');
    assert.equal(compile(workspace).main[0].until, true);
  } finally {
    workspace.dispose();
  }
});

for (const until of [false, true]) {
  test(`${until ? 'until' : 'while'} rechecks live distances after each iteration`, async () => {
    const readings = [2, 1, 0.3];
    let iterations = 0;
    const robot = {
      distance: () => readings.shift(),
      led: () => {
        iterations++;
      },
      stop() {},
    };
    const condition = {
      op: 'compare',
      operator: until ? 'LTE' : 'GT',
      a: { op: 'distance', direction: 'front' },
      b: { op: 'number', value: 0.5 },
    };
    assert.equal(
      await new Runner(robot).run([
        {
          op: 'while',
          until,
          condition,
          body: [{ op: 'led', side: 'all', color: '#ffffff' }],
        },
      ]),
      'finished',
    );
    assert.equal(iterations, 2);
    assert.equal(readings.length, 0);
  });
}

test('Stop can interrupt an empty infinite loop', async () => {
  const runner = new Runner({ stop() {} });
  const result = runner.run([
    {
      op: 'while',
      until: false,
      condition: { op: 'boolean', value: true },
      body: [],
    },
  ]);
  const timer = setTimeout(() => runner.stop(), 10);
  try {
    assert.equal(await result, 'stopped');
    assert.equal(runner.running, false);
  } finally {
    clearTimeout(timer);
  }
});
