import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

it("uses the shared light header family throughout the app shell", () => {
  const offenders = readdirSync(join(process.cwd(), "app", "app"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name)
      && !/\.(?:test|spec)\./u.test(entry.name))
    .flatMap((entry) => {
      const file = join(entry.parentPath, entry.name);
      const source = readFileSync(file, "utf8");
      const path = relative(process.cwd(), file).replaceAll("\\", "/");
      const home = path === "app/app/page.tsx" || path === "app/app/personal/patient-personal-home.tsx";
      const boundary = /^(?:error|not-found)\.tsx$/u.test(entry.name);

      return [
        !boundary && /<h1(?=[\s/>])/u.test(source) && `${path}: use PageHeader or HomeHero`,
        /\bbg-brand-deep\b/u.test(source) && `${path}: use the header surface instead of bg-brand-deep`,
        !home && /<HomeHero(?=[\s/>])/u.test(source) && `${path}: HomeHero is reserved for the two home pages`,
      ].filter(Boolean);
    });

  expect(offenders).toEqual([]);
});
