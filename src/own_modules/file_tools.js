const fs = require("fs");
const path = require("path");

/**
 * Generates `asconfig.json` files for projects listed in `projects.json`.
 * Outputs one `asconfig.json` file in the root of each project directory.
 *
 * @param {string} workspaceDir - Absolute path to the folder where repositories are cloned.
 * @param {string} cacheDir - Absolute path to the folder where `projects.json`, `classes.json`, and `deps.json` are stored.
 * @param {boolean} [overwrite=false] - Whether to overwrite existing `asconfig.json` files.
 * @param {Object|null} [defaults=null] - Default values for constant placeholders.
 */
function writeConfig(
  workspaceDir,
  cacheDir,
  overwrite = false,
  defaults = null
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
    debug_mode: true,
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

    // Resolve library paths
    const libraryPath = [
      ...(has_lib_dir ? ["lib"] : []),
      ...project_dependencies.map((depPath) =>
        path.join(depPath, defaultValues.bin_dir)
      ),
    ];

    // Build `asconfig.json` structure
    const asConfig = {
      config: defaultValues.config_type,
      ...(projectType === "app" ? { type: "app", mainClass } : { type: "lib" }),
      files: classFiles.map((file) =>
        path.join(projectPath, defaultValues.src_dir, file)
      ),
      copySourcePathAssets: defaultValues.copy_assets,
      compilerOptions: {
        debug: defaultValues.debug_mode,
        "library-path": libraryPath,
        output:
          projectType === "lib"
            ? `${defaultValues.bin_dir}/${sanitizeFileName(project_name)}.swc`
            : `${defaultValues.bin_dir}/${mainClass}.swf`,
        "source-path": [defaultValues.src_dir],
        "include-sources": [defaultValues.src_dir],
      },
    };

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

module.exports = { writeConfig };
