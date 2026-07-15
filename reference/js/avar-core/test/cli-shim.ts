// Standalone shim: exercises `packages/bridge/src/commands/verify.ts` directly
// without loading the full CLI (which pulls simple-git, chokidar, etc. that
// this repo doesn't install). Used only by the golden-fixture parity test.
import { runVerify } from "../../cli/src/commands/verify.ts";

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: cli-shim.ts <file.avar.zip>\n");
  process.exit(3);
}
const rc = await runVerify({ file, json: true, quiet: true });
process.exit(rc);
