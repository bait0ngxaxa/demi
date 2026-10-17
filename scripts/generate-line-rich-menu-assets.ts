import { readdir, readFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { createLineRichMenuAssetManifest } from "./line-rich-menu-asset-manifest";
import { assertBundledLineRichMenuFont } from "./line-rich-menu-font";
import { LINE_RICH_MENU_CANVAS, renderLineRichMenuImage } from "./line-rich-menu-renderer";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIRECTORY = "public/line/rich-menus";
const EXPECTED_ASSET_COUNT = 18;
const MAX_ASSET_BYTES = 1024 * 1024;

type GeneratorOptions = {
  outputDirectory: string;
  assetFiles: string[];
  checkOnly: boolean;
};

function parseArguments(args: readonly string[]): GeneratorOptions {
  const options: GeneratorOptions = {
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    assetFiles: [],
    checkOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--output") {
      const outputDirectory = args[index + 1];
      if (!outputDirectory) throw new Error("--output requires a directory path.");
      options.outputDirectory = outputDirectory;
      index += 1;
    } else if (argument === "--asset-file") {
      const assetFile = args[index + 1];
      if (!assetFile) throw new Error("--asset-file requires a catalog asset filename.");
      options.assetFiles.push(assetFile);
      index += 1;
    } else if (argument === "--check") {
      options.checkOnly = true;
    } else {
      throw new Error(`Unknown Rich Menu asset generator argument: ${argument}`);
    }
  }
  return options;
}

async function validatePng(assetFile: string, image: Buffer): Promise<void> {
  const metadata = await sharp(image).metadata();
  if (metadata.format !== "png" ||
    metadata.width !== LINE_RICH_MENU_CANVAS.width ||
    metadata.height !== LINE_RICH_MENU_CANVAS.height) {
    throw new Error(`${assetFile} is not a ${LINE_RICH_MENU_CANVAS.width}×${LINE_RICH_MENU_CANVAS.height} PNG.`);
  }
  if (image.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`${assetFile} exceeds the 1 MiB LINE Rich Menu limit.`);
  }
}

async function assertExactCatalogFiles(
  outputDirectory: string,
  expectedFiles: readonly string[],
): Promise<void> {
  const existingFiles = (await readdir(outputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort();
  const sortedExpectedFiles = [...expectedFiles].sort();
  if (existingFiles.length !== sortedExpectedFiles.length ||
    existingFiles.some((file, index) => file !== sortedExpectedFiles[index])) {
    throw new Error(
      `Rich Menu PNG directory does not match the catalog. Expected: ${sortedExpectedFiles.join(", ")}; found: ${existingFiles.join(", ")}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const manifest = createLineRichMenuAssetManifest();
  if (manifest.length !== EXPECTED_ASSET_COUNT) {
    throw new Error(`Expected ${EXPECTED_ASSET_COUNT} Rich Menu catalog entries; found ${manifest.length}.`);
  }

  const availableFiles = new Set(manifest.map((menu) => menu.assetFile));
  if (availableFiles.size !== EXPECTED_ASSET_COUNT) {
    throw new Error("Rich Menu catalog asset filenames must be unique.");
  }
  const unknownFiles = options.assetFiles.filter((assetFile) => !availableFiles.has(assetFile));
  if (unknownFiles.length > 0) {
    throw new Error(`Unknown Rich Menu asset file requested: ${unknownFiles.join(", ")}`);
  }

  assertBundledLineRichMenuFont();
  if (!sharp.versions.pango || !sharp.versions.harfbuzz) {
    throw new Error("Rich Menu asset generation requires Sharp with Pango and HarfBuzz support.");
  }

  const selectedMenus = options.assetFiles.length === 0
    ? manifest
    : manifest.filter((menu) => options.assetFiles.includes(menu.assetFile));
  const outputDirectory = resolve(REPOSITORY_ROOT, options.outputDirectory);
  const generated = [] as Array<{ assetFile: string; image: Buffer }>;

  for (const menu of selectedMenus) {
    const image = await renderLineRichMenuImage(menu);
    await validatePng(menu.assetFile, image);
    generated.push({ assetFile: menu.assetFile, image });
  }

  if (options.checkOnly) {
    for (const asset of generated) {
      let committedImage: Buffer;
      try {
        committedImage = await readFile(resolve(outputDirectory, asset.assetFile));
      } catch {
        throw new Error(`${asset.assetFile} is missing. Regenerate the Rich Menu assets.`);
      }
      if (!asset.image.equals(committedImage)) {
        throw new Error(`${asset.assetFile} differs from deterministic generator output.`);
      }
    }
    if (options.assetFiles.length === 0) {
      await assertExactCatalogFiles(outputDirectory, manifest.map((menu) => menu.assetFile));
    }
    process.stdout.write(`Verified ${generated.length} Rich Menu PNG assets against generated output.\n`);
    return;
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const asset of generated) {
    await writeFile(resolve(outputDirectory, asset.assetFile), asset.image);
  }
  if (options.assetFiles.length === 0) {
    const expectedFiles = new Set(manifest.map((menu) => menu.assetFile));
    const obsoletePngs = (await readdir(outputDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png") && !expectedFiles.has(entry.name))
      .map((entry) => resolve(outputDirectory, entry.name));
    await Promise.all(obsoletePngs.map((filePath) => unlink(filePath)));
  }

  for (const asset of generated) {
    process.stdout.write(`${asset.assetFile}\t${asset.image.byteLength} bytes\n`);
  }
  process.stdout.write(`Generated ${generated.length} Rich Menu PNG assets in ${outputDirectory}.\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Rich Menu asset generation failed: ${message}\n`);
  process.exitCode = 1;
});
