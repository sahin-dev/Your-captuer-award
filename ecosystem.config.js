module.exports = {
  apps: [
    {
      name: "api",
      script: "./dist/server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
