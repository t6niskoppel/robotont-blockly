// Top view of the robot: a ring of lights with the colours the program sent, and the obstacle
// distance on each side. Front is up. It shows commands, not what the LED module displays.
const SVG = 'http://www.w3.org/2000/svg';
const PIXELS = 60;
const RANGE = 2; // metres shown by the distance arcs
const SIDES = { front: 0, left: 90, back: 180, right: 270 }; // degrees, counter-clockwise from up

const create = (name, attributes, parent) => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
};
const point = (degrees, radius) => {
  const a = ((degrees + 90) * Math.PI) / 180;
  return [radius * Math.cos(a), -radius * Math.sin(a)];
};
const sideOf = (degrees) =>
  Object.keys(SIDES).find((side) => Math.abs(((degrees - SIDES[side] + 540) % 360) - 180) <= 45) ||
  'front';

export class StatusView {
  constructor(svg) {
    this.arcs = {};
    this.labels = {};
    for (const [side, angle] of Object.entries(SIDES)) {
      this.arcs[side] = create('path', { class: 'range' }, svg);
      const [x, y] = point(angle, side === 'left' || side === 'right' ? 98 : 106);
      const anchor = { left: 'end', right: 'start' }[side] || 'middle';
      this.labels[side] = create(
        'text',
        { x, y: y + 4, 'text-anchor': anchor, class: 'distance' },
        svg,
      );
    }
    create('circle', { r: 56, class: 'body' }, svg);
    create('path', { d: 'M0 -42 L12 -24 L-12 -24 Z', class: 'front' }, svg);
    this.pixels = [];
    for (let i = 0; i < PIXELS; i++) {
      const degrees = (i * 360) / PIXELS + 3;
      const [x, y] = point(degrees, 64);
      this.pixels.push({
        side: sideOf(degrees),
        node: create('circle', { cx: x, cy: y, r: 3.4, class: 'pixel' }, svg),
      });
    }
  }
  led(side, color) {
    for (const pixel of this.pixels)
      if (side === 'all' || pixel.side === side)
        pixel.node.style.fill = color === '#000000' ? '' : color;
  }
  clearLeds() {
    this.led('all', '#000000');
  }
  distances(readings) {
    for (const [side, angle] of Object.entries(SIDES)) {
      const reading = readings?.[side];
      const label = this.labels[side];
      const arc = this.arcs[side];
      if (!reading?.available) {
        label.textContent = '—';
        label.dataset.state = 'none';
        arc.setAttribute('d', '');
        continue;
      }
      const metres = reading.value;
      label.textContent = `${metres.toFixed(2)}${reading.clear ? '+' : ''} m`;
      label.dataset.state = metres < 0.4 ? 'near' : metres < 1 ? 'mid' : 'far';
      const radius = 70 + Math.min(metres, RANGE) * (22 / RANGE);
      const [x1, y1] = point(angle - 30, radius);
      const [x2, y2] = point(angle + 30, radius);
      arc.setAttribute('d', `M${x1} ${y1} A${radius} ${radius} 0 0 0 ${x2} ${y2}`);
      arc.dataset.state = label.dataset.state;
    }
  }
}
