import { readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    {
      name: "compressed-world-bundle",
      async writeBundle() {
        for (const name of (await readdir("web/build")).filter((name) =>
          name.endsWith(".js"),
        )) {
          const path = "web/build/" + name,
            data = await readFile(path);
          await Promise.all([
            writeFile(path + ".gz", gzipSync(data)),
            writeFile(path + ".br", brotliCompressSync(data)),
          ]);
        }
      },
    },
  ],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "web/build",
    emptyOutDir: true,
    lib: {
      entry: "web/js/isoworld/entry.jsx",
      formats: ["es"],
      fileName: () => "isoworld.js",
    },
    rollupOptions: { output: { assetFileNames: "[name].[ext]" } },
  },
});
