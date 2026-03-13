const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

function timestamp() {
  return new Date().toLocaleTimeString();
}

async function main() {
  console.log(`[${timestamp()}] 🔨 Shanks: Starting build...`);

  const extensionContext = await esbuild.context({
    entryPoints: ["src/extension/main.ts"],
    bundle: true,
    format: "cjs",
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    external: ["vscode"],
    platform: "node",
    outfile: "dist/extension.js",
    logLevel: "warning",
  });

  const webviewContext = await esbuild.context({
    entryPoints: ["src/webview/index.tsx"],
    bundle: true,
    format: "esm",
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    platform: "browser",
    outfile: "dist/webview.js",
    logLevel: "warning",
  });

  const voiceClientContext = await esbuild.context({
    entryPoints: ["src/voice/client/entry.ts"],
    bundle: true,
    format: "iife", // IIFE for direct script tag loading
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    platform: "browser",
    outfile: "dist/voice-app.js",
    logLevel: "warning",
    define: {
      "process.env.BUILD_VERSION": JSON.stringify(new Date().toISOString()),
    },
  });

  if (watch) {
    await extensionContext.watch();
    await webviewContext.watch();
    await voiceClientContext.watch();
    console.log(`[${timestamp()}] 👀 Shanks: Watching for changes... (Ctrl+C to stop)`);
  } else {
    await extensionContext.rebuild();
    await webviewContext.rebuild();
    await voiceClientContext.rebuild();
    await extensionContext.dispose();
    await webviewContext.dispose();
    await voiceClientContext.dispose();
    console.log(`[${timestamp()}] ✅ Shanks: Build complete.`);
  }
}

main().catch((e) => {
  console.error(`[${timestamp()}] ❌ Shanks: Build failed.`, e.message ?? e);
  process.exit(1);
});
