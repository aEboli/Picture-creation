import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function readOption(names) {
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    for (const name of names) {
      if (arg === name) {
        return process.argv[index + 1];
      }
      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }

  return undefined;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function syncRuntimeAsset(source, target) {
  if (!(await pathExists(source))) {
    return;
  }

  await fs.rm(target, { force: true, recursive: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneServer = path.join(standaloneRoot, "server.js");

if (!(await pathExists(standaloneServer))) {
  console.error("Missing standalone server entry: .next/standalone/server.js");
  console.error("Run `npm run build` before `npm start`.");
  process.exit(1);
}

const port = readOption(["--port", "-p"]) || process.env.PORT || "3000";
const hostname = readOption(["--hostname", "--host", "-H"]) || process.env.HOSTNAME || "127.0.0.1";
const dataDir = process.env.PICTURE_CREATION_DATA_DIR || process.env.COMMERCE_STUDIO_DATA_DIR || path.join(projectRoot, "data");

await fs.mkdir(dataDir, { recursive: true });
await syncRuntimeAsset(path.join(projectRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"));
await syncRuntimeAsset(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"));

const child = spawn(process.execPath, [standaloneServer], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "production",
    PORT: String(port),
    HOSTNAME: hostname,
    PICTURE_CREATION_DATA_DIR: dataDir,
    COMMERCE_STUDIO_DATA_DIR: dataDir,
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
