// Compile only the supported block vocabulary into data for the interpreter.
// Blocks that are not attached to "when Run is pressed" or a function are ignored.
export function compile(workspace) {
  const tops = workspace.getTopBlocks(false).filter((b) => b.isEnabled());
  const starts = tops.filter((b) => b.type === 'robot_start');
  if (starts.length !== 1)
    throw new Error(
      starts.length
        ? 'Use only one “when Run is pressed” block.'
        : 'Add a “when Run is pressed” block and connect your program inside it.',
    );
  if (workspace.getAllBlocks(false).length > 500)
    throw new Error('This program has too many blocks (maximum 500).');
  const fail = (b, message) => {
    const error = new Error(message);
    error.blockId = b.id;
    throw error;
  };
  const fieldNumber = (b, name, min, max) => {
    const value = Number(b.getFieldValue(name));
    if (!Number.isFinite(value) || value < min || value > max)
      fail(b, `Use a number from ${min} to ${max} for ${name.toLowerCase()}.`);
    return value;
  };
  const input = (b, name) => {
    const child = b.getInputTargetBlock(name);
    if (!child || !child.isEnabled()) fail(b, 'Fill the empty socket in this block.');
    return value(child);
  };
  const variable = (b) => {
    const model = b.getField('VAR').getVariable();
    return { id: model.getId(), name: model.getName() };
  };
  function value(b) {
    switch (b.type) {
      case 'math_number':
        return { op: 'number', value: fieldNumber(b, 'NUM', -1e6, 1e6) };
      case 'logic_boolean':
        return { op: 'value', value: b.getFieldValue('BOOL') === 'TRUE' };
      case 'text':
        return { op: 'value', value: b.getFieldValue('TEXT') };
      case 'robot_distance':
        return { op: 'distance', direction: b.getFieldValue('DIRECTION') };
      case 'robot_obstacle':
        return {
          op: 'compare',
          operator: 'LT',
          a: { op: 'distance', direction: b.getFieldValue('DIRECTION') },
          b: { op: 'number', value: fieldNumber(b, 'METRES', 0.05, 10) },
        };
      case 'robot_battery':
        return { op: 'battery' };
      case 'logic_compare':
        return {
          op: 'compare',
          operator: b.getFieldValue('OP'),
          a: input(b, 'A'),
          b: input(b, 'B'),
        };
      case 'logic_operation':
        return {
          op: b.getFieldValue('OP') === 'AND' ? 'and' : 'or',
          a: input(b, 'A'),
          b: input(b, 'B'),
        };
      case 'logic_negate':
        return { op: 'not', value: input(b, 'BOOL') };
      case 'math_arithmetic':
        return {
          op: 'arithmetic',
          operator: b.getFieldValue('OP'),
          a: input(b, 'A'),
          b: input(b, 'B'),
        };
      case 'math_single':
      case 'math_round':
        return { op: 'single', operator: b.getFieldValue('OP'), value: input(b, 'NUM') };
      case 'math_modulo':
        return {
          op: 'arithmetic',
          operator: 'MODULO',
          a: input(b, 'DIVIDEND'),
          b: input(b, 'DIVISOR'),
        };
      case 'math_random_int':
        return { op: 'random', from: input(b, 'FROM'), to: input(b, 'TO') };
      case 'math_constrain':
        return {
          op: 'constrain',
          value: input(b, 'VALUE'),
          low: input(b, 'LOW'),
          high: input(b, 'HIGH'),
        };
      case 'text_join': {
        const items = [];
        for (let i = 0; b.getInput(`ADD${i}`); i++) items.push(input(b, `ADD${i}`));
        return { op: 'join', items };
      }
      case 'variables_get':
        return { op: 'variable', ...variable(b) };
      case 'procedures_callreturn':
        return call(b);
    }
    if (b.type.startsWith('obstacle_distance_'))
      return { op: 'distance', direction: b.type.slice(18) };
    fail(b, `This block cannot be used here yet (${b.type}).`);
  }
  // Functions are compiled once by name; a call refers to the name, so recursion works.
  const functions = {};
  for (const def of tops.filter((b) => b.type.startsWith('procedures_def'))) {
    const [name, params] = def.getProcedureDef();
    functions[name] = {
      block: def,
      params: def.getVarModels().map((v) => v.getId()),
      names: params,
    };
  }
  function call(b) {
    const name = b.getFieldValue('NAME');
    if (!functions[name]) fail(b, `The function “${name}” is missing or disabled.`);
    const args = [];
    for (let i = 0; b.getInput(`ARG${i}`); i++) args.push(input(b, `ARG${i}`));
    return { op: 'call', id: b.id, name, args };
  }
  const inside = (b, types) => {
    for (let parent = b.getSurroundParent(); parent; parent = parent.getSurroundParent())
      if (types.some((type) => parent.type.startsWith(type))) return true;
    return false;
  };
  const loops = ['controls_repeat_ext', 'controls_whileUntil', 'controls_for', 'robot_forever'];
  function sequence(first, depth = 0) {
    if (depth > 24) throw new Error('Loops and conditions are nested too deeply.');
    const out = [];
    const body = (b, name) => sequence(b.getInputTargetBlock(name), depth + 1);
    for (let b = first; b; b = b.getNextBlock()) {
      if (!b.isEnabled()) continue;
      const id = b.id;
      const direction = () => b.getFieldValue('DIRECTION');
      switch (b.type) {
        case 'robot_move':
        case 'robot_turn':
          out.push({
            op: b.type.slice(6),
            id,
            direction: direction(),
            speed: fieldNumber(b, 'SPEED', 0.01, b.type === 'robot_move' ? 0.3 : 1),
            seconds: fieldNumber(b, 'SECONDS', 0.05, 30),
          });
          break;
        case 'robot_move_distance':
          out.push({
            op: 'moveDistance',
            id,
            direction: direction(),
            metres: fieldNumber(b, 'METRES', 0.01, 5),
          });
          break;
        case 'robot_turn_angle':
          out.push({
            op: 'turnAngle',
            id,
            direction: direction(),
            degrees: fieldNumber(b, 'DEGREES', 1, 720),
          });
          break;
        case 'robot_set_speed':
          out.push({ op: 'setSpeed', id, kind: 'linear', value: fieldNumber(b, 'SPEED', 0.01, 0.3) });
          break;
        case 'robot_set_turn_speed':
          out.push({ op: 'setSpeed', id, kind: 'angular', value: fieldNumber(b, 'SPEED', 0.05, 1) });
          break;
        case 'robot_drive':
        case 'robot_spin':
          out.push({
            op: b.type === 'robot_drive' ? 'drive' : 'spin',
            id,
            direction: direction(),
            speed: fieldNumber(b, 'SPEED', 0.01, b.type === 'robot_drive' ? 0.3 : 1),
          });
          break;
        case 'robot_velocity':
          out.push({
            op: 'velocity',
            id,
            vx: input(b, 'VX'),
            vy: input(b, 'VY'),
            wz: input(b, 'WZ'),
          });
          break;
        case 'robot_stop':
          out.push({ op: 'stop', id });
          break;
        case 'robot_wait':
          out.push({ op: 'wait', id, seconds: fieldNumber(b, 'SECONDS', 0.05, 30) });
          break;
        case 'robot_wait_until':
          out.push({ op: 'waitUntil', id, condition: input(b, 'CONDITION') });
          break;
        case 'robot_led':
          out.push({
            op: 'led',
            id,
            side: b.getFieldValue('SIDE'),
            color: b.getFieldValue('COLOR'),
          });
          break;
        case 'robot_led_rgb':
          out.push({
            op: 'ledRgb',
            id,
            side: b.getFieldValue('SIDE'),
            r: input(b, 'R'),
            g: input(b, 'G'),
            b: input(b, 'B'),
          });
          break;
        case 'robot_say':
          out.push({ op: 'say', id, text: input(b, 'TEXT') });
          break;
        case 'controls_repeat_ext':
          out.push({ op: 'repeat', id, times: input(b, 'TIMES'), body: body(b, 'DO') });
          break;
        case 'robot_forever':
          out.push({ op: 'forever', id, body: body(b, 'DO') });
          break;
        case 'controls_whileUntil':
          out.push({
            op: 'while',
            id,
            until: b.getFieldValue('MODE') === 'UNTIL',
            condition: input(b, 'BOOL'),
            body: body(b, 'DO'),
          });
          break;
        case 'controls_for':
          out.push({
            op: 'for',
            id,
            variable: variable(b),
            from: input(b, 'FROM'),
            to: input(b, 'TO'),
            by: input(b, 'BY'),
            body: body(b, 'DO'),
          });
          break;
        case 'controls_flow_statements':
          if (!inside(b, loops)) fail(b, 'Use this block inside a loop.');
          out.push({ op: b.getFieldValue('FLOW') === 'BREAK' ? 'break' : 'continue', id });
          break;
        case 'controls_if': {
          const branches = [];
          for (let i = 0; b.getInput(`IF${i}`); i++)
            branches.push({ condition: input(b, `IF${i}`), body: body(b, `DO${i}`) });
          out.push({ op: 'if', id, branches, otherwise: body(b, 'ELSE') });
          break;
        }
        case 'variables_set':
          out.push({ op: 'set', id, variable: variable(b), value: input(b, 'VALUE') });
          break;
        case 'math_change':
          out.push({ op: 'change', id, variable: variable(b), delta: input(b, 'DELTA') });
          break;
        case 'procedures_callnoreturn':
          out.push(call(b));
          break;
        case 'procedures_ifreturn': {
          if (!inside(b, ['procedures_def'])) fail(b, 'Use this block inside a function.');
          const hasValue = Boolean(b.getInput('VALUE'));
          out.push({
            op: 'return',
            id,
            condition: input(b, 'CONDITION'),
            value: hasValue ? input(b, 'VALUE') : null,
          });
          break;
        }
        default:
          if (b.type.startsWith('led_')) {
            out.push({ op: 'led', id, side: b.type.slice(4), color: b.getFieldValue('COLOR') });
            break;
          }
          fail(b, `This block cannot be used here yet (${b.type}).`);
      }
    }
    return out;
  }
  const program = {
    main: sequence(starts[0].getInputTargetBlock('DO')),
    functions: {},
  };
  for (const [name, f] of Object.entries(functions)) {
    program.functions[name] = {
      params: f.params,
      body: sequence(f.block.getInputTargetBlock('STACK')),
      result: f.block.getInput('RETURN') ? input(f.block, 'RETURN') : null,
    };
  }
  return program;
}
