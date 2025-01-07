# MASCOT
### **M**aster **A**ction**S**cript **C**onfiguration **O**ptimizer **T**ool
#### **MASCOT** automatically resolves ActionScript project dependencies and generates `asconfig.json`, `settings.json` and `tasks.json` files for easier setup and compilation with [Josh Tynjala](https://www.patreon.com/josht)'s [ActionScript & MXML](https://as3mxml.com) extension for [Visual Studio Code](https://code.visualstudio.com/).

**MASCOT** streamlines the process of managing large ActionScript codebases by analyzing coupling relationships between all the classes found in all the projects of a set workspace. From here, projects dependency relationships are inferred, and configuration files are automatically generated for every project in the workspace. With these configuration files in place, building an arbitrary ActionScript project in the workspace is as simple as:
- Opening the project in Visual Studio Code.
- Triggering the _build tasks_ menu (**Ctrl+B** or **Cmd+B** by default).
- Choosing, e.g.: **MASCOT: compile debug (with deps)**.

![MASCOT - build tasks](img/mascot-build-tasks.png)

<br/>

> **Note**: MASCOT is _not_ a Visual Studio Code extension, but a standalone Node.js module with a CLI. This means that you can either use it from the command line, like an application, or from your own Node.js code, like a package/library.

## 1. Using MASCOT From the Command Line
First, install MASCOT globally, using:
```bash
 npm install -g mascot-app
 ```
 Then, initialize a configuration file by doing:
 ```bash
 mascot-app --ic
 ```
 This will create file `mascot.config` in your user directory. The command will print the exact path of the created file. Open it in your favorite JSON editor and provide at least the `workspace_directory` and the `g_sdk_directory` information. Note that you can _override_ all the information given in the configuration file _from the command line_, at run time.

 Provide needed and accurate configuration info (see next sections for details), then call:
 ```bash
 mascot-app --g
 ```
 to have MASCOT (re)generate the `asconfig.json`, `settings.json` and `tasks.json` files, which will enable you to run the **MASCOT: compile...** build task, as previously described.

 > **Note**: remember to call `mascot-app --g` after each important change you bring to the dependency tree of your project, or else the MASCOT build tasks might fail to correctly compile your project and its dependencies.

 ### 1.1. Sample `mascot.config` file content
 The `appInfo` section is auto-generated; you only enter configuration data under the `settings` section of one or more `profiles`. See next in this document for the complete list of all configuration directives. 
 ```json
{
  "appInfo":{
    "appName":"mascot",
    "appAuthor":"Claudius Iacob <claudius.iacob@gmail.com>",
    "appVersion":"1.0.0",
    "appDescription":"Master ActionScript COnfigurator Tool. MASCOT automatically resolves ActionScript project dependencies and generates `asconfig.json` files for easy compilation with `asconfigc`."
  },
  "profiles":[
    {
      "name":"default",
      "settings":{
        "workspace_directory":"d:\\_DEV_\\github\\actionscript",
        "c_user_name":"ciacob",
        "c_programming_languages":[
          "ActionScript"
        ],
        "g_sdk_directory":"d:\\_BUILD_\\AS3\\AIR_51.1.3_Flex_4.16.1\\bin",
        "g_manual_dependencies":[
          {
            "project":"d:\\_DEV_\\github\\actionscript\\maidens",
            "dependencies":[
              "d:\\_DEV_\\github\\actionscript\\abc2svg-as3-library"
            ]
          }
        ]
      }
    }
  ]
}
 ```
> **Note**: the `g_manual_dependencies` featured above is optional information, and is only needed when MASCOT fails to automatically detect all the dependencies of a particular project.

 ### 1.2. Input Data Flow
 In the above example, all the configuration is provided under `<root>/profiles/default/settings`. You can use any name you wish for a profile name, but keep in mind that the **default** profile is always loaded by the application, so it's a very convenient place to store information that you want always available. You can also store diverging information in a subsequent profile, and load that profile at run time, via the `--cp` argument, which will override the defaults as needed.

 > **Note**: MASCOT builds a merged input dataset from (1) the `default` configuration profile, (2) any other profile loaded explicitly, via `--cp`, and (3) the command line arguments, each datasource overriding the previous one as needed.
 >
> ![MASCOT - input data flow](img/mascot-input-data-flow.png)

### 1.3. Full List of Configuration Directives
Remember that, in order to provide a configuration value via the command line, **you must prepend two dashes** (`--`) to its name, e.g., use `c_user_name` in the configuration file, but use `--c_user_name` in the command line.

| Long Name | Short Name | General form (RegEx)                 | Description 
|-----------|------------|--------------------------------------|------------
**workspace_directory** | **wd** | `/^--(workspace_directory\|wd)=(.+)$/` | The directory where actionscript projects live. Also the directory where GitHub repositories are cloned, if requested. Mandatory; set this via configuration file, preferably.
**clone** | **c** | `/^--(clone\|c)$/` | If given, causes MASCOT to attempt to clone some GitHub repositories. Behavior is controlled via the `c_` arguments.
**c_user_name** | **c_un** | `/^--(c_user_name\|c_un)=(.+)$/` | The user name to use when cloning GitHub repositories. Mandatory if `--clone` was also given; set this via configuration file, preferably.
**c_forks_behavior** | **c_fb** | `/^--(c_forks_behavior\|c_fb)=(exclude\|only\|mix)$/` | Sets what will happen with forks when cloning repositories. One of **exclude** (forks will not be cloned), **only** (just the forks will be cloned), or **mix** (the default: both forks and non-forks will be cloned). Set this via configuration file, preferably. Accepted values: **exclude**, **only**, **mix**.
**c_programming_languages** | **c_pl** | `/^--(c_programming_languages\|c_pl)=(.+)$/` | Optional JSON Array literal of up to three programming language names to filter cloned repositories by, e.g.: `["ActionScript", "HTML"]`; set this via configuration file, preferably.
**c_dry_mode** | **c_dm** | `/^--(c_dry_mode\|c_dm)=(yes\|no)$/` | Sets whether to actually download the files when cloning (**yes**, the default) or just print information the the console (**no**), without writing anything to disk. Accepted values: **yes**, **no**.
**generate** | **g** | `/^--(generate\|g)$/` | If given, causes MASCOT to generate `asconfig.json` and other related files. Behavior is controlled via the `g_` arguments.
**g_sdk_directory** | **g_sdk** | `/^--(g_sdk_directory\|g_sdk)=(.+)$/` | The directory where the AIR ActionScript SDK lives. For pure AIR SDKs, this is the root folder; for FLEX & AIR combined SDKs, this is the `bin` sub-folder. Mandatory if `generate` was also given; set this via configuration file, preferably.
**g_manual_dependencies** | **g_md** | `/^--(g_manual_dependencies\|g_md)=(.+)$/` | Optional JSON Array literal of Objects having each one the keys `project` (String) and `dependencies` (Array of Strings). All strings are absolute paths to projects living under the **workspace_directory**. Up to, but not including the `src` folder. All given `dependencies` will be added to `project`. Set this via configuration file, preferably.
**help** | **h** | `/^--(help\|h)$/` | Displays information about the program's input parameters and exits.
**init_config** | **ic** | `/^--(init_config\|ic)$/` | Initializes an empty configuration file in the user's home directory and exits.
**config_profile** | **cp** | `/^--(config_profile\|cp)=(.+)$/` | Loads default data from a configuration profile if it has been defined.

Remember that you can review all of the above at run time, by doing:
```bash
mascot-app --h
```
> **Note**: the **c_programming_languages** and **g_manual_dependencies** pose significant challenges when given from the command line, which is why it is strongly recommended to always pass them through the configuration file. For example, in Windows, to tell MASCOT to only clone the GitHub repositories that match the programming languages _ActionScript_ and _HTML_, you would have to pass, from the command line: 
`--c_pl="[\"ActionScript\", \"HTML\"]"`
whereas, in the configuration file, you would simply give:
`"c_programming_languages":["ActionScript", "HTML"]`
which is a lot more convenient.

> **Note**: while short names should work in the configuration file too, it is recommended to use the long names instead, since they improve the file readability and  maintainability (and you anyhow only need to type them once, in-there).

> **Note**: MASCOT has a small GitHub batch cloning functionality, accessible via `--clone` (or `--c`), and configurable via the `--c_...` arguments. If you intend to use this functionality, it is recommended to set it up from the configuration file (e.g., define in-there `c_user_name`, `c_programming_languages`, etc.), and only trigger the actual cloning when needed, by passing `--c` from the command line.

## 2. Using MASCOT From Code
MASCOT is also a CommonJS module. For your convenience, the `own_modules/core.js` module re-exports in one place all the functions exported by all the other modules, so in order to access the API of MASCOT in your code you could simply install it locally:
```bash
 npm install mascot-app
 ```
 then require everything from `core.js`:
 ```javascript
 const {
  cloneRepos,
  cloneRepo,
  doShallowScan,
  doDeepScan,
  manuallyAddDependencies,
  buildDependencies,
  makeBuildTasks,
  writeConfig,
  writeVSCSettings,
  writeVSCTasks,
} = require ('/path/to/core.js'); // usually: mascot-app/core

// Example: collect all classes from all the ActionScript folders in the workspace and store them
// under `/path/to/cache_dir/projects.json`.
doShallowScan ('/path/to/workspace_dir', '/path/to/cache_dir', true);
 ```

Please refer to the specific [source files](https://github.com/ciacob/MASCOT/tree/master/src/own_modules) on GitHub for the documentation of each of the above mentioned functions.

## 3. Releases
Make sure to frequently check the [Releases](https://github.com/ciacob/MASCOT/releases) section on GitHub for information on the changes, known issues and limitations of each released version of **MASCOT**. The version currently on the `master` GitHub branch should be considered as _nightly build_, and its use is discouraged.
