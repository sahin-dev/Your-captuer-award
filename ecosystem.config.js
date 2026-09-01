module.exports = {
  apps: [
    {
      name: "api",
      script: "./dist/server.js",
      exec_mode: "fork",
       // Allocates 4GB heap size to the V8 engine
      node_args: "--max-old-space-size=4096",
      
      // Restarts the app gracefully at 4.2GB to prevent hard crashes
      max_memory_restart: "4200M",
      instances: 1,
      autorestart: true,
      watch: false,

      // Restart resilience: back off between rapid restarts instead of
      // hammering a still-unreachable DB, but keep a generous restart
      // budget so an extended outage (e.g. an Atlas DNS/network blip)
      // doesn't exhaust PM2's default restart limit and leave the app
      // dead until someone manually restarts it.
      min_uptime: "10s",
      max_restarts: 50,
      exp_backoff_restart_delay: 100,

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
