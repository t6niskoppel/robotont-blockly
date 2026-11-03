// The blockly package entry brings in the standard blocks and English messages.
import * as Blockly from 'blockly';
import '@blockly/field-colour-hsv-sliders';
import '@blockly/field-slider';
import '@blockly/block-plus-minus';
import '@blockly/toolbox-search';
export const directions = ['front', 'back', 'left', 'right'];
// Fixed speeds for the distance and angle blocks, which are timed: distance / speed.
export const STEP_SPEED = 0.15; // m/s
export const TURN_SPEED = 0.5; // rad/s
const colorField = { type: 'field_colour_hsv_sliders', name: 'COLOR', colour: '#0062ff' };
const options = (values) => values.map((v) => (Array.isArray(v) ? v : [v, v]));
const moveDirections = [
  ['forward', 'front'],
  ['backward', 'back'],
  ['left', 'left'],
  ['right', 'right'],
];
// Speeds are picked with a slider; the other numbers are typed.
const speed = (name, value, min, max) => ({
  type: 'field_slider',
  name,
  value,
  min,
  max,
  precision: 0.01,
});
const number = (name, value, min, max) => ({ type: 'field_number', name, value, min, max });
const statement = { previousStatement: null, nextStatement: null };

const definitions = [
  {
    type: 'robot_start',
    message0: 'when ▶ Run is pressed %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    style: 'event_blocks',
    tooltip: 'The program starts here.',
  },
  // Motion
  {
    type: 'robot_move_distance',
    message0: 'move %1 %2 m',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: moveDirections },
      number('METRES', 0.3, 0.01, 5),
    ],
    ...statement,
    style: 'motion_blocks',
    tooltip: `Drives at ${STEP_SPEED} m/s for distance ÷ speed seconds, then stops.`,
  },
  {
    type: 'robot_turn_angle',
    message0: 'turn %1 %2 °',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: options(['left', 'right']) },
      number('DEGREES', 90, 1, 720),
    ],
    ...statement,
    style: 'motion_blocks',
    tooltip: `Turns at ${TURN_SPEED} rad/s for angle ÷ speed seconds, then stops.`,
  },
  {
    type: 'robot_move',
    message0: 'move %1 at %2 m/s for %3 seconds',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: moveDirections },
      speed('SPEED', 0.15, 0.01, 0.3),
      number('SECONDS', 1, 0.05, 30),
    ],
    ...statement,
    style: 'motion_blocks',
  },
  {
    type: 'robot_turn',
    message0: 'turn %1 at %2 rad/s for %3 seconds',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: options(['left', 'right']) },
      speed('SPEED', 0.5, 0.05, 1),
      number('SECONDS', 1, 0.05, 30),
    ],
    ...statement,
    style: 'motion_blocks',
  },
  {
    type: 'robot_drive',
    message0: 'start moving %1 at %2 m/s',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: moveDirections },
      speed('SPEED', 0.1, 0.01, 0.3),
    ],
    ...statement,
    style: 'motion_blocks',
    tooltip:
      'Keeps moving while the next blocks run, until a stop block or the end of the program.',
  },
  {
    type: 'robot_spin',
    message0: 'start turning %1 at %2 rad/s',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: options(['left', 'right']) },
      speed('SPEED', 0.5, 0.05, 1),
    ],
    ...statement,
    style: 'motion_blocks',
    tooltip:
      'Keeps turning while the next blocks run, until a stop block or the end of the program.',
  },
  {
    type: 'robot_velocity',
    message0: 'set velocity forward %1 m/s left %2 m/s turn %3 rad/s',
    args0: [
      { type: 'input_value', name: 'VX', check: 'Number' },
      { type: 'input_value', name: 'VY', check: 'Number' },
      { type: 'input_value', name: 'WZ', check: 'Number' },
    ],
    inputsInline: true,
    ...statement,
    style: 'motion_blocks',
    tooltip: 'Moves in any direction at once. Limits: 0.3 m/s and 1 rad/s.',
  },
  {
    type: 'robot_stop',
    message0: 'stop moving',
    ...statement,
    style: 'motion_blocks',
  },
  // Sensors
  {
    type: 'robot_distance',
    message0: 'distance %1 (m)',
    args0: [{ type: 'field_dropdown', name: 'DIRECTION', options: options(directions) }],
    output: 'Number',
    style: 'sensor_blocks',
    tooltip: 'Nearest obstacle on that side, from the lidar or depth scan.',
  },
  {
    type: 'robot_obstacle',
    message0: 'obstacle %1 closer than %2 m',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: options(directions) },
      number('METRES', 0.5, 0.05, 10),
    ],
    output: 'Boolean',
    style: 'sensor_blocks',
  },
  {
    type: 'robot_pose',
    message0: 'robot %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PART',
        options: [
          ['x (m)', 'x'],
          ['y (m)', 'y'],
          ['heading (°)', 'heading'],
        ],
      },
    ],
    output: 'Number',
    style: 'sensor_blocks',
    tooltip: 'Position from odometry, measured from where the robot was started.',
  },
  {
    type: 'robot_battery',
    message0: 'battery %',
    output: 'Number',
    style: 'sensor_blocks',
  },
  {
    type: 'robot_timer',
    message0: 'seconds since Run',
    output: 'Number',
    style: 'sensor_blocks',
  },
  // Lights
  {
    type: 'robot_led',
    message0: 'light %1 %2',
    args0: [
      { type: 'field_dropdown', name: 'SIDE', options: options([...directions, 'all']) },
      colorField,
    ],
    ...statement,
    style: 'light_blocks',
  },
  {
    type: 'robot_led_rgb',
    message0: 'light %1 red %2 green %3 blue %4',
    args0: [
      { type: 'field_dropdown', name: 'SIDE', options: options([...directions, 'all']) },
      { type: 'input_value', name: 'R', check: 'Number' },
      { type: 'input_value', name: 'G', check: 'Number' },
      { type: 'input_value', name: 'B', check: 'Number' },
    ],
    inputsInline: true,
    ...statement,
    style: 'light_blocks',
    tooltip: 'Each colour from 0 to 255.',
  },
  // Control
  {
    type: 'robot_wait',
    message0: 'wait %1 seconds',
    args0: [number('SECONDS', 1, 0.05, 30)],
    ...statement,
    style: 'control_blocks',
  },
  {
    type: 'robot_wait_until',
    message0: 'wait until %1',
    args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    ...statement,
    style: 'control_blocks',
  },
  {
    type: 'robot_forever',
    message0: 'repeat forever %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    style: 'control_blocks',
    tooltip: 'Runs until Stop is pressed.',
  },
  {
    type: 'robot_say',
    message0: 'say %1',
    args0: [{ type: 'input_value', name: 'TEXT' }],
    ...statement,
    style: 'text_blocks',
    tooltip: 'Writes to the program log.',
  },
  // Kept so that programs saved with the first set of blocks still load.
  ...directions.map((d) => ({
    type: `obstacle_distance_${d}`,
    message0: `obstacle distance ${d} (m)`,
    output: 'Number',
    style: 'sensor_blocks',
  })),
  ...[...directions, 'all'].map((d) => ({
    type: `led_${d}`,
    message0: `LED ${d} %1`,
    args0: [colorField],
    ...statement,
    style: 'light_blocks',
  })),
];
Blockly.common.defineBlocksWithJsonArray(definitions);

const palette = {
  event: '#e8a33d',
  motion: '#13a18e',
  sensor: '#3d8bd9',
  light: '#d1569e',
  control: '#e5793b',
  logic: '#5c6bd1',
  math: '#3f9c5a',
  text: '#6b7c8a',
  variable: '#cc5a46',
  procedure: '#9061c9',
};
const style = (colour) => ({ colourPrimary: colour, hat: '' });
export const theme = Blockly.Theme.defineTheme('robotont', {
  base: Blockly.Themes.Classic,
  startHats: true,
  blockStyles: {
    event_blocks: { ...style(palette.event), hat: 'cap' },
    motion_blocks: style(palette.motion),
    sensor_blocks: style(palette.sensor),
    light_blocks: style(palette.light),
    control_blocks: style(palette.control),
    loop_blocks: style(palette.control),
    logic_blocks: style(palette.logic),
    math_blocks: style(palette.math),
    text_blocks: style(palette.text),
    variable_blocks: style(palette.variable),
    variable_dynamic_blocks: style(palette.variable),
    procedure_blocks: style(palette.procedure),
  },
  categoryStyles: Object.fromEntries(
    Object.entries(palette).map(([name, colour]) => [`${name}_category`, { colour }]),
  ),
  componentStyles: {
    workspaceBackgroundColour: '#f7faf9',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#183e35',
    flyoutBackgroundColour: '#eef4f1',
    flyoutOpacity: 0.97,
    scrollbarColour: '#b7c8c1',
    insertionMarkerColour: '#183e35',
    selectedGlowColour: '#facc15',
  },
  fontStyle: { family: 'Inter, system-ui, sans-serif', weight: '600', size: 12 },
});

const block = (type, extra = {}) => ({ kind: 'block', type, ...extra });
const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const category = (name, styleName, contents, extra = {}) => ({
  kind: 'category',
  name,
  categorystyle: `${styleName}_category`,
  contents,
  ...extra,
});

const level1 = {
  kind: 'categoryToolbox',
  contents: [
    category('Start', 'event', [block('robot_start')]),
    category('Move', 'motion', [
      block('robot_move_distance'),
      block('robot_move_distance', { fields: { DIRECTION: 'back' } }),
      block('robot_turn_angle'),
      block('robot_turn_angle', { fields: { DIRECTION: 'right' } }),
      block('robot_stop'),
    ]),
    category('Lights', 'light', [
      block('robot_led', { fields: { SIDE: 'all', COLOR: '#3b82f6' } }),
      block('robot_led', { fields: { SIDE: 'front', COLOR: '#22c55e' } }),
      block('robot_led', { fields: { SIDE: 'all', COLOR: '#000000' } }),
    ]),
    category('Control', 'control', [
      block('robot_wait'),
      block('controls_repeat_ext', { inputs: { TIMES: num(4) } }),
      block('robot_forever'),
      block('controls_if'),
      block('controls_if', { extraState: { hasElse: true } }),
      block('robot_wait_until'),
    ]),
    category('Sensors', 'sensor', [block('robot_obstacle')]),
  ],
};

const level2 = {
  kind: 'categoryToolbox',
  contents: [
    category('Start', 'event', [block('robot_start')]),
    category('Move', 'motion', [
      block('robot_move_distance'),
      block('robot_turn_angle'),
      block('robot_move'),
      block('robot_turn'),
      { kind: 'sep', gap: 24 },
      block('robot_drive'),
      block('robot_spin'),
      block('robot_velocity', { inputs: { VX: num(0.1), VY: num(0), WZ: num(0) } }),
      block('robot_stop'),
    ]),
    category('Sensors', 'sensor', [
      block('robot_obstacle'),
      block('robot_distance'),
      block('robot_pose'),
      block('robot_battery'),
      block('robot_timer'),
    ]),
    category('Lights', 'light', [
      block('robot_led', { fields: { SIDE: 'all', COLOR: '#3b82f6' } }),
      block('robot_led_rgb', { inputs: { R: num(255), G: num(120), B: num(0) } }),
    ]),
    category('Control', 'control', [
      block('robot_wait'),
      block('robot_wait_until'),
      block('controls_repeat_ext', { inputs: { TIMES: num(4) } }),
      block('robot_forever'),
      block('controls_whileUntil'),
      block('controls_for', { inputs: { FROM: num(1), TO: num(10), BY: num(1) } }),
      block('controls_flow_statements'),
      block('controls_if'),
      block('controls_if', { extraState: { hasElse: true } }),
    ]),
    category('Logic', 'logic', [
      block('logic_compare'),
      block('logic_operation'),
      block('logic_negate'),
      block('logic_boolean'),
    ]),
    category('Math', 'math', [
      block('math_number'),
      block('math_arithmetic', { inputs: { A: num(1), B: num(1) } }),
      block('math_random_int', { inputs: { FROM: num(1), TO: num(10) } }),
      block('math_round'),
      block('math_single'),
      block('math_modulo', { inputs: { DIVIDEND: num(10), DIVISOR: num(3) } }),
      block('math_constrain', { inputs: { LOW: num(0), HIGH: num(100) } }),
    ]),
    category('Text', 'text', [
      block('robot_say', {
        inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello!' } } } },
      }),
      block('text'),
      block('text_join'),
    ]),
    { kind: 'sep' },
    category('Variables', 'variable', [], { custom: 'VARIABLE' }),
    category('Functions', 'procedure', [], { custom: 'PROCEDURE' }),
    { kind: 'sep' },
    { kind: 'search', name: 'Search', contents: [] },
  ],
};
export const toolboxes = { 1: level1, 2: level2 };

// Example programs: a level, a title and the blocks inside "when Run is pressed".
const chain = (blocks) =>
  blocks.reduceRight((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), null);
const led = (side, color) => ({ type: 'robot_led', fields: { SIDE: side, COLOR: color } });
const wait = (seconds) => ({ type: 'robot_wait', fields: { SECONDS: seconds } });
const statements = (blocks) => ({ block: chain(blocks) });
const obstacle = (direction, metres) => ({
  type: 'robot_obstacle',
  fields: { DIRECTION: direction, METRES: metres },
});
const examples = {
  square: {
    title: 'Drive a square',
    body: [
      led('all', '#22c55e'),
      {
        type: 'controls_repeat_ext',
        inputs: {
          TIMES: num(4),
          DO: statements([
            { type: 'robot_move_distance', fields: { DIRECTION: 'front', METRES: 0.5 } },
            { type: 'robot_turn_angle', fields: { DIRECTION: 'left', DEGREES: 90 } },
          ]),
        },
      },
      led('all', '#000000'),
    ],
  },
  'stop-at-wall': {
    title: 'Stop before a wall',
    body: [
      led('front', '#22c55e'),
      { type: 'robot_drive', fields: { DIRECTION: 'front', SPEED: 0.1 } },
      { type: 'robot_wait_until', inputs: { CONDITION: { block: obstacle('front', 0.5) } } },
      { type: 'robot_stop' },
      led('front', '#ef4444'),
    ],
  },
  avoid: {
    title: 'Avoid obstacles',
    body: [
      {
        type: 'robot_forever',
        inputs: {
          DO: statements([
            {
              type: 'controls_if',
              extraState: { hasElse: true },
              inputs: {
                IF0: { block: obstacle('front', 0.5) },
                DO0: statements([
                  led('all', '#f97316'),
                  { type: 'robot_turn_angle', fields: { DIRECTION: 'left', DEGREES: 45 } },
                ]),
                ELSE: statements([
                  led('all', '#22c55e'),
                  { type: 'robot_drive', fields: { DIRECTION: 'front', SPEED: 0.1 } },
                ]),
              },
            },
            wait(0.1),
          ]),
        },
      },
    ],
  },
  police: {
    title: 'Police lights',
    body: [
      {
        type: 'controls_repeat_ext',
        inputs: {
          TIMES: num(6),
          DO: statements([
            led('left', '#ef4444'),
            led('right', '#3b82f6'),
            wait(0.5),
            led('left', '#3b82f6'),
            led('right', '#ef4444'),
            wait(0.5),
          ]),
        },
      },
      led('all', '#000000'),
    ],
  },
  'distance-colours': {
    title: 'Distance colours',
    variables: [{ name: 'distance', id: 'distance' }],
    body: [
      {
        type: 'robot_forever',
        inputs: {
          DO: statements([
            {
              type: 'variables_set',
              fields: { VAR: { id: 'distance' } },
              inputs: {
                VALUE: { block: { type: 'robot_distance', fields: { DIRECTION: 'front' } } },
              },
            },
            {
              type: 'controls_if',
              extraState: { elseIfCount: 1, hasElse: true },
              inputs: {
                IF0: { block: compare('LT', 0.4) },
                DO0: statements([led('all', '#ef4444')]),
                IF1: { block: compare('LT', 1) },
                DO1: statements([led('all', '#facc15')]),
                ELSE: statements([led('all', '#22c55e')]),
              },
            },
            {
              type: 'robot_say',
              inputs: {
                TEXT: {
                  block: {
                    type: 'text_join',
                    extraState: { itemCount: 3 },
                    inputs: {
                      ADD0: { block: { type: 'text', fields: { TEXT: 'Front: ' } } },
                      ADD1: { block: variable() },
                      ADD2: { block: { type: 'text', fields: { TEXT: ' m' } } },
                    },
                  },
                },
              },
            },
            wait(1),
          ]),
        },
      },
    ],
  },
  motion: {
    title: 'Move and turn',
    body: [
      { type: 'robot_move', fields: { DIRECTION: 'front', SPEED: 0.15, SECONDS: 1 } },
      { type: 'robot_turn', fields: { DIRECTION: 'left', SPEED: 0.5, SECONDS: 1 } },
      { type: 'robot_stop' },
    ],
  },
};
function variable() {
  return { type: 'variables_get', fields: { VAR: { id: 'distance' } } };
}
function compare(op, metres) {
  return {
    type: 'logic_compare',
    fields: { OP: op },
    inputs: { A: { block: variable() }, B: num(metres) },
  };
}
export const exampleTitles = Object.fromEntries(
  Object.entries(examples).map(([name, e]) => [name, e.title]),
);
export function example(name) {
  const { body, variables } = examples[name];
  return {
    ...(variables ? { variables } : {}),
    blocks: {
      languageVersion: 0,
      blocks: [{ type: 'robot_start', x: 40, y: 40, inputs: { DO: statements(body) } }],
    },
  };
}

export { Blockly };
