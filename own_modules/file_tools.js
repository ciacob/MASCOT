const fs = require("fs");
const path = require("path");
const { deepMergeData } = require("cli-primer");
const { groupWorkersByRepositories } = require("./utils");

/**
 * Generates `asconfig.json` files for projects listed in `projects.json`.
 * Outputs one `asconfig.json` file in the root of each project directory.
 *
 * @param {string} workspaceDir
 *        Absolute path to the folder where repositories are cloned.
 *
 * @param {string} cacheDir
 *        Absolute path to the folder where `projects.json`, `classes.json`, and `deps.json`
 *        are stored.
 *
 * @param {boolean} [overwrite=false]
 *        Whether to overwrite existing `asconfig.json` files.
 *
 * @param {Object|null} [defaults=null]
 *        Optional. Object containing one or more of the following keys: `config_type`,
 *        `copy_assets`, `bin_dir`, `src_dir`. If not given, the following are assumed:
 *         {
 *           config_type: "air",
 *           copy_assets: true,
 *           bin_dir: "bin",
 *           src_dir: "src",
 *         }
 *
 * @param {Object|null} [base = null]
 *        Optional. Object containing a base/blueprint version of `asconfig` data to use.
 *        Any build-related settings in-here will be overwritten, but everything else will
 *        be kept verbatim (e.g., packaging settings, or specific compiler flags, e.g.,
 *        `advanced-telemetry`).
 *
 * @param {Object[]|null} [externalWorkers = null]
 *        Optional. List of external workers (ActionScript workers living in their own
 *        dedicated project), in the format:
 *        {
 *          project: "/path/to/worker/home",
 *          workerFile: "/path/to/worker/home/MyWorker.as",
 *          workerOutput: "/path/to/expected/Worker.swf"
 *        }
 *
 * @param {Object[]|null} [internalWorkers = null]
 *        Optional. List of internal workers (ActionScript workers living in the project of
 *        another application or library). Format is the same as for `externalWorkers`.
 */
function writeConfig(
  workspaceDir,
  cacheDir,
  overwrite = false,
  defaults = null,
  base = null,
  externalWorkers = null,
  internalWorkers = null
) {
  const projectsFilePath = path.join(cacheDir, "projects.json");
  const classesFilePath = path.join(cacheDir, "classes.json");
  const depsFilePath = path.join(cacheDir, "deps.json");
  const problemsFilePath = path.join(cacheDir, "problems.log");

  // Ensure required files exist
  if (
    !fs.existsSync(projectsFilePath) ||
    !fs.existsSync(classesFilePath) ||
    !fs.existsSync(depsFilePath)
  ) {
    const errorMsg =
      "At least one of the required files `projects.json`, `classes.json`, or `deps.json` is missing.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n\n");
    return;
  }

  // Load data
  const projects = JSON.parse(fs.readFileSync(projectsFilePath));
  const classes = JSON.parse(fs.readFileSync(classesFilePath));
  const deps = JSON.parse(fs.readFileSync(depsFilePath));

  // Apply defaults
  const defaultValues = {
    config_type: "air",
    copy_assets: true,
    bin_dir: "bin",
    src_dir: "src",
    ...defaults,
  };

  const problems = [];

  // Helper to sanitize file names
  function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  // Write `asconfig.json` for each project
  projects.forEach((project) => {
    const {
      project_home_dir,
      classFiles,
      has_lib_dir,
      project_name,
      is_app_probability,
    } = project;
    const projectPath = path.resolve(project_home_dir);
    const configFilePath = path.join(projectPath, "asconfig.json");

    // Skip if file exists and overwrite is false
    if (!overwrite && fs.existsSync(configFilePath)) {
      console.log(`Skipping existing config for project: ${projectPath}`);
      return;
    }

    // Determine project type
    const projectType = is_app_probability >= 0.5 ? "app" : "lib";

    // Determine main class
    const projectDeps =
      deps.find((dep) => dep.project_path === projectPath) || {};
    const { root_classes = [], project_dependencies = [] } = projectDeps;
    const mainClass =
      projectType === "app"
        ? root_classes.length > 0
          ? path.parse(root_classes[0].file_path).name
          : "Main"
        : undefined;

    const appDescriptor =
      projectType === "app"
        ? root_classes.length > 0
          ? root_classes[0].descriptor_file_path
          : undefined
        : undefined;

    // Resolve library paths
    const libraryPath = [
      ...(has_lib_dir ? ["lib"] : []),
      ...project_dependencies.map((depPath) =>
        path.join(depPath, defaultValues.bin_dir)
      ),
    ];

    // If the current project is an external worker project, grab its
    // worker specific information.
    const externalWorkerInfo =
      externalWorkers && externalWorkers.length
        ? externalWorkers.find(
            (workerInfo) => workerInfo.project === projectPath
          ) || null
        : null;

    // Determine the internal workers that need to be added to the
    // "workers" section of the `asconfig.json` file of the current project.
    const internalWorkersList =
      internalWorkers && internalWorkers.length
        ? internalWorkers
            .filter((workerInfo) => workerInfo.project === projectPath)
            .map((ownInternalWorker) => ({
              file: ownInternalWorker.workerFile,
              output: ownInternalWorker.workerOutput,
            }))
        : null;

    // Build `asconfig.json` structure
    const asConfigInherited = base || {};
    const asConfigOwn = {
      config: defaultValues.config_type,
      ...(projectType === "app"
        ? { type: "app", mainClass, application: appDescriptor }
        : { type: "lib" }),
      copySourcePathAssets: defaultValues.copy_assets,
      compilerOptions: {
        debug: defaultValues.debug_mode,
        "library-path": libraryPath,
        output:
          projectType === "lib"
            ? `${defaultValues.bin_dir}/${sanitizeFileName(project_name)}.swc`
            : externalWorkerInfo
            ? externalWorkerInfo.workerOutput
            : `${defaultValues.bin_dir}/${mainClass}.swf`,
        ...(projectType === "lib"
          ? { "include-sources": [defaultValues.src_dir] }
          : {}),
        "source-path": [defaultValues.src_dir],
        ...(internalWorkersList && internalWorkersList.length
          ? { workers: internalWorkersList }
          : {}),
      },
    };
    const asConfig = deepMergeData(asConfigInherited, asConfigOwn);

    // Write `asconfig.json`
    try {
      fs.writeFileSync(configFilePath, JSON.stringify(asConfig, null, 2));
      console.log(`Generated asconfig.json for project: ${projectPath}`);
    } catch (err) {
      const errorMsg = `Failed to write asconfig.json for project: ${projectPath}. Error: ${err.message}`;
      console.error(errorMsg);
      problems.push(errorMsg);
    }
  });

  // Append problems to `problems.log`
  if (problems.length > 0) {
    fs.appendFileSync(problemsFilePath, problems.join("\n") + "\n\n");
  }

  console.log("Configuration generation complete.");
}

/**
 * Writes or updates `.vscode/settings.json` files in each project listed in `projects.json`.
 *
 * @param {string} workspaceDir - Absolute path to the folder where repositories are cloned.
 * @param {string} cacheDir - Absolute path to the folder where `projects.json` is stored.
 * @param {Object} settings - Key-value pairs to add to the `settings.json` file.
 *                             The "$sdk" short key will be expanded to "as3mxml.sdk.framework".
 * @param {boolean} [purge=false] - Whether to replace the `settings.json` file entirely.
 */
function writeVSCSettings(workspaceDir, cacheDir, settings, purge = false) {
  const projectsFilePath = path.join(cacheDir, "projects.json");
  const problemsFilePath = path.join(cacheDir, "problems.log");

  // Ensure `projects.json` exists
  if (!fs.existsSync(projectsFilePath)) {
    const errorMsg =
      "`projects.json` is missing. Cannot write VSCode settings.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n");
    return;
  }

  // Exit early if no settings are provided
  if (!settings || Object.keys(settings).length === 0) {
    console.log("No settings provided. Exiting early.");
    return;
  }

  // Expand "$sdk" to "as3mxml.sdk.framework"
  if (settings["$sdk"]) {
    settings["as3mxml.sdk.framework"] = settings["$sdk"];
    delete settings["$sdk"];
  }

  const projects = JSON.parse(fs.readFileSync(projectsFilePath));
  const problems = [];

  projects.forEach((project) => {
    const { project_home_dir } = project;
    const projectPath = path.resolve(project_home_dir);
    const vscodePath = path.join(projectPath, ".vscode");
    const settingsPath = path.join(vscodePath, "settings.json");

    try {
      let existingSettings = {};

      // Handle purge
      if (purge && fs.existsSync(settingsPath)) {
        fs.unlinkSync(settingsPath);
        console.log(`Purged existing settings for project: ${projectPath}`);
      }

      // Ensure `.vscode` directory exists
      if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath);
      }

      // Load existing settings if not purging
      if (!purge && fs.existsSync(settingsPath)) {
        try {
          existingSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        } catch (err) {
          problems.push(
            `Failed to parse existing settings for project: ${projectPath}. Error: ${err.message}`
          );
        }
      }

      // Merge new settings
      const updatedSettings = {
        ...existingSettings,
        ...settings,
      };

      // Write updated settings
      fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2));
      console.log(`Updated settings for project: ${projectPath}`);
    } catch (err) {
      const errorMsg = `Failed to write settings for project: ${projectPath}. Error: ${err.message}`;
      console.error(errorMsg);
      problems.push(errorMsg);
    }
  });

  // Append problems to `problems.log`
  if (problems.length > 0) {
    fs.appendFileSync(problemsFilePath, problems.join("\n") + "\n\n");
  }

  console.log("VSCode settings update complete.");
}

////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////
////////////////////////////////////
//////////////////////////
////////////////
//////////

/**
 * Writes custom build tasks to the `tasks.json` file in the `.vscode` folder for each project.
 *
 * @param {string} workspaceDir - Absolute path to the folder where repositories are cloned.
 * @param {string} cacheDir - Absolute path to the cache directory where `tasks.json` is located.
 * @param {Object} settings - Object containing essential information for the tasks.
 *                             `path_to_asconfigc` and `path_to_air_sdk` are expected keys.
 * @param {boolean} [purge=false] - Whether to replace existing MASCOT tasks or skip if found.
 */
function writeVSCTasks(workspaceDir, cacheDir, settings, purge = false) {
  const tasksFilePath = path.join(cacheDir, "tasks.json");
  const problemsFilePath = path.join(cacheDir, "problems.log");

  // Ensure `tasks.json` exists
  if (!fs.existsSync(tasksFilePath)) {
    const errorMsg = "`tasks.json` is missing. Cannot write VSCode tasks.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n");
    return;
  }

  // Validate settings
  const pathToAsconfigc = settings.path_to_asconfigc || "asconfigc";
  const pathToAirSdk = settings.path_to_air_sdk;
  if (!pathToAirSdk) {
    const errorMsg = "`path_to_air_sdk` is required in settings.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n");
    return;
  }

  const tasks = JSON.parse(fs.readFileSync(tasksFilePath));
  const problems = [];

  tasks.forEach((task) => {
    const { project_path, project_build_tasks } = task;
    const vscodePath = path.join(project_path, ".vscode");
    const vscodeTasksPath = path.join(vscodePath, "tasks.json");

    try {
      // Ensure `.vscode` folder exists
      if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath);
      }

      // Load or initialize tasks.json
      let tasksJson = { version: "2.0.0", tasks: [] };
      if (fs.existsSync(vscodeTasksPath)) {
        tasksJson = JSON.parse(fs.readFileSync(vscodeTasksPath, "utf-8"));
      }

      // Filter out existing MASCOT tasks
      if (purge) {
        tasksJson.tasks = tasksJson.tasks.filter(
          (t) => !t.label.startsWith("MASCOT: ")
        );
      } else if (tasksJson.tasks.some((t) => t.label.startsWith("MASCOT: "))) {
        console.log(
          `Skipping existing MASCOT tasks for project: ${project_path}`
        );
        return;
      }

      // Nested helper function to create one sub-task.
      function createSubTask(
        $depProjectPath,
        $index,
        $pathToAsconfigc,
        $pathToAirSdk,
        $debug,
        $previousTaskLabel = null
      ) {
        const label = `MASCOT: build dependency #${$index + 1} (${
          $debug ? "debug" : "release"
        })`;
        tasksJson.tasks.push({
          label,
          type: "shell",
          command: $pathToAsconfigc,
          args: [
            "--sdk",
            $pathToAirSdk,
            "--project",
            $depProjectPath,
            `--debug=${$debug}`,
          ],
          group: { kind: "none", isDefault: false },
          problemMatcher: [],
          ...($previousTaskLabel ? { dependsOn: $previousTaskLabel } : {}),
        });
        return label;
      }

      const isRebuild = project_build_tasks.length === 0;

      project_build_tasks.pop(); // ignore the master task

      // Add tasks both for debug and release builds
      [true, false].forEach((debugMode) => {
        // Add a sub-task for each dependency
        let previousTaskLabel = null;
        project_build_tasks.forEach((depProjectPath, index) => {
          previousTaskLabel = createSubTask(
            depProjectPath,
            index,
            pathToAsconfigc,
            pathToAirSdk,
            debugMode,
            previousTaskLabel
          );
        });

        // Add a master task for compiling the project itself.
        tasksJson.tasks.push({
          label: `MASCOT: compile ${debugMode ? "debug" : "release"}${
            project_build_tasks.length
              ? " (with deps)"
              : isRebuild
              ? " (not needed)"
              : ""
          }`,
          type: "actionscript",
          debug: debugMode,
          asconfig: "asconfig.json",
          group: "build",
          problemMatcher: [],
          ...(previousTaskLabel ? { dependsOn: previousTaskLabel } : {}),
        });
      });

      // Write updated tasks.json
      fs.writeFileSync(vscodeTasksPath, JSON.stringify(tasksJson, null, 2));
      console.log(`Updated tasks.json for project: ${project_path}`);
    } catch (err) {
      const errorMsg = `Failed to write tasks.json for project: ${project_path}. Error: ${err.message}`;
      console.error(errorMsg);
      problems.push(errorMsg);
    }
  });

  // Append problems to `problems.log`
  if (problems.length > 0) {
    fs.appendFileSync(problemsFilePath, problems.join("\n") + "\n");
  }

  console.log("VSCode tasks generation complete.");
}

module.exports = { writeConfig, writeVSCSettings, writeVSCTasks };
