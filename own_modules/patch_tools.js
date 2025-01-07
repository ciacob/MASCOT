const fs = require("fs");
const path = require("path");
const {
  packageToRelPath,
  splitQualifiedName,
  toForwardSlash,
  relPathToPackageName,
} = require("./utils");

const problems = [];

function isOnDisk(filePath) {
  if (!fs.existsSync(filePath)) {
    const errorMsg = `Error: function "manuallyAddDependencies()" cannot locate "${filePath}" on disk.`;
    console.error(errorMsg);
    problems.push(errorMsg);
    return false;
  }
  return true;
}

function hasItems(arr, arrName) {
  if (!Array.isArray(arr) || arr.length === 0) {
    const errorMsg = `Error: bad or empty Array "${arrName}" given to function "manuallyAddDependencies()".`;
    console.error(errorMsg);
    problems.push(errorMsg);
    return false;
  }
  return true;
}

function hasValue(val, valName) {
  if (!val) {
    const errorMsg = `Error: missing expected "${valName}" in function "manuallyAddDependencies()".`;
    console.error(errorMsg);
    problems.push(errorMsg);
    return false;
  }
  return true;
}

/**
 * Manually add dependencies for one or more projects, to cope with situations where the dependency analysis algorithm fails to detect them properly.
 *
 * @param {String} workspaceDir - The workspace directory where repositories have been cloned.
 * @param {String} outputDir - The directory containing `projects.json`, `classes.json` and (optionally) `problems.log`.
 * @param {Object[]} amendments - Array of Objects, each containing the keys `project` (String) and `dependencies` (String[]).
 *
 * Important: this function must be called after function `doDeepScan()` has been executed, and before executing function `buildDependencies()`.
 */
function manuallyAddDependencies(workspaceDir, outputDir, amendments) {
  problems.length = 0;
  const projectsFilePath = path.join(outputDir, "projects.json");
  const classesFilePath = path.join(outputDir, "classes.json");
  const problemsFilePath = path.join(outputDir, "problems.log");

  if (isOnDisk(projectsFilePath) && isOnDisk(classesFilePath)) {
    const projects = JSON.parse(fs.readFileSync(projectsFilePath));
    const classes = JSON.parse(fs.readFileSync(classesFilePath));

    // Locate the entry in "projects.json" that corresponds to the `project` we are currently amending,
    // and grab its first class.
    amendments.forEach(({ project, dependencies = [] }) => {
      if (!isOnDisk(project) || !hasItems(dependencies, "dependencies")) {
        return;
      }

      project = path.normalize(project);
      const projectEntry = projects.find(
        (entry) => entry.project_home_dir === project
      );

      if (
        !hasValue(projectEntry, "projectEntry") ||
        !hasItems(projectEntry.classFiles, "projectEntry.classFiles")
      ) {
        return;
      }

      const projectClass = projectEntry.classFiles[0];

      // Locate the entry in "projects.json" that corresponds, in turn, to each entry in `dependencies`. Grab its
      // first class.
      dependencies.forEach((dependencyProject) => {
        if (!isOnDisk(dependencyProject)) {
          return;
        }
        dependencyProject = path.normalize(dependencyProject);

        const depProjectEntry = projects.find(
          (entry) => entry.project_home_dir === dependencyProject
        );

        if (
          !hasValue(depProjectEntry, "depProjectEntry") ||
          !hasItems(depProjectEntry.classFiles, "depProjectEntry.classFiles")
        ) {
          return;
        }

        const depProjectClass = depProjectEntry.classFiles[0];

        // Add the first class of the current `dependency` as a "coupling" of the first class of the current
        // `project`.
        const projectClassEntry = classes.find((entry) =>
          entry.analyzed_class.file_path.endsWith(projectClass)
        );

        if (!hasValue(projectClassEntry, "projectClassEntry")) {
          return;
        }

        const expected_class_file = path.normalize(
          path.join(depProjectEntry.project_home_dir, "src", depProjectClass)
        );
        if (!isOnDisk(expected_class_file)) {
          return;
        }

        const expected_relative_path = toForwardSlash(depProjectClass);
        const matching_project = depProjectEntry.project_home_dir;
        const package = relPathToPackageName(expected_relative_path);
        const name = package
          ? splitQualifiedName(package)[1]
          : depProjectClass.split(".")[0];

        projectClassEntry.class_couplings.unshift({
          name,
          package,
          expected_relative_path,
          coupling_type: "patch",
          matching_project,
          expected_class_file,
          class_exists: true,
        });
      });
    });

    // Write to disk the updated `classes.json`.
    fs.writeFileSync(classesFilePath, JSON.stringify(classes, null, 2));
  }

  // Log any problems
  if (problems.length > 0) {
    fs.appendFileSync(problemsFilePath, problems.join("\n\n") + "\n");
  }

  console.log("Processed all manually added dependencies.");
}

module.exports = {
  manuallyAddDependencies,
};
