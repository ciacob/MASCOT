const shell = require("shelljs");
const axios = require("axios");

async function cloneOwnRepos(githubUser, targetDir) {
  try {
    // Fetch the user's repositories from GitHub API
    const response = await axios.get(
      `https://api.github.com/users/${githubUser}/repos?per_page=100`
    );
    const repos = response.data;

    // Filter out forked repositories
    const ownRepos = repos.filter((repo) => !repo.fork);

    // Clone each repository
    ownRepos.forEach((repo) => {
      const cloneUrl = repo.clone_url;
      const repoName = repo.name;
      const targetPath = `${targetDir}/${repoName}`;

      console.log(`Cloning ${repoName} into ${targetPath}`);
      shell.exec(`git clone ${cloneUrl} ${targetPath}`);
    });

    console.log("All repositories have been cloned.");
  } catch (error) {
    console.error("Error fetching repositories:", error);
  }
}

// MAIN
cloneOwnRepos("ciacob", "/Users/ciacob/DEV/github");
