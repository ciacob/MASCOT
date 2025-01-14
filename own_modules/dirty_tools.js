const fs = require("fs");
const path = require("path");

/**
 * Hierarchically walks a project's dependency paths, establishing what is "dirty" (code is newer than binaries)
 * and needs to be rebuilt, and what not (binaries are newer than code, so they can be reused).
 *
 * @param   {Object} dirtyCache
 *          Object with absolute project paths as keys and Boolean as values. A Boolean of `true` means that the
 *          project at the path key is "dirty" and needs to be rebuilt.
 *          NOTE: The `dirtyCache` is modified as a side-effect while `isProjectDirty()` runs: all the projects
 *          found to be dirty are marked as such in the `dirtyCache`.
 *
 * @param   {Object[]} depsMap
 *          An Object having absolute project paths as keys and Objects as values, each resembling to the format:
 *          {
 *              project_path: "",
 *              project_dependencies: [ "/path/to/dep-proj/1", "/path/to/dep-proj/2" ],
 *              num_dependencies: 2
 *          }
 *
 * @param   {String} projectPath
 *          Absolute path to a project to be checked for dirtiness.
 *
 * @returns {Boolean|null} Returns `null` if given `projectPath` does not exist in `depsMap`. Returns `true` if the given
 *          project or any of its dependencies, to any level deep is "dirty". Returns`false` otherwise.
 */
function isProjectDirty(dirtyCache, depsMap, projectPath) {
  // Early exit: unknown project
  if (!depsMap[projectPath]) {
    return null;
  }

  // Early exit: project was marked as dirty earlier on.
  if (dirtyCache[projectPath]) {
    return true;
  }

  // Early exit: project was never marked as dirty and has no dependencies; end of search.
  if (!depsMap[projectPath].num_dependencies) {
    return false;
  }

  // Recursively search for at least one dirty project among the dependencies of `projectPath`,
  // to any level deep. Depth-first traversal. Updates `dirtyCache` in the process.
  const isDirty = depsMap[projectPath].project_dependencies.some(
    (depProjPath) => isProjectDirty(dirtyCache, depsMap, depProjPath)
  );
  if (isDirty && !dirtyCache[projectPath]) {
    dirtyCache[projectPath] = true;
  }
  return isDirty;
}

/**
 * Walks `tasks.json` and checks all the items in-there for "dirtiness". Updates `project_build_tasks` to
 * only contain "dirty" entries. Also updates `num_tasks` to reflect the new number of entries. Rewrites
 * the changed dataset back to `tasks.json` when done.
 *
 * Note: "dirtiness" is the status of a project having newer source code files than binary files (or missing
 * the binary files altogether), which means that project has to be rebuild (recompiled). By contrast, a "clean"
 * project has newer binaries than code, and needs not be rebuilt, meaning the existing binaries can be reused.
 *
 * @param {string} workspaceDir - Absolute path to the workspace directory.
 *
 * @param {String} cacheDir
 *        The directory containing `projects.json`, `deps.json`, `tasks.json` and `problems.log`.
 *
 */
function applyDirtinessFilter(workspaceDir, cacheDir) {
  const projectsFilePath = path.join(cacheDir, "projects.json");
  const depsFilePath = path.join(cacheDir, "deps.json");
  const tasksFilePath = path.join(cacheDir, "tasks.json");
  const problemsFilePath = path.join(cacheDir, "problems.log");

  // Check required files
  if (
    !fs.existsSync(projectsFilePath) ||
    !fs.existsSync(depsFilePath) ||
    !fs.existsSync(tasksFilePath)
  ) {
    const errorMsg =
      "`findDirtyTasks()`: required input files `projects.json`, `deps.json` or `tasks.json` not found.";
    console.error(errorMsg);
    fs.appendFileSync(problemsFilePath, errorMsg + "\n\n");
    return;
  }

  // Load input files
  const projects = JSON.parse(fs.readFileSync(projectsFilePath));
  const deps = JSON.parse(fs.readFileSync(depsFilePath));
  const tasks = JSON.parse(fs.readFileSync(tasksFilePath));

  // Map all projects to their direct, explicit "dirtiness" status, based on last report.
  const dirtyCache = {};
  projects.forEach((entry) => {
    if (
      entry &&
      entry.project_home_dir &&
      !(entry.project_home_dir in dirtyCache)
    ) {
      dirtyCache[entry.project_home_dir] = !!entry.is_dirty;
    }
  });

  // Map all direct dependencies of a project to their project path.
  const depsMap = {};
  deps.forEach((entry) => {
    if (entry && entry.project_path && !(entry.project_path in depsMap)) {
      depsMap[entry.project_path] = entry;
    }
  });

  // Filter out tasks that are not dirty.
  tasks.forEach((taskEntry) => {
    const dirtyTasks = taskEntry.project_build_tasks.filter((entry) =>
      isProjectDirty(dirtyCache, depsMap, entry)
    );
    taskEntry.project_build_tasks = dirtyTasks;
    taskEntry.num_tasks = dirtyTasks.length;
  });

  // Rewrite tasks.json
  fs.writeFileSync(tasksFilePath, JSON.stringify(tasks, null, 2));
  console.log("Rewrote `tasks.json` to only include dirty tasks.");
}

module.exports = { applyDirtinessFilter };
