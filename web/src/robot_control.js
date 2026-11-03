// Sends commands for the selected robot. The ROS bridge enforces speed limits and a 0.5 s expiry.
import ROSLIB from 'roslib';

export class RobotControl {
  constructor(connection) {
    this.connection = connection;
    const publisher = (name) =>
      new ROSLIB.Topic({
        ros: connection.ros,
        name,
        messageType: 'std_msgs/msg/String',
      });
    this.commandTopic = publisher('web/command');
    this.stopTopic = publisher('web/stop');
    this.ledTopic = publisher('web/led');
    connection.addEventListener('beforeselect', () => this.stop());
    connection.addEventListener('connection', () => {
      if (!connection.connected) this.cancelHeartbeat();
    });
  }

  requireRobot() {
    if (!this.connection.ready) throw new Error('No robot connected');
  }

  cancelHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  drive({ vx, vy, wz }) {
    this.requireRobot();
    this.cancelHeartbeat();
    const robot = this.connection.selected;
    const send = () => {
      if (!this.connection.ready || this.connection.selected !== robot) {
        this.cancelHeartbeat();
        return;
      }
      this.commandTopic.publish({
        data: JSON.stringify({ robot, vx, vy, wz }),
      });
    };
    send();
    this.heartbeat = setInterval(send, 100);
  }

  stop() {
    this.cancelHeartbeat();
    const robot = this.connection.selected;
    if (robot === null || !this.connection.connected) return;
    // The bridge repeats zero velocity for 0.5 s and also stops on command expiry.
    this.stopTopic.publish({ data: JSON.stringify({ robot }) });
  }

  move(direction, speed) {
    const velocities = {
      front: { vx: speed, vy: 0, wz: 0 },
      back: { vx: -speed, vy: 0, wz: 0 },
      left: { vx: 0, vy: speed, wz: 0 },
      right: { vx: 0, vy: -speed, wz: 0 },
    };
    if (!velocities[direction]) throw new Error('Unknown movement direction');
    this.drive(velocities[direction]);
  }

  turn(direction, speed) {
    if (!['left', 'right'].includes(direction)) throw new Error('Unknown turn direction');
    this.drive({ vx: 0, vy: 0, wz: direction === 'left' ? speed : -speed });
  }

  led(side, color) {
    this.requireRobot();
    this.ledTopic.publish({
      data: JSON.stringify({ robot: this.connection.selected, side, color }),
    });
  }

  distance(direction) {
    return this.connection.distance(direction);
  }

  pose() {
    const odom = this.fresh('odom', 'Odometry');
    return { x: odom.x, y: odom.y, yaw: odom.yaw };
  }

  battery() {
    const percentage = this.fresh('battery', 'Battery').percentage;
    if (percentage === null) throw new Error('The battery level is unknown');
    return Math.round(percentage * 100);
  }

  fresh(key, label) {
    this.requireRobot();
    const reading = this.connection.telemetry[key];
    if (!reading || performance.now() - reading.at > 2000)
      throw new Error(`${label} is unavailable`);
    return reading.data;
  }
}
