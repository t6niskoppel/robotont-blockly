// The status in the header of every page: the connection, the robot and its battery.
const element = (id) => document.getElementById(id);
const generations = { 3: 'Gen 3', '3lite': 'Gen 3 Lite' };
const number = (value, digits) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

export function bindHeader(connection) {
  const render = () => {
    const robot = connection.robot;
    element('online').classList.toggle('connected', connection.connected && Boolean(robot));
    element('connection').textContent = !connection.connected
      ? 'Disconnected from rosbridge'
      : robot
        ? `Connected to ${robot.name}`
        : 'No robot found';
    element('robot-detail').textContent = robot
      ? (generations[robot.generation] || 'Robotont') + (robot.ns ? ` · ${robot.ns}` : '')
      : '';

    const reading = connection.telemetry.battery;
    const battery = reading && performance.now() - reading.at < 2000 ? reading.data : null;
    let detail;
    element('battery').textContent = '—';
    element('battery').dataset.state = '';
    if (!battery) {
      detail = 'No fresh battery data';
    } else if (battery.invalid) {
      detail = `No valid reading from the robot (it reports ${number(battery.rawVoltage, 1)} V)`;
    } else if (!battery.present) {
      detail = 'Battery not present';
    } else {
      element('battery').textContent =
        battery.percentage === null
          ? `${number(battery.voltage, 1)} V`
          : `${Math.round(battery.percentage * 100)}%`;
      element('battery').dataset.state =
        battery.percentage !== null && battery.percentage < 0.2 ? 'low' : '';
      detail = `${number(battery.voltage, 1)} V`;
      if (battery.temperature !== null) detail += ` · ${number(battery.temperature, 1)} °C`;
    }
    element('battery-detail').textContent = detail;
    element('battery-detail').title = detail;
  };
  for (const name of ['connection', 'robots', 'select', 'telemetry'])
    connection.addEventListener(name, render);
  setInterval(render, 1000); // a battery reading that stops arriving goes stale
  render();
}
