# robotont-blockly

![ROS 2](https://img.shields.io/badge/ROS2-Jazzy-blue.svg) ![License](https://img.shields.io/badge/License-Apache_2.0-green.svg)

## Overview

Robotont dashboard and Blockly in one frontend. The dashboard is at `/` and Blockly
is at `/blockly/`. Both pages use the separate
[robotont_web_bridge](https://github.com/t6niskoppel/robotont_web_bridge) ROS package.

## Setup

Requires Docker with Compose on Linux, or Node 22.12+ for local development.
From this repository:

```bash
docker compose build webapp
```

Build `robotont_web_bridge` in your ROS workspace separately; follow its README.

## Run 

Start the built frontend without rebuilding:

```bash
docker compose up -d webapp
```

In a separate ROS terminal, source the workspace, set the robot's actual domain
and namespace, and start the bridge. For example:

```bash
source /opt/ros/jazzy/setup.bash
source ~/ros2_ws/install/setup.bash
export ROS_DOMAIN_ID=0
export ROBOTONT_NAMESPACE=rt5
ros2 launch robotont_web_bridge web.launch.py namespace:=rt5 use_sim_time:=false
```

For Gazebo, use its ROS domain and namespace and pass `use_sim_time:=true`.

| Address | Page |
|---|---|
| http://localhost:5174/ | Dashboard |
| http://localhost:5174/blockly/ | Blockly 

The browser connects to rosbridge (9090), web_video_server (8080) and ttyd (7681)
on the same host as the frontend. Use a trusted private network: the bridge
exposes robot controls and a terminal without authentication by default.

Stop the frontend with `docker compose stop webapp` and the bridge with Ctrl+C.
Rebuild the frontend image after changing its source.

## Blockly

Programs start from one **when ▶ Run is pressed** block; loose blocks are greyed
out and do not run. **Stop** or Esc stops the program and the robot, and
Ctrl+Enter runs it. The program is kept in the browser between visits; **Save**
and **Open** exchange it as a JSON file.

**Basic** shows a small block set: move a distance, turn an angle, lights,
wait, repeat, if and obstacle checks. **All blocks** adds timed and continuous
motion, velocity, distance and battery readings, RGB
lights, loops with break, logic, maths, text, variables and functions.

The distance and angle blocks are timed at 0.15 m/s and 0.5 rad/s, so the result
depends on how the robot accelerates. Continuous motion keeps going until a stop
block or the end of the program. Velocity is limited to 0.3 m/s and 1 rad/s.

The ring in the Robot panel shows the light colours the program sent, not what
the LED module displays; the side panel warns when no LED module is listening.



## Source layout

| Path | Contents |
|---|---|
| `web/index.html`, `web/src/main.js`, `web/src/style.css` | Dashboard markup, behavior and styles |
| `web/blockly/index.html`, `web/src/blockly/` | Blockly page, blocks, compiler and runner |
| `web/src/ros_connection.js`, `web/src/robot_control.js` | Shared discovery, sensors and control |
| `web/src/viewer.js`, `web/src/tf.js` | Shared 3D view and sensor transforms |
| `web/test/` | JavaScript regression tests |

Blockly media is copied from the pinned npm dependency before development and
production builds. Generated media, dependencies and build output are ignored.

## License

[Apache 2.0](LICENSE)
