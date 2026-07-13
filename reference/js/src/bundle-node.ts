// Node-only entry for the bundle verifier. Keeps `node:fs` out of the browser
// bundle — import from here in CLI / server code only.
import { readFileSync } from "node:fs";
import { verifyBundleBytes, type BundleReport } from "./bundle";

export async function verifyBundleFile(path: string): Promise<BundleReport> {
  const bytes = readFileSync(path);
  return verifyBundleBytes(new Uint8Array(bytes));
}
