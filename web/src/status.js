import './style.css';
import './site.css';
import ROSLIB from 'roslib';
import { RobotConnection } from './ros_connection.js';

const TERMINAL_PORT = Number(new URLSearchParams(location.search).get('terminal')) || 7681;
const element = (id) => document.getElementById(id);
const connection = new RobotConnection();

// --- Robot summary --------------------------------------------------------------------------------
function renderRobot() {
  const robot = connection.robot;
  element('online').classList.toggle('connected', connection.connected && Boolean(robot));
  element('connection').textContent = !connection.connected
    ? 'Disconnected from rosbridge'
    : robot
      ? `Connected to ${robot.name}`
      : 'No robot found';
  element('robot-title').textContent = robot?.name || 'No robot';
  const generations = { 3: 'Gen 3', '3lite': 'Gen 3 Lite' };
  element('robot-detail').textContent = robot
    ? (generations[robot.generation] || 'Robotont') +
      (robot.ns ? ` \u00b7 namespace ${robot.ns}` : '') +
      (robot.led ? ' \u00b7 LED module' : '')
    : 'Waiting for a robot on this ROS domain';
}
for (const name of ['connection', 'robots', 'select']) connection.addEventListener(name, renderRobot);
renderRobot();

// --- Topic tree -----------------------------------------------------------------------------------
// The bridge surveys every topic in the ROS domain when asked (web/topic_rates) and answers on
// web/topics, so nothing is polled in the background.
let topics = [];
let waiting = null;
const open = new Set();
const result = () => new ROSLIB.Topic({ ros: connection.ros, name: 'web/topics', messageType: 'std_msgs/msg/String' });
const request = () => new ROSLIB.Topic({ ros: connection.ros, name: 'web/topic_rates', messageType: 'std_msgs/msg/String' });
let subscription = null;

function tree() {
  const root = { children: new Map(), path: '' };
  for (const topic of topics) {
    let node = root;
    for (const part of topic.name.split('/').filter(Boolean)) {
      if (!node.children.has(part))
        node.children.set(part, { name: part, children: new Map(), path: `${node.path}/${part}` });
      node = node.children.get(part);
    }
    node.topic = topic;
  }
  return root;
}
function cells(node) {
  const label = document.createElement('span');
  label.className = 'tree-name';
  label.textContent = node.name;
  const info = [node.topic?.type?.replace('/msg/', '/') ?? ''];
  info.push(node.topic ? (node.topic.hz === null ? '\u2014' : `${node.topic.hz} Hz`) : '');
  info.push(node.topic ? `${node.topic.publishers} pub \u00b7 ${node.topic.subscribers} sub` : '');
  return [label, ...info.map((text) => Object.assign(document.createElement('span'), { textContent: text }))];
}
function branch(node, depth = 0) {
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.style.setProperty('--depth', depth);
  if (!node.children.size) {
    row.append(...cells(node));
    return row;
  }
  const group = document.createElement('details');
  group.open = open.has(node.path);
  group.ontoggle = () => (group.open ? open.add(node.path) : open.delete(node.path));
  const summary = document.createElement('summary');
  summary.className = 'tree-row';
  summary.style.setProperty('--depth', depth);
  summary.append(...cells(node));
  group.append(summary, ...[...node.children.values()].sort(byName).map((child) => branch(child, depth + 1)));
  return group;
}
const byName = (a, b) => a.name.localeCompare(b.name);
const groups = (node) => [...node.children.values()].flatMap((c) => (c.children.size ? [c.path, ...groups(c)] : []));
function renderTopics() {
  element('topics').replaceChildren(...[...tree().children.values()].sort(byName).map((node) => branch(node)));
  element('topics-count').textContent = topics.length;
}
function update() {
  if (!connection.connected || waiting) return;
  element('topics-update').disabled = true;
  element('topics-update').textContent = 'Measuring\u2026';
  element('topics-note').textContent = 'Sampling every published topic for a few seconds.';
  waiting = setTimeout(() => {
    finish();
    element('topics-note').textContent = 'The bridge did not answer. Restart it to get the topic list.';
  }, 8000);
  request().publish({ data: 'update' });
}
function finish() {
  clearTimeout(waiting);
  waiting = null;
  element('topics-update').disabled = false;
  element('topics-update').textContent = 'Update';
}
connection.addEventListener('connection', () => {
  if (!connection.connected) return;
  subscription?.unsubscribe();
  subscription = result();
  subscription.subscribe((message) => {
    topics = JSON.parse(message.data);
    finish();
    element('topics-note').textContent = 'Rates are measured for a few seconds when you press Update.';
    renderTopics();
  });
  update();
});
element('topics-update').onclick = update;
element('topics-expand').onclick = () => {
  for (const path of groups(tree())) open.add(path);
  renderTopics();
};
element('topics-collapse').onclick = () => {
  open.clear();
  renderTopics();
};

// --- Terminal -------------------------------------------------------------------------------------
element('terminal-toggle').onclick = () => {
  const frame = element('terminal'),
    opening = frame.hidden;
  frame.hidden = !opening;
  if (opening) frame.src = `http://${location.hostname}:${TERMINAL_PORT}/`;
  else frame.removeAttribute('src');
  element('terminal-toggle').textContent = opening ? 'Close terminal' : 'Open terminal';
};
