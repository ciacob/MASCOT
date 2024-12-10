const { cloneRepos, cloneRepo } = require ('./own_modules/clone_tools');
const { doShallowScan, doDeepScan } = require ('./own_modules/scan_tools');


// MAIN
const workspace_dir = "d:\\_DEV_\\github\\actionscript";
const cache_dir = "d:\\_DEV_\\github\\nodejs\\MASCOT\\cache";
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
  console.dir(report, { depth : null});

  doShallowScan(workspace_dir, cache_dir, true);
  doDeepScan(workspace_dir, cache_dir, true);
})();
