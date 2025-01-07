const fs = require("fs");
const path = require("path");

/**
 * Builds a project-level dependency map from `classes.json`.
 * Outputs a `deps.json` file and appends errors to `problems.log`.
 *
 * @param {string} workspaceDir - The workspace directory (not currently used but reserved for future use).
 * @param {string} outputDir - The directory containing `classes.json` and `projects.json`, and where `deps.json` and `problems.log` will be saved.
 * @param {boolean} [replace=false] - Whether to replace `deps.json` if it already exists.
 */
function buildDependencies(workspaceDir, outputDir, replace = false) {
  const classesFilePath = path.join(outputDir, "classes.json");
  const projectsFilePath = path.join(outputDir, "projects.json");
  const depsFilePath = path.join(outputDir, "deps.json");
  const problemsFilePath = path.join(outputDir, "problems.log");

  // Check required files
  if (!fs.existsSync(classesFilePath) || !fs.existsSync(projectsFilePath)) {
    const errorMsg =
      "Required input files `classes.json` or `projects.json` not found.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n");
    return;
  }

  if (fs.existsSync(depsFilePath)) {
    if (!replace) {
      console.log("deps.json already exists. Skipping dependency analysis.");
      return;
    } else {
      fs.unlinkSync(depsFilePath);
      console.log("Existing deps.json deleted. Starting fresh.");
    }
  }

  // Load input files
  const classes = JSON.parse(fs.readFileSync(classesFilePath));
  const projects = JSON.parse(fs.readFileSync(projectsFilePath));

  const projectDependencies = {}; // Map of project path to dependency info
  const problems = [];

  // Populate dependencies and root classes
  classes.forEach((classEntry) => {
    const { analyzed_class, class_couplings } = classEntry;
    const projectPath = analyzed_class.project_dir;

    // Ensure the project is initialized in the dependency map
    if (!projectDependencies[projectPath]) {
      const root_classes = [];
      const project = projects.find(
        (proj) => proj.project_home_dir === projectPath
      );

      if (project && project.has_descriptor) {
        root_classes.push(
          ...project.known_descriptors.map((descObj) => descObj.related_class)
        );
      }

      projectDependencies[projectPath] = {
        project_path: projectPath,
        project_dependencies: [],
        num_dependencies: 0,
        root_classes,
      };
    }

    // Add dependencies
    const projectDeps = projectDependencies[projectPath];
    class_couplings
      .filter(
        (coupling) =>
          coupling.class_exists &&
          coupling.matching_project &&
          coupling.matching_project !== projectPath
      )
      .forEach((coupling) => {
        if (
          !projectDeps.project_dependencies.includes(coupling.matching_project)
        ) {
          projectDeps.project_dependencies.push(coupling.matching_project);
          projectDeps.num_dependencies++;
        }
      });
  });

  // Sort projects by num_dependencies ascending
  const sortedDependencies = Object.values(projectDependencies).sort(
    (a, b) => a.num_dependencies - b.num_dependencies
  );

  // Write results to deps.json
  fs.writeFileSync(depsFilePath, JSON.stringify(sortedDependencies, null, 2));
  fs.appendFileSync(problemsFilePath, problems.join("\n\n"));

  console.log(`Dependency analysis complete. Results saved to ${depsFilePath}`);
  console.log(`Problems logged to ${problemsFilePath}`);
}

/**
 * Generates a flat list of build tasks for projects in dependency order.
 *
 * @param {string} workspaceDir - Absolute path to the workspace directory.
 * @param {string} cacheDir - Absolute path to the cache directory where `deps.json` is located.
 * @param {boolean} [replace=false] - Whether to replace the `tasks.json` file if it exists.
 */
function makeBuildTasks(workspaceDir, cacheDir, replace = false) {
  const depsFilePath = path.join(cacheDir, "deps.json");
  const tasksFilePath = path.join(cacheDir, "tasks.json");
  const problemsFilePath = path.join(cacheDir, "problems.log");

  // Ensure `deps.json` exists
  if (!fs.existsSync(depsFilePath)) {
    const errorMsg = "`deps.json` is missing. Cannot create build tasks.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n");
    return;
  }

  // Check for existing `tasks.json`
  if (fs.existsSync(tasksFilePath)) {
    if (!replace) {
      console.log(
        "tasks.json already exists. Skipping build tasks generation."
      );
      return;
    } else {
      fs.unlinkSync(tasksFilePath);
      console.log("Existing tasks.json deleted. Starting fresh.");
    }
  }

  const deps = JSON.parse(fs.readFileSync(depsFilePath));
  const problems = [];
  const tasks = [];

  const visited = new Set(); // Tracks projects already processed

  // Helper nested function to recursively collect dependencies via depth-first traversal
  function collectDependencies(projectPath, collected = []) {
    // TODO FIXME!!! Handle cyclic dependencies...
    const project = deps.find((entry) => entry.project_path === projectPath);
    if (!project) {
      problems.push(
        `Missing dependency information for project: ${projectPath}`
      );
      return collected;
    }

    (project.project_dependencies || []).forEach((dependency) => {
      collectDependencies(dependency, collected); // FIX:
      if (!collected.includes(dependency)) {
        collected.push(dependency);
      }
    });

    if (!collected.includes(projectPath)) {
      collected.push(projectPath);
    }

    return collected;
  }

  // Build tasks for each project
  deps.forEach((project) => {
    const { project_path } = project;

    // Collect all dependencies, including transitive ones
    const allDependencies = collectDependencies(project_path);

    tasks.push({
      project_path,
      project_build_tasks: allDependencies,
      num_tasks: allDependencies.length,
    });
  });

  // Write tasks.json
  fs.writeFileSync(tasksFilePath, JSON.stringify(tasks, null, 2));
  fs.appendFileSync(problemsFilePath, problems.join("\n") + "\n");

  console.log("Build tasks generation complete. Results saved to tasks.json.");
}

module.exports = { buildDependencies, makeBuildTasks };
