import '../site.css';
import { registerContinuousToolbox } from '@blockly/continuous-toolbox';
import { Blockly, toolboxes, theme, startupProgram } from './blocks.js';
import { compile } from './compiler.js';
import { Runner } from './runtime.js';
import { StatusView } from './status_view.js';
import { RobotConnection } from '../ros_connection.js';
import { RobotControl } from '../robot_control.js';
import { RobotViewer } from '../viewer.js';

const element = (id) => document.getElementById(id);
// Browser storage is a convenience: it can be missing (private windows), so every access is guarded.
const stored = (key, fallback = null) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved; the page still works.
  }
};

let level = stored('robotont-blockly-level') === '2' ? '2' : '1';
// One scrolling list of every block; the categories jump to their part of it.
registerContinuousToolbox();
const workspace = Blockly.inject('workspace', {
  toolbox: toolboxes[level],
  plugins: {
    flyoutsVerticalToolbox: 'ContinuousFlyout',
    metricsManager: 'ContinuousMetrics',
    toolbox: 'ContinuousToolbox',
  },
  theme,
  renderer: 'zelos',
  trashcan: true,
  sounds: false,
  media: '/vendor/media/',
  grid: { spacing: 24, length: 2, colour: '#d5e2dc', snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.9, pinch: true },
  move: { scrollbars: true, drag: true, wheel: true },
});
// The Basic / All blocks switch sits at the top of the block list.
workspace.getToolbox().HtmlDiv.prepend(element('levels'));
// Recycled blocks stay behind when the list is rebuilt, so every visit builds them fresh.
workspace.getFlyout().setRecyclingEnabled(false);
new ResizeObserver(() => Blockly.svgResize(workspace)).observe(element('workspace'));
// Loose blocks are greyed out so it is clear they will not run.
workspace.addChangeListener(Blockly.Events.disableOrphans);

const connection = new RobotConnection();
const control = new RobotControl(connection);
const viewer = new RobotViewer(element('scene'), connection);
const status = new StatusView(element('status'));
element('camera-card').ontoggle = () => render();
element('view-card').ontoggle = () => viewer.setScan(element('view-card').open);
element('follow').onclick = () => viewer.follow();
element('top').onclick = () => viewer.topDown();
let runner = null;
let started = 0;

const log = (message, kind = 'info') => {
  const item = document.createElement('li');
  item.className = kind;
  const time = document.createElement('time');
  time.textContent = runner ? `${((performance.now() - started) / 1000).toFixed(1)} s` : '';
  item.append(time, document.createTextNode(message));
  element('log').prepend(item);
  while (element('log').children.length > 60) element('log').lastChild.remove();
};
element('clear-log').onclick = () => element('log').replaceChildren();

const banner = (message, kind) => {
  element('banner').hidden = !message;
  element('banner').textContent = message || '';
  element('banner').className = `banner ${kind || ''}`;
};

// Programs: autosaved in this browser, and files.
const save = () =>
  store(
    'robotont-blockly-program',
    JSON.stringify(Blockly.serialization.workspaces.save(workspace)),
  );
const load = (data) => {
  workspace.clear();
  Blockly.serialization.workspaces.load(data, workspace);
  workspace.scrollCenter();
};
try {
  const saved = JSON.parse(stored('robotont-blockly-program'));
  if (!saved) throw new Error('nothing saved');
  load(saved);
} catch {
  load(startupProgram());
}
let saveTimer;
workspace.addChangeListener((event) => {
  if (event.isUiEvent) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
  if (!runner) banner(null);
});

element('clear').onclick = () => {
  if (workspace.getAllBlocks(false).length > 1 && !confirm('Start a new, empty program?')) return;
  load({ blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 40, y: 40 }] } });
};
element('undo').onclick = () => workspace.undo(false);
element('redo').onclick = () => workspace.undo(true);

const showLevel = () => {
  for (const button of document.querySelectorAll('[data-level]'))
    button.setAttribute('aria-pressed', String(button.dataset.level === level));
};
for (const button of document.querySelectorAll('[data-level]'))
  button.onclick = () => {
    level = button.dataset.level;
    store('robotont-blockly-level', level);
    workspace.updateToolbox(toolboxes[level]);
    workspace.getToolbox().refreshSelection(); // rebuild the scrolling list
    showLevel();
  };
showLevel();

element('save').onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(Blockly.serialization.workspaces.save(workspace), null, 2)], {
      type: 'application/json',
    }),
  );
  const download = document.createElement('a');
  download.href = url;
  download.download = 'robotont-program.json';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
element('load').onclick = () => element('file').click();
element('file').onchange = async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1000000) throw new Error('Program file is too large');
    const data = JSON.parse(await file.text());
    const previous = Blockly.serialization.workspaces.save(workspace);
    // Unfinished programs open too; Run reports what is missing.
    try {
      load(data);
    } catch (error) {
      load(previous);
      throw error;
    }
    log('Program opened');
  } catch (error) {
    log('Cannot open program: ' + error.message, 'error');
  } finally {
    event.target.value = '';
  }
};

// The interpreter drives the robot through this; lights are also drawn in the status view.
let warnedLeds = false;
const robot = {
  move: (direction, speed) => control.move(direction, speed),
  turn: (direction, speed) => control.turn(direction, speed),
  drive: (velocity) => control.drive(velocity),
  stop: () => control.stop(),
  distance: (direction) => control.distance(direction),
  battery: () => control.battery(),
  led(side, color) {
    control.led(side, color);
    status.led(side, color);
    if (!connection.robot?.led && !warnedLeds) {
      warnedLeds = true;
      log(
        'This robot has no LED module listening (the simulation has none). Colours are only shown here.',
      );
    }
  },
};

const busy = (value) => {
  for (const id of ['load', 'clear']) element(id).disabled = value;
  document.body.classList.toggle('running', value);
};
async function run() {
  if (runner || element('run').disabled) return;
  let program;
  try {
    program = compile(workspace);
  } catch (error) {
    banner(error.message, 'error');
    log(error.message, 'error');
    if (error.blockId) {
      workspace.centerOnBlock(error.blockId);
      workspace.getBlockById(error.blockId)?.select();
    }
    return;
  }
  runner = new Runner(robot, {
    onLog: log,
    onStep: (id) => workspace.highlightBlock(id),
  });
  started = performance.now();
  warnedLeds = false;
  status.clearLeds();
  busy(true);
  banner('Running… press Stop or Esc to stop the robot.', 'running');
  render();
  try {
    await runner.run(program);
    banner(null);
  } catch (error) {
    banner(error.message, 'error');
    log(error.message, 'error');
  } finally {
    busy(false);
    runner = null;
    render();
  }
}
async function stop() {
  try {
    await (runner ? runner.stop() : control.stop());
  } catch (error) {
    log(error.message, 'error');
  }
}
element('run').onclick = run;
element('stop').onclick = () => {
  stop();
  log('Stop requested');
};
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') stop();
  else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    run();
  }
});

window.addEventListener('pagehide', stop);
window.addEventListener('blur', stop);
connection.addEventListener('beforeselect', stop);
connection.addEventListener('connection', () => {
  if (!connection.connected) stop();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});

function render() {
  const robot = connection.robot;
  element('online').classList.toggle('connected', connection.connected && Boolean(robot));
  element('connection').textContent = !connection.connected
    ? 'Disconnected from rosbridge'
    : robot
      ? `Connected to ${robot.name}`
      : 'No robot found';
  element('run').disabled = !connection.ready || Boolean(runner);
  element('led-note').textContent =
    robot && !robot.led
      ? 'No LED module on this robot: the ring shows the colours the program sent.'
      : 'The ring shows the colours the program sent.';
  // A collapsed camera card stops the stream, which saves the robot's Wi-Fi.
  const source = robot?.topics.rgb && element('camera-card').open
    ? connection.videoUrl(robot.topics.rgb, {
        width: 320,
        height: 180,
        transport: robot.rgb_transport || 'raw',
      })
    : '';
  if (element('camera').dataset.source !== source) {
    element('camera').dataset.source = source;
    if (source) element('camera').src = source;
    else element('camera').removeAttribute('src');
  }
  element('camera').hidden = !source;
  element('camera-note').hidden = Boolean(source) && Boolean(element('camera').naturalWidth);
  element('camera-note').textContent = source ? 'Waiting for camera frames…' : 'No camera';
}
function showBattery() {
  const battery = connection.telemetry.battery?.data;
  element('battery').textContent =
    battery?.percentage != null
      ? `Battery ${Math.round(battery.percentage * 100)}%`
      : battery?.voltage != null
        ? `Battery ${battery.voltage.toFixed(1)} V`
        : 'Battery —';
  element('battery').dataset.state =
    battery?.percentage != null && battery.percentage < 0.2 ? 'low' : '';
}
setInterval(() => {
  const image = element('camera');
  if (image.dataset.source) {
    element('camera-note').hidden = Boolean(image.naturalWidth);
    if (!image.naturalWidth) element('camera-note').textContent = 'No frames from the robot yet';
  }
}, 1000);
for (const name of ['connection', 'robots', 'select']) connection.addEventListener(name, render);
connection.addEventListener('distances', () =>
  status.distances(connection.distances[connection.selected]),
);
connection.addEventListener('telemetry', showBattery);
connection.addEventListener('select', () => status.clearLeds());
render();
showBattery();
status.distances();
