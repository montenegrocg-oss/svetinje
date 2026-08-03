import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://svetinje.me",
  output: "static",
  trailingSlash: "always",
  compressHTML: true,
});
