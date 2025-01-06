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

module.exports = {
  packageToRelPath,
  splitQualifiedName,
  toForwardSlash,
  relPathToPackageName,
};
