import { readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";
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
