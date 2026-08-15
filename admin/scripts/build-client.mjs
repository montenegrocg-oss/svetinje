import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const adminDirectory = fileURLToPath(new URL("..", import.meta.url));

await rm(new URL("../public", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../public/assets", import.meta.url), { recursive: true });
await build({ absWorkingDir: adminDirectory, entryPoints: ["./client/editor.ts", "./client/route-editor.ts"], bundle: true, format: "esm", platform: "browser", target: "es2022", outdir: "public/assets", minify: true, sourcemap: false, legalComments: "none" });
await cp(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl.css", import.meta.url), new URL("../public/assets/editor.css", import.meta.url));
