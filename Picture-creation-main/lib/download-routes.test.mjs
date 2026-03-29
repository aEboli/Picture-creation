import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compileTsModule(filePath, stubs) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (specifier) => {
        if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
          return stubs[specifier];
        }
        if (specifier === "node:path") {
          return path;
        }
        if (specifier === "node:stream") {
          return {
            Readable: {
              toWeb(stream) {
                return stream;
              },
            },
          };
        }
        throw new Error(`Missing stub for import "${specifier}" while evaluating ${filePath}`);
      },
      __filename: filePath,
      __dirname: path.dirname(filePath),
      console,
      process,
      Buffer,
      Headers: HeadersStub,
      URL,
      URLSearchParams,
    },
    { filename: filePath },
  );

  return module.exports;
}

class HeadersStub {
  constructor(init = undefined) {
    this.map = new Map();

    if (init instanceof HeadersStub) {
      for (const [key, value] of init.entries()) {
        this.set(key, value);
      }
      return;
    }

    if (init && typeof init[Symbol.iterator] === "function" && !Array.isArray(init)) {
      for (const [key, value] of init) {
        this.set(key, value);
      }
      return;
    }

    if (Array.isArray(init)) {
      for (const [key, value] of init) {
        this.set(key, value);
      }
      return;
    }

    if (init && typeof init === "object") {
      for (const [key, value] of Object.entries(init)) {
        this.set(key, value);
      }
    }
  }

  set(key, value) {
    this.map.set(String(key).toLowerCase(), String(value));
  }

  get(key) {
    return this.map.get(String(key).toLowerCase()) ?? null;
  }

  entries() {
    return this.map.entries();
  }
}

class NextResponseStub {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new HeadersStub(init.headers);
  }

  static json(body, init = {}) {
    return new NextResponseStub(body, init);
  }
}

test("asset download route honors filename override when download=1", async () => {
  const routePath = path.join(projectRoot, "app", "api", "assets", "[assetId]", "route.ts");
  const sharpStub = () => ({
    rotate() {
      return this;
    },
    resize() {
      return this;
    },
    webp() {
      return this;
    },
    async toBuffer() {
      return Buffer.from("optimized");
    },
  });
  sharpStub.cache = () => {};

  const routeModule = compileTsModule(routePath, {
    "next/server": {
      NextResponse: NextResponseStub,
    },
    "node:fs": {
      existsSync() {
        return true;
      },
      createReadStream(filePath) {
        return { filePath };
      },
    },
    sharp: sharpStub,
    "@/lib/server/assets/service": {
      getAssetOrThrow() {
        return {
          id: "asset_1",
          originalName: "generated-image",
          mimeType: "image/png",
          filePath: "C:/fake/generated-image",
        };
      },
      AssetServiceError: class AssetServiceError extends Error {
        constructor(message, status = 404) {
          super(message);
          this.status = status;
        }
      },
    },
    "@/lib/utils": {
      mimeToExtension() {
        return "png";
      },
    },
    "@/lib/download-filenames": {
      inferDownloadName() {
        return "generated-image.png";
      },
      makeContentDisposition(filename) {
        return `attachment; filename="${filename}"`;
      },
      sanitizeDownloadFilename(filename) {
        return filename;
      },
    },
  });

  const response = await routeModule.GET(
    {
      nextUrl: {
        searchParams: new URLSearchParams("download=1&filename=%E7%94%B5%E5%8A%A8%E5%9B%9B%E8%8A%82%E9%B1%BC%E9%A5%B5-%E5%9C%BA%E6%99%AF%E5%9B%BE-4K-1x1.png"),
      },
    },
    { params: Promise.resolve({ assetId: "asset_1" }) },
  );

  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="电动四节鱼饵-场景图-4K-1x1.png"',
  );
});

test("all-images download route zips every successful generated image with deduped filenames", async () => {
  const routePath = path.join(projectRoot, "app", "api", "jobs", "[id]", "all-images-download", "route.ts");
  const captured = { entries: null };

  const routeModule = compileTsModule(routePath, {
    "next/server": {
      NextResponse: NextResponseStub,
    },
    "node:fs/promises": {
      async readFile(filePath) {
        return Buffer.from(`content:${filePath}`);
      },
    },
    fflate: {
      zipSync(entries) {
        captured.entries = entries;
        return new Uint8Array([1, 2, 3]);
      },
    },
    "@/lib/server/jobs/queries": {
      getJobDetailsOrThrow() {
        return {
          job: {
            id: "job_1",
            productName: "任务图片名",
            creationMode: "standard",
          },
          sourceAssets: [
            { id: "source_1", originalName: "第一张原图.png" },
            { id: "source_2", originalName: "第二张原图.png" },
          ],
          items: [
            {
              id: "item_1",
              sourceAssetName: "第一张原图.png",
              imageType: "scene",
              ratio: "1:1",
              resolutionLabel: "4K",
              generatedAsset: {
                originalName: "generated-1",
                mimeType: "image/png",
                filePath: "C:/fake/generated-1",
              },
            },
            {
              id: "item_2",
              sourceAssetName: "第一张原图.png",
              imageType: "scene",
              ratio: "1:1",
              resolutionLabel: "4K",
              generatedAsset: {
                originalName: "generated-2",
                mimeType: "image/png",
                filePath: "C:/fake/generated-2",
              },
            },
            {
              id: "item_3",
              sourceAssetName: "第二张原图.png",
              imageType: "detail",
              ratio: "4:5",
              resolutionLabel: "2K",
              generatedAsset: {
                originalName: "generated-3",
                mimeType: "image/jpeg",
                filePath: "C:/fake/generated-3",
              },
            },
            {
              id: "item_4",
              sourceAssetName: "第二张原图.png",
              imageType: "detail",
              ratio: "4:5",
              resolutionLabel: "2K",
              generatedAsset: null,
            },
          ],
        };
      },
      JobQueryError: class JobQueryError extends Error {
        constructor(message, status = 404) {
          super(message);
          this.status = status;
        }
      },
    },
    "@/lib/download-filenames": {
      buildAllImagesZipName(sourceAssetNames) {
        return `${sourceAssetNames[0].replace(/\.[^.]+$/, "")}-all-images.zip`;
      },
      buildGeneratedImageDownloadName({ sourceAssetName, imageType, resolutionLabel, ratio, mimeType }) {
        const extension = mimeType === "image/jpeg" ? ".jpg" : ".png";
        const typeLabel = imageType === "detail" ? "细节图" : "场景图";
        return `${sourceAssetName.replace(/\.[^.]+$/, "")}-${typeLabel}-${resolutionLabel}-${ratio.replace(":", "x")}${extension}`;
      },
      dedupeDownloadFilenames(filenames) {
        const seen = new Map();
        return filenames.map((filename) => {
          const count = (seen.get(filename) ?? 0) + 1;
          seen.set(filename, count);
          if (count === 1) {
            return filename;
          }
          return filename.replace(/(\.[^.]+)$/, `_${String(count).padStart(2, "0")}$1`);
        });
      },
      makeContentDisposition(filename) {
        return `attachment; filename="${filename}"`;
      },
    },
    "@/lib/utils": {
      mimeToExtension(mimeType) {
        return mimeType === "image/jpeg" ? "jpg" : "png";
      },
    },
  });

  const response = await routeModule.GET(
    {
      url: "http://localhost/api/jobs/job_1/all-images-download?language=zh",
    },
    { params: Promise.resolve({ id: "job_1" }) },
  );

  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="第一张原图-all-images.zip"');
  assert.deepEqual(Object.keys(captured.entries), [
    "全部图片/第一张原图-场景图-4K-1x1.png",
    "全部图片/第一张原图-场景图-4K-1x1_02.png",
    "全部图片/第二张原图-细节图-2K-4x5.jpg",
  ]);
});
