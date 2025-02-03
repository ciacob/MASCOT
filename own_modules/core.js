const fs = require("fs");
const path = require("path");
const { cloneRepos, cloneRepo } = require("./clone_tools");
const { doShallowScan, doDeepScan } = require("./scan_tools");
const { manuallyAddDependencies } = require("./patch_tools");
const { buildDependencies, makeBuildTasks } = require("./dep_tools");
const { applyDirtinessFilter } = require("./dirty_tools");
const {
  writeConfig,
  writeVSCSettings,
  writeVSCTasks,
} = require("./file_tools");

/**
 * This module houses the main entry point function (`cliMain`) used when MASCOT is invoked through CLI.
 * If you only want to use MASCOT through CLI, you do not need to require the "./core.js" module,
 * everything is handled automatically.
 *
 * However, if you want to use MASCOT programmatically (as opposed to using its CLI), then you should
 * require the "./core.js" module, as it also functions as a pass-through module which re-exports to
 * one place all the functions made available by all of the other specific modules. Consult each
 * individual function documentation for learning how to use it.
 *
 * NOTE: MASCOT uses "cli-primer" (https://www.npmjs.com/package/cli-primer) as a CLI wrapper
 * facility. See also "https://github.com/ciacob/cli-primer" for details.
 *
 * @param inputData {Object}
 *        Merged dataset CLI-primer has built out of MASCOT configuration file and/or provided
 *        command-line arguments, whichever given.
 *
 * @param utils {Object}
 *        Merged set of the utility functions CLI-primer provides, across all of its modules.
 *
 * @param monitoringFn {Function}
 *        All-purpose monitoringFn function defined by CLI-primer. Its signature is:
 *        `function $m(info)`, where `info` is an Object containing the following keys:
 *        - `type` (String): The type of message (`info`, `warn`, `error`, `debug`).
 *        - `message` (String): The message content to be displayed.
 *        - `data` (Object, optional): Additional data related to the message, displayed as an object.
 */
function cliMain(inputData, utils, monitoringFn) {
  const $m = monitoringFn || function () {};

  // VALIDATE & PRE_PROCESS INPUT
  // ----------------------------
  const appInfo = utils.getAppInfo();

  // Check for no-op situation.
  if (!inputData.clone && !inputData.generate) {
    $m({
      type: "error",
      message: `No actionable arguments received. Run "${appInfo.appPathName} --h" for documentation.`,
    });
    return;
  }

  // Check for contextually mandatory arguments.
  if (inputData.clone && !inputData.c_user_name) {
    $m({
      type: "error",
      message: `Missing mandatory argument "--c_user_name". Argument "--c_user_name" is mandatory when argument "--clone" is given.`,
    });
    return;
  }

  if (inputData.generate && !inputData.g_sdk_directory) {
    $m({
      type: "error",
      message: `Missing mandatory argument "--g_sdk_directory". Argument "--g_sdk_directory" is mandatory when argument "--generate" is given.`,
    });
    return;
  }

  // Check if provided `workspace_directory` exist on disk.
  if (
    inputData.workspace_directory &&
    !fs.existsSync(inputData.workspace_directory)
  ) {
    $m({
      type: "error",
      message: `Provided \`--workspace_directory\` "${inputData.workspace_directory}" does not exist on disk.`,
    });
    return;
  }

  // Check if provided `g_sdk_directory` exists on disk.
  if (inputData.g_sdk_directory && !fs.existsSync(inputData.g_sdk_directory)) {
    $m({
      type: "error",
      message: `Provided \`--g_sdk_directory\` "${inputData.g_sdk_directory}" does not exist on disk.`,
    });
    return;
  }

  // Check/ensure that provided `c_programming_languages` and `g_manual_dependencies` are legitimate Arrays.
  function getArrayOrSerializedArray(val) {
    if (!val) {
      return null;
    }
    if (!Array.isArray(val) && typeof val !== "string") {
      return null;
    }
    if (!Array.isArray(val)) {
      try {
        val = JSON.parse(val);
        if (!Array.isArray(val)) {
          throw new Error("provided JSON does not resolve to an Array.");
        }
      } catch (e) {
        $m({
          type: "error",
          message: e,
        });
        return null;
      }
    }
    return val;
  }

  let programming_languages = null;
  if (inputData.c_programming_languages) {
    programming_languages = getArrayOrSerializedArray(
      inputData.c_programming_languages
    );
    if (!programming_languages) {
      $m({
        type: "error",
        message: `Provided \`--c_programming_languages\` is not an Array or serialized Array.`,
      });
      return;
    }
  }

  let manual_dependencies = null;
  if (inputData.g_manual_dependencies) {
    manual_dependencies = getArrayOrSerializedArray(
      inputData.g_manual_dependencies
    );
    if (!manual_dependencies) {
      $m({
        type: "error",
        message: `Provided \`--g_manual_dependencies\` is not an Array or serialized Array.`,
      });
      return;
    }
  }

  // Ensure the scratch folder is available
  const scratchDirName = `${appInfo.appPathName}.scratch`;
  utils.ensureSetup(utils.getUserHomeDirectory(), {
    content: [{ type: "folder", path: scratchDirName }],
  });
  const scratchDirPath = path.normalize(
    path.join(utils.getUserHomeDirectory(), scratchDirName)
  );

  // EXECUTE TASKS BASED ON INPUT
  // ----------------------------
  const workspace_directory = path.normalize(inputData.workspace_directory);
  (async function () {
    // Do a GitHub clone if requested
    if (inputData.clone) {
      const queryResult = await cloneRepos(
        workspace_directory,
        inputData.c_user_name,
        programming_languages,
        inputData.c_forks_behavior === "mix"
          ? undefined
          : inputData.c_forks_behavior === "only"
          ? true
          : false,
        inputData.c_dry_mode === "yes" ? true : false
      );
      $m({
        type: "info",
        message: "Your GitHub query returned:",
        data: queryResult ? queryResult.report || {} : {},
      });
      if (queryResult && queryResult.repos) {
        $m({
          type: "info",
          message: "Full list of matching repositories:",
        });
        console.dir(queryResult.repos, { depth: null });
      }
    }

    // Analyze workspace dependencies and generate `asconfig.json` files if requested.
    if (inputData.generate) {
      // Index all classes in all ActionScript projects.
      doShallowScan(workspace_directory, scratchDirPath, true);

      // Establish couplings at class levels (i.e., which class uses which other classes).
      doDeepScan(workspace_directory, scratchDirPath, true);

      // Patch couplings based on the `--g_manual_dependencies` argument, if provided.
      if (manual_dependencies && manual_dependencies.length > 0) {
        manuallyAddDependencies(
          workspace_directory,
          scratchDirPath,
          manual_dependencies
        );
      }

      // Build project level dependencies, i.e., "this" project depends on "these other" projects.
      buildDependencies(workspace_directory, scratchDirPath, true);

      // Actually generate one `asconfig.json` file for each ActionScript project in the workspace.
      writeConfig(workspace_directory, scratchDirPath, true, null, inputData.g_asconfig_base);

      // Ensure each ActionScript project in the workspace has a `.vscode/settings.json` file containing,
      // at the very least the path to the AIR SDK to use.
      writeVSCSettings(workspace_directory, scratchDirPath, {
        $sdk: inputData.g_sdk_directory,
      });

      // Create a blueprint for the actual build tasks to be generated.
      makeBuildTasks(workspace_directory, scratchDirPath, true);

      // Handle the `--g_rebuild` argument.
      if (!inputData.g_rebuild) {
        applyDirtinessFilter(workspace_directory, scratchDirPath);
      }

      // Update the `.vscode/tasks.json` of each ActionScript project in the workspace, so that it
      // includes tasks with building the current project and all dependencies, in one go.
      writeVSCTasks(
        workspace_directory,
        scratchDirPath,
        { path_to_air_sdk: inputData.g_sdk_directory },
        true
      );
    }
  })();
}

module.exports = {
  cliMain,
  cloneRepos,
  cloneRepo,
  doShallowScan,
  doDeepScan,
  manuallyAddDependencies,
  buildDependencies,
  makeBuildTasks,
  applyDirtinessFilter,
  writeConfig,
  writeVSCSettings,
  writeVSCTasks,
};
