import assert from 'node:assert/strict';
import { test } from 'node:test';

// The colour field builds swatch elements when it is created; these tests run without a browser.
globalThis.HTMLElement ??= class {};
globalThis.document ??= {
  createElement: () => Object.assign(new HTMLElement(), { style: {}, classList: { add() {} } }),
};
import { Blockly, startupProgram, STEP_SPEED } from '../src/blockly/blocks.js';
import { compile } from '../src/blockly/compiler.js';
import { Runner } from '../src/blockly/runtime.js';

const start = (body, extra = {}) => ({
  ...extra,
  blocks: {
    languageVersion: 0,
    blocks: [{ type: 'robot_start', inputs: { DO: { block: body } } }, ...(extra.more || [])],
  },
});
const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const withWorkspace = (data, check) => {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(data, workspace);
    return check(workspace);
  } finally {
    workspace.dispose();
  }
};
const fakeRobot = () => {
  const calls = [];
  return {
    calls,
    move: (d, s) => calls.push(['move', d, s]),
    turn: (d, s) => calls.push(['turn', d, s]),
    stop: () => calls.push(['stop']),
    led: (side, color) => calls.push(['led', side, color]),
    ledPixels: (first, last, color) => calls.push(['ledPixels', first, last, color]),
    distance: () => 1,
    battery: () => 80,
  };
};

test('the startup program loads and compiles', () => {
  withWorkspace(startupProgram(), (workspace) => assert.ok(compile(workspace).main.length > 0));
});

test('programs saved with the first block set still compile', () => {
  const program = withWorkspace(
    start({
      type: 'led_front',
      fields: { COLOR: '#ef4444' },
      next: {
        block: {
          type: 'controls_if',
          inputs: {
            IF0: {
              block: {
                type: 'logic_compare',
                fields: { OP: 'LT' },
                inputs: { A: { block: { type: 'obstacle_distance_back' } }, B: num(0.5) },
              },
            },
          },
        },
      },
    }),
    compile,
  );
  assert.equal(program.main[0].side, 'front');
  assert.deepEqual(program.main[1].branches[0].condition.a, { op: 'distance', direction: 'back' });
});

test('loose blocks are ignored, but two start blocks are refused', () => {
  const loose = { type: 'robot_stop', x: 400, y: 400 };
  withWorkspace(start({ type: 'robot_stop' }, { more: [loose] }), (workspace) =>
    assert.equal(compile(workspace).main.length, 1),
  );
  withWorkspace(start(null, { more: [{ type: 'robot_start', x: 300 }] }), (workspace) =>
    assert.throws(() => compile(workspace), /only one/),
  );
});

test('distance and angle blocks compile to moves that the runtime times', () => {
  const [move, turn] = withWorkspace(
    start({
      type: 'robot_move_distance',
      fields: { DIRECTION: 'front', METRES: 0.6 },
      next: { block: { type: 'robot_turn_angle', fields: { DIRECTION: 'right', DEGREES: 90 } } },
    }),
    compile,
  ).main;
  assert.deepEqual(
    [move.op, move.direction, move.metres, turn.op, turn.direction, turn.degrees],
    ['moveDistance', 'front', 0.6, 'turnAngle', 'right', 90],
  );
});

test('a run starts at the default speeds and the set speed blocks change them', async () => {
  const program = withWorkspace(
    start({
      type: 'robot_move_distance',
      fields: { DIRECTION: 'front', METRES: 0.015 },
      next: {
        block: {
          type: 'robot_set_speed',
          fields: { SPEED: 0.3 },
          next: {
            block: {
              type: 'robot_move_distance',
              fields: { DIRECTION: 'back', METRES: 0.03 },
              next: {
                block: {
                  type: 'robot_set_turn_speed',
                  fields: { SPEED: 1 },
                  next: {
                    block: { type: 'robot_turn_angle', fields: { DIRECTION: 'left', DEGREES: 5.73 } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    compile,
  );
  const robot = fakeRobot();
  await new Runner(robot).run(program);
  assert.deepEqual(
    robot.calls.filter(([name]) => name !== 'stop'),
    [
      ['move', 'front', STEP_SPEED],
      ['move', 'back', 0.3],
      ['turn', 'left', 1],
    ],
  );
  const second = fakeRobot();
  await new Runner(second).run(program);
  assert.equal(second.calls[0][2], STEP_SPEED, 'the next run starts at the default speed again');
});

test('break outside a loop is refused and points at the block', () => {
  withWorkspace(start({ type: 'controls_flow_statements', id: 'b1' }), (workspace) =>
    assert.throws(
      () => compile(workspace),
      (error) => error.blockId === 'b1',
    ),
  );
});

test('variables, counting loops, break and RGB lights run', async () => {
  const program = withWorkspace(
    start(
      {
        type: 'controls_for',
        fields: { VAR: { id: 'i' } },
        inputs: {
          FROM: num(1),
          TO: num(10),
          BY: num(1),
          DO: {
            block: {
              type: 'controls_if',
              inputs: {
                IF0: {
                  block: {
                    type: 'logic_compare',
                    fields: { OP: 'GT' },
                    inputs: {
                      A: { block: { type: 'variables_get', fields: { VAR: { id: 'i' } } } },
                      B: num(3),
                    },
                  },
                },
                DO0: { block: { type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } } },
              },
              next: {
                block: {
                  type: 'robot_led_rgb',
                  fields: { SIDE: 'all' },
                  inputs: {
                    R: {
                      block: {
                        type: 'math_arithmetic',
                        fields: { OP: 'MULTIPLY' },
                        inputs: {
                          A: { block: { type: 'variables_get', fields: { VAR: { id: 'i' } } } },
                          B: num(100),
                        },
                      },
                    },
                    G: num(0),
                    B: num(-5),
                  },
                },
              },
            },
          },
        },
      },
      { variables: [{ name: 'i', id: 'i' }] },
    ),
    compile,
  );
  const robot = fakeRobot();
  assert.equal(await new Runner(robot).run(program), 'finished');
  assert.deepEqual(
    robot.calls.filter((c) => c[0] === 'led').map((c) => c[2]),
    ['#640000', '#c80000', '#ff0000'],
  );
});

test('functions take arguments and return values', async () => {
  const program = withWorkspace(
    start(
      {
        type: 'robot_say',
        inputs: {
          TEXT: {
            block: {
              type: 'procedures_callreturn',
              extraState: { name: 'double', params: ['n'] },
              inputs: { ARG0: num(21) },
            },
          },
        },
      },
      {
        variables: [{ name: 'n', id: 'n' }],
        more: [
          {
            type: 'procedures_defreturn',
            x: 300,
            fields: { NAME: 'double' },
            extraState: { params: [{ name: 'n', id: 'n' }] },
            inputs: {
              RETURN: {
                block: {
                  type: 'math_arithmetic',
                  fields: { OP: 'ADD' },
                  inputs: {
                    A: { block: { type: 'variables_get', fields: { VAR: { id: 'n' } } } },
                    B: { block: { type: 'variables_get', fields: { VAR: { id: 'n' } } } },
                  },
                },
              },
            },
          },
        ],
      },
    ),
    compile,
  );
  const said = [];
  await new Runner(fakeRobot(), { onLog: (m, kind) => kind === 'say' && said.push(m) }).run(
    program,
  );
  assert.deepEqual(said, ['42']);
});

test('wait until rechecks the condition and repeat forever runs until Stop', async () => {
  const readings = [2, 1, 0.3];
  const robot = { ...fakeRobot(), distance: () => readings.shift() ?? 0.3 };
  const runner = new Runner(robot);
  const result = runner.run([
    {
      op: 'waitUntil',
      condition: {
        op: 'compare',
        operator: 'LT',
        a: { op: 'distance', direction: 'front' },
        b: { op: 'number', value: 0.5 },
      },
    },
    { op: 'forever', body: [] },
  ]);
  setTimeout(() => runner.stop(), 150);
  assert.equal(await result, 'stopped');
  assert.equal(readings.length, 0);
});

const pixelProgram = (from, to) =>
  withWorkspace(
    start({
      type: 'robot_led_pixel',
      fields: { COLOR: '#ff0000' },
      inputs: { PIXEL: num(from) },
      next: {
        block: {
          type: 'robot_led_range',
          fields: { COLOR: '#00ff00' },
          inputs: { FROM: num(from + 1), TO: num(to) },
        },
      },
    }),
    compile,
  );

test('light pixel and light pixels blocks set the ring pixels', async () => {
  const robot = fakeRobot();
  await new Runner(robot).run(pixelProgram(3, 9));
  assert.deepEqual(robot.calls.filter(([name]) => name !== 'stop'), [
    ['ledPixels', 3, 3, '#ff0000'],
    ['ledPixels', 4, 9, '#00ff00'],
  ]);
});

test('light pixels accept the ends in either order and refuse pixels off the ring', async () => {
  const robot = fakeRobot();
  await new Runner(robot).run(pixelProgram(9, 4));
  assert.deepEqual(robot.calls[1], ['ledPixels', 4, 10, '#00ff00']);
  await assert.rejects(new Runner(fakeRobot()).run(pixelProgram(0, 60)), /0 to 59/);
  await assert.rejects(new Runner(fakeRobot()).run(pixelProgram(-1, 5)), /0 to 59/);
});
