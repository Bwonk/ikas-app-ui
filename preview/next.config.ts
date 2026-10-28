import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { NextConfig } from "next"

const repoRoot = path.join(import.meta.dirname, "..")

// Everything the preview build reads. Build output, caches, files Next rewrites and
// registry/rules (excluded from Tailwind in globals.css, never imported) are left out.
const BUILD_INPUTS = ["preview", "registry", "demos", "examples", "package.json", "pnpm-lock.yaml", "tsconfig.json"]
const SKIP = new Set(["out", ".next", "node_modules", "next-env.d.ts", "registry/rules"])

function listFiles(rel: string): string[] {
  const abs = path.join(repoRoot, rel)
  const entries = readdirSync(abs, { withFileTypes: true })
  return entries
    .map((entry) => ({ entry, child: path.posix.join(rel, entry.name) }))
    .filter(({ entry, child }) => !entry.name.startsWith(".") && !SKIP.has(entry.name) && !SKIP.has(child))
    // Code-unit order, not localeCompare: the hash must not depend on the machine's locale.
    .sort((a, b) => (a.child < b.child ? -1 : a.child > b.child ? 1 : 0))
    .flatMap(({ entry, child }) => (entry.isDirectory() ? listFiles(child) : [child]))
}

/**
 * Next.js picks a random build ID per build and writes it into every exported page,
 * so each builders sync touched every file in public/ui-preview. Hashing the inputs
 * keeps the output byte-identical until something the preview reads changes.
 */
function inputHash() {
  const hash = createHash("sha256")
  for (const input of BUILD_INPUTS) {
    const files = input.includes(".") ? [input] : listFiles(input)
    for (const file of files) {
      hash.update(file).update("\0").update(readFileSync(path.join(repoRoot, file))).update("\0")
    }
  }
  return hash.digest("hex").slice(0, 20)
}

/**
 * Static preview pages embedded by builders.ikas.com via iframe.
 * Output is copied into builders' public/ui-preview, hence the basePath.
 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/ui-preview",
  trailingSlash: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  allowedDevOrigins: ["*.trycloudflare.com"],
  generateBuildId: inputHash,
}

export default nextConfig
