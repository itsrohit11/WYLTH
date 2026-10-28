/*
 * setup-native.js  (runs automatically as an npm "postinstall" step)
 *
 * better-sqlite3 is a native module. By default `npm install` builds/downloads
 * it for the Node.js runtime (ABI), but this app runs it inside Electron, which
 * uses a DIFFERENT ABI. Loading a Node-ABI binary inside Electron throws a
 * "NODE_MODULE_VERSION mismatch" error and the app won't start.
 *
 * This script downloads the matching PREBUILT Electron binary for better-sqlite3
 * via prebuild-install. Because a prebuilt binary exists for our Electron
 * version, NO C++ compiler / Python / Visual Studio Build Tools are required.
 *
 * It never hard-fails the install: if the download can't happen, it prints a
 * clear warning so the problem is visible instead of a silent broken app.
 */
'use strict'

const { execFileSync } = require('child_process')
const path = require('path')

function main() {
  let electronVersion
  try {
    electronVersion = require('electron/package.json').version
  } catch {
    console.warn('[setup-native] electron not installed yet — skipping native setup.')
    return
  }

  let prebuildBin, bsqDir
  try {
    prebuildBin = require.resolve('prebuild-install/bin.js')
    bsqDir = path.dirname(require.resolve('better-sqlite3/package.json'))
  } catch {
    console.warn('[setup-native] better-sqlite3 / prebuild-install not found — skipping.')
    return
  }

  console.log(`[setup-native] Fetching better-sqlite3 prebuilt binary for Electron ${electronVersion} (no compiler needed)...`)
  try {
    execFileSync(
      process.execPath,
      [
        prebuildBin,
        '--runtime=electron',
        `--target=${electronVersion}`,
        `--arch=${process.arch}`,
        `--platform=${process.platform}`,
        '--tag-prefix=v',
      ],
      { cwd: bsqDir, stdio: 'inherit' }
    )
    console.log('[setup-native] better-sqlite3 is ready for Electron.')
  } catch (err) {
    console.warn('\n[setup-native] WARNING: could not install the Electron-ABI binary for better-sqlite3.')
    console.warn('[setup-native] The app may fail to start with a NODE_MODULE_VERSION error.')
    console.warn('[setup-native] Re-run "npm install", or see HOW_TO_RUN.txt for help.')
    console.warn('[setup-native] Reason: ' + (err && err.message ? err.message : err) + '\n')
  }
}

main()
