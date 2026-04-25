import { spawn } from "node:child_process";
import process from "node:process";

const commands = [
  {
    name: "api",
    command: process.execPath,
    args: ["server/index.js"],
  },
  {
    name: "admin",
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev:admin"],
  },
];

const children = [];
let shuttingDown = false;

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const { name, command, args } of commands) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(`${name} process exited${signal ? ` from ${signal}` : ` with code ${code}`}.`);
    stopAll();
    process.exit(code ?? 1);
  });
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
});
