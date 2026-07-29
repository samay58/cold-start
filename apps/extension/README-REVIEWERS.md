# Cold Start source package for AMO reviewers

This archive contains the complete source needed to rebuild the submitted Firefox
extension byte for byte. The extension workspace is `apps/extension`; it compiles
TypeScript source from the sibling workspaces `packages/core` and `packages/ui`.
The other `package.json` files exist only so `npm ci` can resolve the workspace
lockfile; their source is not part of the extension build.

## Build environment

- OS: Ubuntu 24.04 LTS (ARM64 or x86_64; output is architecture-independent)
- Node.js 24.14.0
- npm 11.9.0

This matches the default reviewer environment. No other system tools are needed.

## Build steps

From the archive root:

```bash
npm ci
VITE_COLD_START_API_ORIGIN=https://cold-start-samay58s-projects.vercel.app \
VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=false \
VITE_COLD_START_ALPHA_INVITE_ORIGIN=https://cold-start.semitechie.vc \
NODE_ENV=production \
npm run build:firefox -w @cold-start/extension
```

The three `VITE_` values are public origins baked into the bundle; they are not
secrets. They are pinned on the command line so the build does not depend on any
local environment file.

## Output to diff

The build writes the unpacked extension to `apps/extension/dist-firefox/`.
Comparing every file in that directory against the contents of the submitted XPI
should show no differences. The bundle is minified by Vite's default esbuild
pass; nothing is obfuscated.
