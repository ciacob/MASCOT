const shell = require("shelljs");
const axios = require("axios");
const path = require("path");

/**
 * Clones a GitHub user's repositories to a local directory, with enhanced filtering, reporting, and error handling.
 *
 * @param {string} targetDir - The directory where the repositories will be cloned.
 * @param {string} githubUser - The GitHub username whose repositories will be cloned.
 * @param {Array<string>} withLanguages - Array of languages to filter repositories. Limited to 3 items.
 * @param {boolean|undefined} fork - If true, only forks are included; if false, only non-forks are included; if undefined, no filtering is done on forks.
 * @param {boolean} dryRun - If true, only lists the repositories without cloning.
 *
 * @returns {Object} - A detailed report about the process.
 */
async function cloneRepos(
  targetDir,
  githubUser,
  withLanguages = [],
  fork = undefined,
  dryRun = false
) {
  const report = {
    report: {
      listingResult: "failure",
      cloningResult: "skipped",
      listingDetails: {},
      cloningDetails: {
        numSucceeded: 0,
        numFailed: 0,
        failuresLog: [],
      },
    },
  };

  try {
    // Limit the number of languages to 3 for safety
    const safeLanguages = withLanguages
      .slice(0, 3)
      .map((lang) => `language:${lang}`);

    // Construct the search query
    const queryParts = [`user:${githubUser}`, ...safeLanguages];
    if (fork === true) {
      queryParts.push("fork:only"); // Include only forks
    } else if (fork === false) {
      queryParts.push("fork:false"); // Exclude forks
    } else if (fork === undefined) {
      queryParts.push("fork:true"); // Include both forks and non-forks
    }
    const query = queryParts.join(" ");

    // Fetch the repositories using GitHub Search API
    const response = await axios.get(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(
        query
      )}&per_page=100`
    );
    const repos = response.data.items;

    if (!repos.length) {
      report.report.listingDetails = {
        numMatches: 0,
      };
      report.report.listingResult = "success";
      console.log("No repositories found matching the criteria.");
      return report;
    }

    // Prepare the listing report details
    const matchesByLanguage = {};
    const matchesByType = { forks: 0, non_forks: 0 };

    repos.forEach((repo) => {
      repo.language &&
        (matchesByLanguage[repo.language] =
          (matchesByLanguage[repo.language] || 0) + 1);
      repo.fork ? matchesByType.forks++ : matchesByType.non_forks++;
    });

    report.report.listingDetails = {
      numMatches: repos.length,
      matchesByLanguage: matchesByLanguage,
      matchesByType: matchesByType,
    };
    report.report.listingResult = "success";
    report.repos = repos;

    if (dryRun) {
      console.log("Dry run mode - no cloning performed.");
      return report;
    }

    // Clone each repository
    let numSucceeded = 0;
    let numFailed = 0;
    const failuresLog = [];

    for (const repo of repos) {
      const cloneUrl = repo.clone_url;
      const repoName = repo.name;
      const targetPath = path.normalize(path.join(targetDir, repoName));

      const cloneResult = await cloneRepo(cloneUrl, repoName, targetPath);

      if (cloneResult.result === "success") {
        numSucceeded++;
      } else {
        numFailed++;
        failuresLog.push(cloneResult);
      }
    }

    // Update the cloning details report
    report.report.cloningDetails.numSucceeded = numSucceeded;
    report.report.cloningDetails.numFailed = numFailed;
    if (failuresLog.length > 0)
      report.report.cloningDetails.failuresLog = failuresLog;

    if (numSucceeded > 0 && numFailed === 0) {
      report.report.cloningResult = "success";
    } else if (numSucceeded > 0 && numFailed > 0) {
      report.report.cloningResult = "partial_failure";
    } else if (numSucceeded === 0 && numFailed > 0) {
      report.report.cloningResult = "failure";
    }

    console.log("Cloning process complete.");
  } catch (error) {
    report.report.listingResult = "failure";

    const errMsg = `${error.message}${
      error.message.includes("ENOTFOUND api.github.com")
        ? " (are you online?)"
        : ""
    }`;
    report.report.listingFailureDetail = errMsg;
  }
  return report;
}

/**
 * Clones a single repository from GitHub to a specified path.
 *
 * @param {string} cloneUrl - The Git clone URL of the repository.
 * @param {string} repoName - The name of the repository.
 * @param {string} targetPath - The directory where the repository will be cloned.
 *
 * @returns {Object} - An object containing details about the cloning process.
 */
async function cloneRepo(cloneUrl, repoName, targetPath) {
  const taskDetails = { cloneUrl, repoName, targetPath };
  let commandOutput;

  try {
    console.log(`Cloning ${repoName} into ${targetPath}...`);
    const execResult = shell.exec(`git clone ${cloneUrl} ${targetPath}`, {
      silent: true,
    });

    commandOutput = {
      stdout: execResult.stdout || undefined,
      stderr: execResult.stderr || undefined,
    };

    if (execResult.code !== 0) {
      return {
        taskDetails,
        result: "failure",
        failureType: "git_error",
        failureDetail: execResult.stderr || undefined,
        commandOutput,
      };
    }

    return {
      taskDetails,
      result: "success",
      commandOutput,
    };
  } catch (error) {
    return {
      taskDetails,
      result: "failure",
      failureType: "exception",
      failureDetail: error.message || undefined,
      commandOutput: undefined,
    };
  }
}

module.exports = { cloneRepos, cloneRepo };
