const { cloneRepos, cloneRepo } = require("./clone_tools");
const { doShallowScan, doDeepScan } = require("./scan_tools");
const { manuallyAddDependencies } = require("./patch_tools");
const { buildDependencies, makeBuildTasks } = require("./dep_tools");
const {
  writeConfig,
  writeVSCSettings,
  writeVSCTasks,
} = require("./file_tools");

/**
 * This is a pass-through module whose only purpose is to re-export in one place all the functions made
 * available by all of the other specific modules. This way, if you want to use MASCOT programmatically
 * (as opposed to using its CLI), you only need to `require` the "./core.js" module. Consult each
 * individual function documentation for learning how to use it.
 */

module.exports = {
  cloneRepos,
  cloneRepo,
  doShallowScan,
  doDeepScan,
  manuallyAddDependencies,
  buildDependencies,
  makeBuildTasks,
  writeConfig,
  writeVSCSettings,
  writeVSCTasks,
};
