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

  // Helper to resolve project paths from file paths
  function getProjectPath(filePath) {
    const srcIndex = filePath.lastIndexOf(path.sep + "src" + path.sep);
    return srcIndex !== -1 ? filePath.substring(0, srcIndex) : null;
  }

  // Populate dependencies and root classes
  classes.forEach((classEntry) => {
    const { analyzed_class, class_couplings } = classEntry;
    const { file_path, class_couplings: couplings } = classEntry;
    const projectPath = getProjectPath(analyzed_class.file_path);

    if (!projectPath) {
      problems.push(`Could not resolve project path for: ${file_path}`);
      return;
    }

    // Ensure the project is initialized in the dependency map
    if (!projectDependencies[projectPath]) {
      projectDependencies[projectPath] = {
        project_path: projectPath,
        project_dependencies: [],
        num_dependencies: 0,
        root_classes: [],
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
        if (!projectDeps.project_dependencies.includes(coupling.matching_project)) {
          projectDeps.project_dependencies.push(coupling.matching_project);
          projectDeps.num_dependencies++;
        }
      });
  });

  // Identify root classes
  const classReferenceCounts = {}; // Map of class file paths to reference counts

  // Initialize reference counts for all classes
  classes.forEach((classEntry) => {
    classReferenceCounts[classEntry.analyzed_class.file_path] = 0;
  });

  // Count references to each class within the same project
  classes.forEach((classEntry) => {
    const projectPath = getProjectPath(classEntry.analyzed_class.file_path);
    if (!projectPath) return;

    classEntry.class_couplings.forEach((coupling) => {
      if (
        coupling.class_exists &&
        coupling.matching_project === projectPath &&
        coupling.expected_class_file in classReferenceCounts
      ) {
        classReferenceCounts[coupling.expected_class_file]++;
      }
    });
  });

  // Add root classes to each project
  classes.forEach((classEntry) => {
    const { analyzed_class, class_couplings } = classEntry;
    const { file_path } = analyzed_class;
    const projectPath = getProjectPath(file_path);

    if (!projectPath) return;

    const projectDeps = projectDependencies[projectPath];
    const numLocalRefs = classReferenceCounts[file_path];

    if (numLocalRefs === 0) {
      projectDeps.root_classes.push({
        file_path,
        num_couplings: class_couplings.filter(
          (coupling) => coupling.class_exists && coupling.matching_project
        ).length,
      });
    }
  });

  // Sort root_classes by num_couplings descending
  Object.values(projectDependencies).forEach((projectDeps) => {
    projectDeps.root_classes.sort((a, b) => b.num_couplings - a.num_couplings);
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

module.exports = { buildDependencies };