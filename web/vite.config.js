import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The browser talks straight to rosbridge (9090), web_video_server (8080) and ttyd (7681) on the
// machine that runs the ROS stack; this server only hosts the pages.

export default defineConfig({
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        blockly: resolve(import.meta.dirname, 'blockly/index.html'),
        status: resolve(import.meta.dirname, 'status/index.html'),
        viewer: resolve(import.meta.dirname, 'viewer.html'),
      },
    },
  },
});
