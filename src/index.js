const { cloneRepos } = require("./own_modules/clone_tools");
const { doShallowScan, doDeepScan } = require("./own_modules/scan_tools");
const os = require("os");

function isWin() {
  return os.platform() === "win32";
}

// MAIN
const workspace_dir = isWin()
  ? "d:\\_DEV_\\github\\actionscript"
  : "/Users/ciacob/_DEV_/github/actionscript";

const cache_dir = isWin()
  ? "d:\\_DEV_\\github\\nodejs\\MASCOT\\cache"
  : "/Users/ciacob/_DEV_/github/node_js/MASCOT/cache";

const userName = "ciacob";
const repoLanguages = ["ActionScript"];
const dry_run_mode = true;
(async function () {
  const report = await cloneRepos(
    workspace_dir,
    userName,
    repoLanguages,
    undefined,
    dry_run_mode
  );
  console.dir(report, { depth: null });
  if (!dry_run_mode) {
    doShallowScan(workspace_dir, cache_dir, true);
    doDeepScan(workspace_dir, cache_dir, true);
  }
})();
