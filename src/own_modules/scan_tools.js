const fs = require("fs");
const path = require("path");

/**
 * Performs a shallow scan of the workspace to identify ActionScript projects.
 * Outputs a `projects.json` catalog containing metadata for each project and a `problems.log` file for anomalies.
 *
 * @param {string} workspaceDir - The directory containing cloned repositories.
 * @param {string} outputDir - The directory to save `projects.json` and `problems.log`.
 * @param {boolean} [replace=false] - Whether to overwrite existing `projects.json` if found.
 */
function doShallowScan(workspaceDir, outputDir, replace = false) {
  const projectsFilePath = path.join(outputDir, "projects.json");
  const problemsFilePath = path.join(outputDir, "problems.log");

  // Check for existing projects.json
  if (fs.existsSync(projectsFilePath)) {
    if (!replace) {
      console.log("projects.json already exists. Skipping scan.");
      return;
    } else {
      fs.unlinkSync(projectsFilePath);
      console.log("Existing projects.json deleted. Starting fresh.");
    }
  }

  const projects = [];
  const problems = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const srcFolder = entries.find(
      (entry) => entry.name === "src" && entry.isDirectory()
    );
    const libFolder = entries.find(
      (entry) => entry.name === "lib" && entry.isDirectory()
    );
    const binFolder = entries.find(
      (entry) => entry.name === "bin" && entry.isDirectory()
    );

    // Ensure this is a valid project
    if (!srcFolder) return;

    const projectDir = dir;
    const projectName = path.basename(dir).replace(/[^a-zA-Z0-9$_\-\.]/g, "");
    const srcPath = path.join(dir, "src");

    // Check for nested projects
    const nestedSrcs = fs
      .readdirSync(srcPath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(srcPath, entry.name, "src"))
      );

    if (nestedSrcs.length > 0) {
      problems.push(`Nested project detected in: ${srcPath}`);
      return;
    }

    // Collect files
    const classFiles = [];
    const assetFiles = [];
    const classNames = [];
    let codeTimestamp = 0;

    function collectFiles(folder) {
      const items = fs.readdirSync(folder, { withFileTypes: true });
      items.forEach((item) => {
        const itemName = item.name;
        const fullPath = path.join(folder, itemName);
        if (item.isDirectory()) {
          collectFiles(fullPath);
        } else if (
          itemName.endsWith(".as") ||
          itemName.endsWith(".mxml") ||
          itemName.endsWith(".fxg")
        ) {
          const className = itemName.split(".")[0];
          if (!classNames.includes(className)) {
            classNames.push(className);
          }
          classFiles.push(path.relative(srcPath, fullPath));
          const stats = fs.statSync(fullPath);
          codeTimestamp = Math.max(codeTimestamp, stats.mtimeMs, stats.ctimeMs);
        } else {
          assetFiles.push(path.relative(srcPath, fullPath));
        }
      });
    }
    collectFiles(srcPath);

    // Check for descriptor. We only care about descriptors matching one of the
    // collected class names.
    const descriptorFiles = fs
      .readdirSync(srcPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith("-app.xml"));
    const knownDescriptors = descriptorFiles
      .map((entry) => {
        const name = path.basename(entry.name, "-app.xml");
        const fileName = entry.name;
        const filePath = path.join(entry.path, entry.name);
        const relativeClassPath = classFiles.find((relFilePath) =>
          relFilePath.startsWith(name)
        );
        const classPackage = relativeClassPath? relPathToPackageName(relativeClassPath) : null;
        return {
          name,
          fileName,
          filePath,
          relativeClassPath,
          related_class: {
            file_path: path.join(entry.path, relativeClassPath),
            package: classPackage,
          },
        };
      })
      .filter((descriptorInfo) =>
        classNames.includes(descriptorInfo.name)
      );
    const hasDescriptor = knownDescriptors.length > 0;

    // Check for binaries
    let binaryTimestamp = 0;
    let hasBinaries = false;
    let hasAppBinary = false;

    if (binFolder) {
      const binPath = path.join(dir, "bin");
      const binaries = fs.readdirSync(binPath, { withFileTypes: true });
      binaries.forEach((bin) => {
        if (
          bin.isFile() &&
          (bin.name.endsWith(".swf") || bin.name.endsWith(".swc"))
        ) {
          hasBinaries = true;
          const stats = fs.statSync(path.join(binPath, bin.name));
          binaryTimestamp = Math.max(
            binaryTimestamp,
            stats.mtimeMs,
            stats.ctimeMs
          );
          if (bin.name.endsWith(".swf")) hasAppBinary = true;
        }
      });
    }

    // Determine dirtiness
    const isDirty = codeTimestamp > binaryTimestamp;

    // Determine app probability
    const isAppProbability = hasDescriptor || hasAppBinary ? 1 : 0;

    // Check for libraries
    const hasLibDir = libFolder
      ? fs
          .readdirSync(path.join(dir, "lib"))
          .some((file) => file.endsWith(".swc"))
      : false;

    // Create project object
    projects.push({
      project_name: projectName,
      project_home_dir: projectDir,
      has_descriptor: hasDescriptor,
      known_descriptors: knownDescriptors,
      has_lib_dir: !!libFolder && hasLibDir,
      has_binaries: hasBinaries,
      has_app_binary: hasAppBinary,
      classFiles,
      assetFiles,
      code_timestamp: codeTimestamp,
      binary_timestamp: binaryTimestamp,
      is_dirty: isDirty,
      is_app_probability: isAppProbability,
    });
  }

  // Traverse workspace
  function traverse(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name);
        scanDir(subDir);
        traverse(subDir); // Continue traversal
      }
    });
  }

  traverse(workspaceDir);

  // Write outputs
  fs.writeFileSync(projectsFilePath, JSON.stringify(projects, null, 2));
  fs.writeFileSync(problemsFilePath, problems.join("\n\n"));

  console.log(`Scan complete. Projects catalog saved to ${projectsFilePath}`);
  console.log(`Problems log saved to ${problemsFilePath}`);
}

/**
 * Converts a package name and class name into a relative file path.
 *
 * @param {string|null} packageName - The package name (e.g., "com.example.utils").
 * @param {string} className - The name of the class (e.g., "MyClass").
 * @returns {string} The relative path to the class file (e.g., "com/example/utils/MyClass.as").
 */
function packageToRelPath(packageName, className) {
  return packageName
    ? `${packageName.replace(/\./g, "/")}/${className}.as`
    : `${className}.as`;
}

/**
 * Splits a fully qualified name into its package and class name components.
 *
 * @param {string} fullName - The fully qualified name (e.g., "com.example.MyClass").
 * @returns {[string|null, string]} A tuple containing the package name and class name.
 */
function splitQualifiedName(fullName) {
  const lastDotIndex = fullName.lastIndexOf(".");
  if (lastDotIndex === -1) return [null, fullName];
  return [
    fullName.substring(0, lastDotIndex),
    fullName.substring(lastDotIndex + 1),
  ];
}

/**
 * Converts a file path to use forward slashes instead of backslashes.
 *
 * @param {string} path - The file path to normalize.
 * @returns {string} The normalized file path with forward slashes.
 */
function toForwardSlash(path) {
  return path ? path.replace(/\\{1,}/g, "/") : path;
}

/**
 * Converts a relative path to an equivalent package name.
 * @param {String} relPath
 * @returns {String} Equivalent package name.
 */
function relPathToPackageName(relPath) {
  return relPath.replace(/\\/g, "/").split("/").slice(0, -1).join(".") || null;
}

/**
 * Performs a deep scan of ActionScript class files to analyze dependencies and verify alignment between file structure and package declarations.
 * Outputs a `classes.json` catalog of analyzed classes and a `problems.log` file for unresolved dependencies or anomalies.
 *
 * @param {string} workspaceDir - The directory containing cloned repositories.
 * @param {string} outputDir - The directory containing `projects.json` and where `classes.json` and `problems.log` will be saved.
 * @param {boolean} [replace=false] - Whether to overwrite existing `classes.json` if found.
 */
function doDeepScan(workspaceDir, outputDir, replace = false) {
  const projectsFilePath = path.join(outputDir, "projects.json");
  const classesFilePath = path.join(outputDir, "classes.json");
  const problemsFilePath = path.join(outputDir, "problems.log");

  // Check for required files
  if (!fs.existsSync(projectsFilePath)) {
    console.error("projects.json not found in the specified output directory.");
    return;
  }

  if (fs.existsSync(classesFilePath)) {
    if (!replace) {
      console.log("classes.json already exists. Skipping deep scan.");
      return;
    } else {
      fs.unlinkSync(classesFilePath);
      console.log("Existing classes.json deleted. Starting fresh.");
    }
  }

  const projects = JSON.parse(fs.readFileSync(projectsFilePath));
  const problems = [];
  const analyzedClasses = [];

  // Build a flat map of all project files and absolute paths.
  // We normalize path separators to forward slashes since all of our class
  // relative paths are normalized this way, and otherwise they would not match.
  const projectFilesMap = {};
  let projectDir;
  projects.forEach((project) => {
    projectDir = project.project_home_dir;
    const classFiles = project.classFiles.map((file) =>
      toForwardSlash(path.join(projectDir, "src", file))
    );
    projectFilesMap[projectDir] = classFiles;
  });

  // Analyze each class file
  projects.forEach((project) => {
    projectDir = project.project_home_dir;
    const srcPath = path.join(project.project_home_dir, "src");
    project.classFiles.forEach((classFileRelative) => {
      const filePath = path.join(srcPath, classFileRelative);
      const isAsFile = classFileRelative.endsWith(".as");
      let className, packageName, expectedRelativePath, pathMatchesPackage;
      const classCouplings = [];

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const inferredPackageName = relPathToPackageName(classFileRelative);

        if (isAsFile) {
          // If class is an *.as file, scan its content to find its name and package.
          const packageMatch = content.match(
            /package\s+([a-zA-Z_$][a-zA-Z0-9_$\.]*)\s*{/
          );
          packageName = packageMatch ? packageMatch[1] : null;

          const classMatch = content.match(
            /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+/
          );
          className = classMatch ? classMatch[1] : null;

          // Path verification (check if class file whereabouts match its package declaration).
          pathMatchesPackage = inferredPackageName === packageName;
          expectedRelativePath = packageToRelPath(packageName, className);
          if (!pathMatchesPackage) {
            problems.push(
              `Class "${className}" (in file: "${toForwardSlash(
                filePath
              )}") declares ${
                packageName
                  ? 'package "' + packageName + '"'
                  : "no package name"
              } but its actual relative path is "${toForwardSlash(
                classFileRelative
              )}", whereas "${toForwardSlash(
                expectedRelativePath
              )}" was expected.`
            );
          }
        } else {
          // Otherwise (if class is an *.mxml or *.fxg file), rely on file whereabouts only.
          className = path.basename(classFileRelative).split(".")[0];
          packageName = inferredPackageName;
          expectedRelativePath = classFileRelative;
          pathMatchesPackage = true;
        }

        // Find imports
        const imports = [
          ...content.matchAll(/import\s+([a-zA-Z_$][a-zA-Z0-9_$\.]*)\s*;/g),
        ];
        imports.forEach(([, fullImport]) => {
          const [importPackage, importName] = splitQualifiedName(fullImport);

          resolveDependency(
            classCouplings,
            problems,
            projectFilesMap,
            importPackage,
            importName,
            "import",
            className,
            filePath
          );
        });

        // Find fully qualified instantiations
        const instantiations = [
          ...content.matchAll(
            /new\s+([a-zA-Z_$]{1}[a-zA-Z_$0-9\.]{0,})\.([a-zA-Z_$]{1}[a-zA-Z_$0-9]{0,})/g
          ),
        ];
        instantiations.forEach(([, fullInstantiation]) => {
          const [instPackage, instName] = splitQualifiedName(fullInstantiation);
          resolveDependency(
            classCouplings,
            problems,
            projectFilesMap,
            instPackage,
            instName,
            "fqn_instantiation",
            className,
            filePath
          );
        });

        // Add analyzed class
        analyzedClasses.push({
          analyzed_class: {
            file_path: filePath,
            name: className,
            package: packageName,
            expected_relative_path: expectedRelativePath,
            path_matches_package: pathMatchesPackage,
            project_dir: projectDir,
          },
          class_couplings: classCouplings,
        });
      } catch (err) {
        problems.push(
          `Failed to analyze class at ${filePath}: ${err.message}. Stack is:\n${err.stack}`
        );
      }
    });
  });

  // Write results to classes.json and problems.log
  fs.writeFileSync(classesFilePath, JSON.stringify(analyzedClasses, null, 2));
  fs.appendFileSync(problemsFilePath, problems.join("\n\n"));

  console.log(`Deep scan complete. Results saved to ${classesFilePath}`);
  console.log(`Problems logged to ${problemsFilePath}`);
}

/**
 * Resolves a dependency for an ActionScript class by matching it to a known project and verifying its existence on disk.
 *
 * @param {Object[]} classCouplings - An array to store the dependency information for the analyzed class.
 * @param {string[]} problems - An array to log any unresolved dependencies.
 * @param {Object} projectFilesMap - A map of project directories to their class files (absolute paths).
 * @param {string|null} packageName - The package name of the dependency (e.g., "com.example.utils").
 * @param {string} className - The name of the class (e.g., "MyClass").
 * @param {string} couplingType - The type of coupling (e.g., "import" or "fqn_instantiation").
 * @param {string} parentClassName - The name of the class declaring the dependency.
 * @param {string} parentClassPath - The file path of the class declaring the dependency.
 */
function resolveDependency(
  classCouplings,
  problems,
  projectFilesMap,
  packageName,
  className,
  couplingType,
  parentClassName,
  parentClassPath
) {
  const inferredRelativePath = packageToRelPath(packageName, className);
  let found = false;

  for (const [projectDir, classFiles] of Object.entries(projectFilesMap)) {
    if (classFiles.some((file) => file.endsWith(inferredRelativePath))) {
      const expectedClassFile = path.join(
        projectDir,
        "src",
        inferredRelativePath
      );

      if (fs.existsSync(expectedClassFile)) {
        classCouplings.push({
          name: className,
          package: packageName,
          expected_relative_path: inferredRelativePath,
          coupling_type: couplingType,
          matching_project: projectDir,
          expected_class_file: expectedClassFile,
          class_exists: true,
        });
        found = true;
        break;
      }
    }
  }

  if (!found) {
    classCouplings.push({
      name: className,
      package: packageName,
      expected_relative_path: inferredRelativePath,
      coupling_type: couplingType,
      matching_project: null,
      expected_class_file: null,
      class_exists: false,
    });
    problems.push(
      `Unresolved ${!packageName ? "global " : ""}dependency: "${
        packageName ? packageName + "." : ""
      }${className}" declared by class "${parentClassName}" (in file: "${toForwardSlash(
        parentClassPath
      )}")`
    );
  }
}

module.exports = { doShallowScan, doDeepScan };
