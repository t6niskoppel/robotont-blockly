// Compile only the supported block vocabulary into data for the interpreter.
export function compile(workspace) {
  const tops = workspace.getTopBlocks(false).filter((b) => b.isEnabled());
  if (tops.length !== 1 || tops[0].type !== 'robot_start') {
    throw new Error('Use one “when Run is pressed” block and connect your program inside it.');
  }
  if (workspace.getAllBlocks(false).length > 500)
    throw new Error('This program has too many blocks (maximum 500).');
  const fieldNumber = (b, name, min, max) => {
    const value = Number(b.getFieldValue(name));
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`Check ${name.toLowerCase()} in ${b.type}.`);
    return value;
  };
  const input = (b, name) => {
    const child = b.getInputTargetBlock(name);
    if (!child) throw new Error(`Fill the empty ${name} socket.`);
    return value(child);
  };
  function value(b) {
    if (b.type === 'math_number')
      return { op: 'number', value: fieldNumber(b, 'NUM', -10000, 10000) };
    if (b.type === 'logic_boolean')
      return { op: 'boolean', value: b.getFieldValue('BOOL') === 'TRUE' };
    if (b.type.startsWith('obstacle_distance_'))
      return { op: 'distance', direction: b.type.slice(18) };
    if (b.type === 'logic_compare')
      return {
        op: 'compare',
        operator: b.getFieldValue('OP'),
        a: input(b, 'A'),
        b: input(b, 'B'),
      };
    throw new Error(`Unsupported value block: ${b.type}`);
  }
  function sequence(first, depth = 0) {
    if (depth > 24) throw new Error('Loops and conditions are nested too deeply.');
    const out = [];
    for (let b = first; b; b = b.getNextBlock()) {
      if (!b.isEnabled()) continue;
      const id = b.id;
      if (b.type === 'robot_move' || b.type === 'robot_turn') {
        out.push({
          op: b.type.slice(6),
          id,
          direction: b.getFieldValue('DIRECTION'),
          speed: fieldNumber(b, 'SPEED', 0.01, b.type === 'robot_move' ? 0.3 : 1),
          seconds: fieldNumber(b, 'SECONDS', 0.05, 30),
        });
      } else if (b.type === 'robot_stop') out.push({ op: 'stop', id });
      else if (b.type === 'robot_wait')
        out.push({
          op: 'wait',
          id,
          seconds: fieldNumber(b, 'SECONDS', 0.05, 30),
        });
      else if (b.type === 'robot_led')
        out.push({
          op: 'led',
          id,
          side: b.getFieldValue('SIDE'),
          color: b.getFieldValue('COLOR'),
        });
      else if (b.type === 'controls_repeat_ext')
        out.push({
          op: 'repeat',
          id,
          times: input(b, 'TIMES'),
          body: sequence(b.getInputTargetBlock('DO'), depth + 1),
        });
      else if (b.type === 'controls_whileUntil')
        out.push({
          op: 'while',
          id,
          until: b.getFieldValue('MODE') === 'UNTIL',
          condition: input(b, 'BOOL'),
          body: sequence(b.getInputTargetBlock('DO'), depth + 1),
        });
      else if (b.type === 'controls_if') {
        const branches = [];
        for (let i = 0; b.getInput(`IF${i}`); i++)
          branches.push({
            condition: input(b, `IF${i}`),
            body: sequence(b.getInputTargetBlock(`DO${i}`), depth + 1),
          });
        out.push({
          op: 'if',
          id,
          branches,
          otherwise: sequence(b.getInputTargetBlock('ELSE'), depth + 1),
        });
      } else throw new Error(`Unsupported block: ${b.type}`);
    }
    return out;
  }
  return sequence(tops[0].getInputTargetBlock('DO'));
}
