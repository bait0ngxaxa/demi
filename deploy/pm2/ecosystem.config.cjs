// PM2 process definition for the single production VPS (docs/operations/DEPLOY_VPS.md).
//
//   pm2 start /srv/demi/current/deploy/pm2/ecosystem.config.cjs
//   pm2 startOrReload /srv/demi/current/deploy/pm2/ecosystem.config.cjs   # after switching the release
//
// Exactly ONE instance in fork mode for the MVP. Several Next.js processes would each generate their own
// Server Action encryption key and build-scoped action IDs, so a form rendered by one process could fail
// on another; running more than one needs NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, a shared deploymentId and
// a shared cache, none of which this deployment provides. The scheduler tick also assumes one target.
//
// Secrets are not in this file and are not passed through PM2's env (they would land in ~/.pm2/dump.pm2):
// Node loads them itself from the env file via --env-file, and fails to start if the file is missing.

const APP_DIRECTORY = "/srv/demi/current";
const ENV_FILE = "/etc/demi/demi.env";
const LOG_DIRECTORY = "/var/log/demi";

module.exports = {
  apps: [
    {
      name: "demi",
      cwd: APP_DIRECTORY,
      // Absolute through the release symlink; pm2 startOrReload re-reads it after each switch.
      script: `${APP_DIRECTORY}/node_modules/next/dist/bin/next`,
      args: "start --hostname 127.0.0.1 --port 3000",
      interpreter: "node",
      node_args: `--env-file=${ENV_FILE}`,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      // Next.js runs pending after() callbacks (LINE reactive replies, Rich Menu reconciliation) on
      // SIGINT/SIGTERM when it may drain; those replies have no durable retry. PM2's default 1.6 s
      // would SIGKILL them, so allow 30 s (the upper end of the Next.js self-hosting guidance).
      kill_timeout: 30000,
      // Startup grace before PM2 counts a restart as failed.
      listen_timeout: 15000,
      // Restart before the VPS starts swapping. Tune to the VPS memory (leave room for nginx and the OS).
      max_memory_restart: "1G",
      out_file: `${LOG_DIRECTORY}/app-out.log`,
      error_file: `${LOG_DIRECTORY}/app-error.log`,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
