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

```bash
deno install -A -g -n=vt https://raw.githubusercontent.com/val-town/vt/refs/heads/main/install.ts
```

Or if you would prefer a more descriptive command with minimal permissions:

```bash
deno install --allow-read --allow-write --allow-run --allow-env --global --name=vt https://raw.githubusercontent.com/val-town/vt/refs/heads/main/install.ts
```

Set the `VAL_TOWN_API_KEY` environment variable to authenticate. Head over to
[val.town/settings/api](https://www.val.town/settings/api) to make a new one.
Make sure it has "Read and write" permissions on "Projects". Like so:

```bash
export VAL_TOWN_API_KEY=vtwn_notRealnotRealnotRealnotReal
```

Run `vt` to confirm everything is working:

```bash
$ vt --version
vt 0.0.1
```

## Getting Started

Let's walk through a complete workflow to get you familiar with the Val Town
CLI.

First, let's create a new project:

```bash
$ vt create hello-world
√ Created public project apricot in ./hello-world
$ cd hello-world
```

This directory is empty except for a metadata folder `.vt` that tracks your
project metadata. Let's start our project by adding a text file.

```bash
echo "Hello val town" > hello.txt
```

Upload this file to your project with `vt push`

```bash
$ vt push
√ Project pushed successfully from ./hello-world
```

Now run `vt open` to see your file in the Val Town UI.

#### HTTP Val

Now that we've written our text file, let's create an HTTP val. Create new file
with the `.http.tsx` extension and we'll automatically create it as an HTTP val
with an endpoint.

```bash
touch index.http.tsx
vt push
√ Project pushed successfully from ./hello-world
```
