#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = "out";
const basePath = process.env.LANDING_BASE_PATH ?? "";
const defaultLocale = process.env.LANDING_DEFAULT_LOCALE ?? "en";
const target = `${basePath}/${defaultLocale}/`;

const html = `<!doctype html>
<html lang="${defaultLocale}">
<head>
<meta charset="utf-8">
<title>Paperloom</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)})</script>
<style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0a0a0a;color:#fafafa;display:grid;place-items:center;min-height:100vh;margin:0}a{color:inherit}</style>
</head>
<body>
<p>Redirecting to <a href="${target}">Paperloom</a>…</p>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html, "utf8");
writeFileSync(join(outDir, "404.html"), html, "utf8");
console.log(`Wrote ${outDir}/index.html and 404.html → ${target}`);
