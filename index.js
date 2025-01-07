const { wrapAndRun } = require("cli-primer");
const { cliMain } = require("./own_modules/core");

const settings = {
  showDebugMessages: false,
  useOutputDir: false,
  useSessionControl: false,
  useHelp: true,
  useConfig: true,
  configTemplate: JSON.stringify({
    appInfo: {
      appName: "{{name}}",
      appAuthor: "{{author}}",
      appVersion: "{{version}}",
      appDescription: "{{description}}",
    },
  }),
  argsDictionary: [
    {
      name: "Workspace Directory",
      payload: /^--(workspace_directory|wd)=(.+)$/,
      doc: "The directory where actionscript projects live. Also the directory where GitHub repositories are cloned, if requested. Mandatory; set this via configuration file, preferably.",
      mandatory: true,
    },

    {
      name: "Clone",
      payload: /^--(clone|c)$/,
      doc: "If given, causes MASCOT to attempt to clone some GitHub repositories. Behavior is controlled via the `c_` arguments.",
    },

    {
      name: "Clone: User name",
      payload: /^--(c_user_name|c_un)=(.+)$/,
      doc: "The user name to use when cloning GitHub repositories. Mandatory if `--clone` was also given; set this via configuration file, preferably.",
    },

    {
      name: "Clone: Forks behavior",
      payload: /^--(c_forks_behavior|c_fb)=(exclude|only|mix)$/,
      doc: 'Sets what will happen with forks when cloning repositories. One of "exclude" (forks will not be cloned), "only" (just the forks will be cloned), or "mix" (default: both forks and non-forks will be cloned). Set this via configuration file, preferably.',
    },

    {
      name: "Clone: Programming languages",
      payload: /^--(c_programming_languages|c_pl)=(.+)$/,
      doc: 'Optional JSON Array literal of up to three programming language names to filter cloned repositories by, e.g.: \'["ActionScript", "HTML"]\'; set this via configuration file, preferably.',
    },

    {
      name: "Clone: Dry mode",
      payload: /^--(c_dry_mode|c_dm)=(yes|no)$/,
      doc: 'Sets whether to actually download the files when cloning ("yes", the default) or just print information the the console ("no"), without writing anything to disk.',
    },

    {
      name: "Generate",
      payload: /^--(generate|g)$/,
      doc: "If given, causes MASCOT to generate `asconfig.json` and other related files. Behavior is controlled via the `g_` arguments.",
    },

    {
      name: "Generate: SDK directory",
      payload: /^--(g_sdk_directory|g_sdk)=(.+)$/,
      doc: "The directory where the AIR ActionScript SDK lives. For pure AIR SDKs, this is the root folder; for FLEX & AIR combined SDKs, this is the `bin` sub-folder. Mandatory if `generate` was also given; set this via configuration file, preferably.",
    },

    {
      name: "Generate: Manual dependencies",
      payload: /^--(g_manual_dependencies|g_md)=(.+)$/,
      doc: "Optional JSON Array literal of Objects having each the keys `project` (String) and `dependencies` (Array of Strings). All strings are absolute paths to projects living under the `Workspace Directory`. Up to but not including the `src` folder. All given `dependencies` will be added to `project`. Set this via configuration file, preferably.",
    }
  ],
  intrinsicDefaults: {
    c_forks_behavior: "mix",
    c_dry_mode: "no",
  },
};

(async function () {
  const exitValue = await wrapAndRun(settings, cliMain);
  if ([0, 1, 2].includes(exitValue)) {
    process.exit(exitValue);
  }
})();
