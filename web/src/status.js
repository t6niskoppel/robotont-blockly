import './style.css';
import './site.css';
import { RobotConnection } from './ros_connection.js';

const TERMINAL_PORT = Number(new URLSearchParams(location.search).get('terminal')) || 7681;
const element = (id) => document.getElementById(id);
const connection = new RobotConnection();

function render() {
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
      (robot.ns ? ` · namespace ${robot.ns}` : '') +
      (robot.led ? ' · LED module' : '')
    : 'Waiting for a robot on this ROS domain';
  const rows = Object.entries(robot?.topics || {}).map(([role, topic]) => {
    const row = document.createElement('tr'),
      name = document.createElement('th'),
      value = document.createElement('td');
    name.textContent = role;
    value.textContent = topic;
    row.append(name, value);
    return row;
  });
  element('topics').replaceChildren(...rows);
  element('topics-count').textContent = rows.length;
}
for (const name of ['connection', 'robots', 'select']) connection.addEventListener(name, render);
render();

element('terminal-toggle').onclick = () => {
  const frame = element('terminal'),
    open = frame.hidden;
  frame.hidden = !open;
  if (open) frame.src = `http://${location.hostname}:${TERMINAL_PORT}/`;
  else frame.removeAttribute('src');
  element('terminal-toggle').textContent = open ? 'Close terminal' : 'Open terminal';
};
