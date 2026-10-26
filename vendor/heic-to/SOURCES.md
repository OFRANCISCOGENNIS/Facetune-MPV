# Bundled HEIC decoder

- Package: heic-to 1.6.6, LGPL-3.0-or-later; Copyright Hopper Gee and upstream contributors.
- Unmodified file: dist/iife/heic-to.js from the published npm archive, copied as heic-to.js.
- Source/package: https://registry.npmjs.org/heic-to/-/heic-to-1.6.6.tgz
- Repository: https://github.com/hoppergee/heic-to (source for the wrapper, worker and esbuild.mjs build recipe).
- The upstream README distributed here states libheif 1.23.6. Original C/C++ source: https://github.com/strukturag/libheif/tree/v1.23.6 . Build instructions: upstream build-emscripten.sh and the distributed UPSTREAM-README.md.
- The upstream build recipe refers to libde265 1.0.16: https://github.com/strukturag/libde265/tree/v1.0.16 .
- License texts: LICENSE (heic-to LGPL), libheif-COPYING and libde265-COPYING (full LGPLv3/GPLv3 and included MIT notices).
- Exact registry integrity and file SHA-256 are in provenance.json. The npm archive was fetched using npm with its normal TLS/integrity verification.

To replace/recombine the decoder, put an interface-compatible IIFE at vendor/heic-to/heic-to.js (global HeicTo({blob,type:'bitmap'}) returning a Promise<ImageBitmap>), then run python3 scripts/build_web.py from the repository root. Both the app source and this build script are editable. The decoder is isolated from the original application code. No restrictions on modifying/replacing the library or debugging those modifications are imposed here.
