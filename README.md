# Val Town CLI

This is the cli to work with projects in the [Val Town](https://val.town)
platform.

```
$ vt
Usage:   vt
Version: 0.0.1

Options:

  -h, --help     - Show this help.
  -V, --version  - Show the version number for this program.

Commands:

  clone     <projectUri> [cloneDir] [branchName]  - Clone a val town project
  pull                                            - Pull the latest changes for a val town project
  push                                            - Push local changes to a val town project
  status                                          - Show the working tree status
  branch                                          - List all project branches
  watch                                           - Watch for changes and automatically sync with Val Town
  checkout  [existingBranchName]                  - Check out a different branch
  create    <projectName> [targetDir]             - Create a new Val Town project
```

## Installation

Install with:

```
deno install -A -g -n=vt https://raw.githubusercontent.com/val-town/vt/refs/heads/main/install.ts
```

Or if you would prefer a more descriptive command with minimal permissions:

```
deno install --allow-read --allow-write --allow-run --allow-env --global --name=vt https://raw.githubusercontent.com/val-town/vt/refs/heads/main/install.ts
```

Set the `VAL_TOWN_API_KEY` environment variable to authenticate. Head over to
[val.town/settings/api](https://www.val.town/settings/api) to make a new one.
Make sure it has "Read and write" permissions on "Projects".

## Getting Started
