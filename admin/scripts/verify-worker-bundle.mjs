import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.argv[2] ?? "dist");
const entries = await readdir(outputDirectory, { recursive: true, withFileTypes: true });
const scripts = entries.filter((entry) => entry.isFile() && /\.(?:m?js)$/.test(entry.name));
if (scripts.length === 0) throw new Error(`No Worker JavaScript bundle found in ${outputDirectory}`);

for (const entry of scripts) {
  const source = await readFile(resolve(entry.parentPath, entry.name), "utf8");
  if (/\beval\s*\(/.test(source) || /\bnew\s+Function\s*\(/.test(source)) {
    throw new Error(`Worker bundle ${entry.name} contains runtime code generation`);
  }
}
