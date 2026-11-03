export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'));
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// Every loop pass takes at least this long, so a loop without waits polls the sensors at about
// 50 Hz instead of blocking the page, and a "repeat forever" can run until Stop.
const LOOP_PERIOD_MS = 20;
const MAX_CALL_DEPTH = 50;
const MAX_LINEAR = 0.3;
const MAX_ANGULAR = 1;

// Control flow inside the interpreter; never shown to the user.
class Break {}
class Continue {}
class Return {
  constructor(value) {
    this.value = value;
  }
}

const hex = (r, g, b) =>
  '#' +
  [r, g, b]
    .map((c) => {
      if (typeof c !== 'number' || !Number.isFinite(c))
        throw new Error('Light colours must be numbers from 0 to 255.');
      return Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0');
    })
    .join('');

const way = (direction) => ({ front: 'forward', back: 'backward' })[direction] || direction;
const show = (value) =>
  typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value);

export class Runner {
  constructor(robot, { onLog = () => {}, onStep = () => {} } = {}) {
    this.robot = robot;
    this.onLog = onLog;
    this.onStep = onStep;
    this.running = false;
  }
  stop() {
    this.controller?.abort();
    return this.robot.stop();
  }
  async run(program) {
    if (this.running) throw new Error('A program is already running.');
    if (Array.isArray(program)) program = { main: program, functions: {} };
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const variables = new Map();
    let depth = 0;
    let lastPass = performance.now();
    const checkStop = () => {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
    };
    const loopPass = async () => {
      await delay(Math.max(0, LOOP_PERIOD_MS - (performance.now() - lastPass)), signal);
      lastPass = performance.now();
    };
    const number = async (v, what) => {
      const result = await evaluate(v);
      if (typeof result !== 'number' || !Number.isFinite(result))
        throw new Error(`${what} needs a number, not “${show(result)}”.`);
      return result;
    };
    const evaluate = async (v) => {
      checkStop();
      switch (v.op) {
        case 'number':
        case 'value':
          return v.value;
        case 'boolean': // programs compiled by older versions of this page
          return v.value;
        case 'distance':
          return this.robot.distance(v.direction);
        case 'battery':
          return this.robot.battery();
        case 'variable':
          if (!variables.has(v.id))
            throw new Error(`Set the variable “${v.name}” before using it.`);
          return variables.get(v.id);
        case 'compare': {
          const a = await evaluate(v.a),
            b = await evaluate(v.b);
          switch (v.operator) {
            case 'LT':
              return a < b;
            case 'LTE':
              return a <= b;
            case 'GT':
              return a > b;
            case 'GTE':
              return a >= b;
            case 'EQ':
              return a === b;
            case 'NEQ':
              return a !== b;
          }
          break;
        }
        case 'and':
          return Boolean(await evaluate(v.a)) && Boolean(await evaluate(v.b));
        case 'or':
          return Boolean(await evaluate(v.a)) || Boolean(await evaluate(v.b));
        case 'not':
          return !(await evaluate(v.value));
        case 'arithmetic': {
          const a = await number(v.a, 'Maths'),
            b = await number(v.b, 'Maths');
          switch (v.operator) {
            case 'ADD':
              return a + b;
            case 'MINUS':
              return a - b;
            case 'MULTIPLY':
              return a * b;
            case 'DIVIDE':
              if (b === 0) throw new Error('Cannot divide by zero.');
              return a / b;
            case 'MODULO':
              if (b === 0) throw new Error('Cannot divide by zero.');
              return a % b;
            case 'POWER':
              return a ** b;
          }
          break;
        }
        case 'single': {
          const x = await number(v.value, 'Maths');
          const result = {
            ROOT: Math.sqrt,
            ABS: Math.abs,
            NEG: (n) => -n,
            LN: Math.log,
            LOG10: Math.log10,
            EXP: Math.exp,
            POW10: (n) => 10 ** n,
            ROUND: Math.round,
            ROUNDUP: Math.ceil,
            ROUNDDOWN: Math.floor,
          }[v.operator]?.(x);
          if (!Number.isFinite(result)) throw new Error('That maths has no answer.');
          return result;
        }
        case 'random': {
          let a = Math.round(await number(v.from, 'Random')),
            b = Math.round(await number(v.to, 'Random'));
          if (a > b) [a, b] = [b, a];
          return a + Math.floor(Math.random() * (b - a + 1));
        }
        case 'constrain': {
          const x = await number(v.value, 'Constrain');
          const low = await number(v.low, 'Constrain'),
            high = await number(v.high, 'Constrain');
          return Math.min(Math.max(x, low), high);
        }
        case 'join': {
          let text = '';
          for (const item of v.items) text += show(await evaluate(item));
          return text;
        }
        case 'call':
          return call(v);
      }
      throw new Error('Unknown expression.');
    };
    const call = async (cmd) => {
      const fn = program.functions[cmd.name];
      if (!fn) throw new Error(`The function “${cmd.name}” is missing.`);
      if (depth >= MAX_CALL_DEPTH) throw new Error('Functions call each other too many times.');
      const args = [];
      for (const arg of cmd.args) args.push(await evaluate(arg));
      // Parameters are workspace variables: give them the arguments and restore them afterwards.
      const saved = fn.params.map((id) => [id, variables.has(id), variables.get(id)]);
      fn.params.forEach((id, i) => variables.set(id, args[i]));
      depth++;
      try {
        await execute(fn.body);
        return fn.result ? await evaluate(fn.result) : undefined;
      } catch (flow) {
        if (flow instanceof Return) return flow.value;
        throw flow;
      } finally {
        depth--;
        for (const [id, had, value] of saved)
          if (had) variables.set(id, value);
          else variables.delete(id);
      }
    };
    const loopBody = async (body) => {
      await loopPass();
      try {
        await execute(body);
      } catch (flow) {
        if (flow instanceof Continue) return true;
        if (flow instanceof Break) return false;
        throw flow;
      }
      return true;
    };
    const timed = async (cmd) => {
      this.onLog(
        `${cmd.op === 'move' ? 'Moving' : 'Turning'} ${way(cmd.direction)} ${cmd.label || `for ${show(cmd.seconds)} s`}`,
      );
      if (cmd.op === 'move') this.robot.move(cmd.direction, cmd.speed);
      else this.robot.turn(cmd.direction, cmd.speed);
      try {
        await delay(cmd.seconds * 1000, signal);
      } finally {
        if (!signal.aborted) await this.robot.stop();
      }
    };
    const execute = async (body) => {
      for (const cmd of body) {
        checkStop();
        this.onStep(cmd.id);
        switch (cmd.op) {
          case 'move':
          case 'turn':
            await timed(cmd);
            break;
          case 'drive':
            this.robot.move(cmd.direction, cmd.speed);
            this.onLog(`Moving ${way(cmd.direction)}`);
            break;
          case 'spin':
            this.robot.turn(cmd.direction, cmd.speed);
            this.onLog(`Turning ${cmd.direction}`);
            break;
          case 'velocity': {
            const vx = await number(cmd.vx, 'Velocity'),
              vy = await number(cmd.vy, 'Velocity'),
              wz = await number(cmd.wz, 'Velocity');
            if (Math.hypot(vx, vy) > MAX_LINEAR + 1e-9 || Math.abs(wz) > MAX_ANGULAR)
              throw new Error(`Maximum speed is ${MAX_LINEAR} m/s and ${MAX_ANGULAR} rad/s.`);
            this.robot.drive({ vx, vy, wz });
            break;
          }
          case 'wait':
            await delay(cmd.seconds * 1000, signal);
            break;
          case 'waitUntil':
            while (!(await evaluate(cmd.condition))) await loopPass();
            break;
          case 'stop':
            await this.robot.stop();
            this.onLog('Motion stopped');
            break;
          case 'led':
            await this.robot.led(cmd.side, cmd.color);
            break;
          case 'ledRgb':
            await this.robot.led(
              cmd.side,
              hex(await evaluate(cmd.r), await evaluate(cmd.g), await evaluate(cmd.b)),
            );
            break;
          case 'say':
            this.onLog(show(await evaluate(cmd.text)), 'say');
            break;
          case 'set':
            variables.set(cmd.variable.id, await evaluate(cmd.value));
            break;
          case 'change': {
            const current = variables.has(cmd.variable.id) ? variables.get(cmd.variable.id) : 0;
            if (typeof current !== 'number')
              throw new Error(
                `“${cmd.variable.name}” is not a number, so it cannot change by a number.`,
              );
            variables.set(cmd.variable.id, current + (await number(cmd.delta, 'Change')));
            break;
          }
          case 'repeat': {
            const times = await evaluate(cmd.times);
            if (!Number.isInteger(times) || times < 0 || times > 1000)
              throw new Error('Repeat needs a whole number from 0 to 1000.');
            for (let i = 0; i < times; i++) if (!(await loopBody(cmd.body))) break;
            break;
          }
          case 'forever':
            while (await loopBody(cmd.body));
            break;
          case 'while':
            while (Boolean(await evaluate(cmd.condition)) !== cmd.until)
              if (!(await loopBody(cmd.body))) break;
            break;
          case 'for': {
            const from = await number(cmd.from, 'Count'),
              to = await number(cmd.to, 'Count');
            const by = Math.abs(await number(cmd.by, 'Count'));
            if (by === 0) throw new Error('Count needs a step bigger than 0.');
            const step = from <= to ? by : -by;
            for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
              variables.set(cmd.variable.id, i);
              if (!(await loopBody(cmd.body))) break;
            }
            break;
          }
          case 'break':
            throw new Break();
          case 'continue':
            throw new Continue();
          case 'if': {
            let selected = cmd.otherwise;
            for (const branch of cmd.branches)
              if (await evaluate(branch.condition)) {
                selected = branch.body;
                break;
              }
            await execute(selected);
            break;
          }
          case 'call':
            await call(cmd);
            break;
          case 'return':
            if (await evaluate(cmd.condition))
              throw new Return(cmd.value ? await evaluate(cmd.value) : undefined);
            break;
          default:
            throw new Error('Unknown program step.');
        }
      }
    };
    try {
      await execute(program.main);
      this.onLog('Program finished');
      return 'finished';
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
      this.onLog('Program stopped');
      return 'stopped';
    } finally {
      try {
        if (!signal.aborted) await this.robot.stop();
      } finally {
        this.running = false;
        this.onStep(null);
      }
    }
  }
}
