#!/usr/bin/env node
import { main } from "./main.js";

main(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`linkdoc: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  },
);
