# Val Town CLI

This is the cli to work with projects in the [Val Town](https://val.town)
platform.

```
Usage:   vt
Version: 0.0.11

Options:

  -h, --help     - Show this help.
  -V, --version  - Show the version number for this program.

Commands:

  clone     <projectUri> [cloneDir] [branchName]  - Clone a val town project
  push                                            - Push local changes to a val town project
  pull                                            - Pull the latest changes for a val town project
  status                                          - Show the working tree status
  branch                                          - List all project branches 
  checkout  [existingBranchName]                  - Check out a different branch
  watch                                           - Watch for changes and automatically sync with Val Town
  browse                                          - Open a project in a web browser
  create    <projectName> [targetDir]             - Create a new Val Town project
```

## Installation

To install or update to the latest version, run:

```bash
deno install -gAfr jsr:@valtown/vt
```

Or if you would prefer a more descriptive command with minimal permissions:

```bash
deno install --global --force --reload --allow-read --allow-write --allow-env --allow-net jsr:@valtown/vt
```

Set the `VAL_TOWN_API_KEY` environment variable to authenticate. Either as an
environment variable, or in a .env in your project. Head over to
[val.town/settings/api](https://www.val.town/settings/api) to make a new one.
Make sure it has "Read and write" permissions on "Projects".

```bash
# Or add to a .env in your project
export VAL_TOWN_API_KEY=vtwn_notRealnotRealnotRealnotReal
```

Run `vt` to confirm everything is working:

```bash
$ vt --version

vt 0.0.11
```

## Getting Started

Let's walk through a complete workflow to get you familiar with the Val Town
CLI.

First, let's create a new project:

```bash
$ vt create helloWorld

√ Created public project apricot in ./helloWorld

$ cd helloWorld
```

This directory is empty except for a metadata folder `.vt` that tracks your
project metadata. Let's start our project by adding a text file.

```bash
echo "Hello val town" > hello.txt
```

Upload this file to your project with `vt push`

```bash
$ vt push

Changes pushed:
  A (file) hello.txt

Changes pushed:
  1 created

√ Successfully pushed local changes
```

Now run `vt browse` to see your file in the Val Town website UI.

#### HTTP Val

Now that we've written our text file, let's create an HTTP val. Create new file
with the `.http.tsx` extension and we'll automatically create it as an HTTP val
with an endpoint. Any file with "http" in the name is detected to be an http
val, so `_http.tsx` also would work.

```bash
$touch index.http.tsx
$ vt push

Changes pushed:
  A (http) index.http.tsx
  M (file) hello.txt

Changes pushed:
  1 created
  1 modified

√ Successfully pushed local changes
```

Now, if we return to our browser we can see that an http val has been created.
It's erroring, let's fix that. Write a simple handler to the file:

```ts
export default async function (req) {
  return new Response(`Hello ${req.method} ${req.url}`);
}
```

Once that's written, run `vt push` again. Now I get a successful response from
my http val:

```bash
$ curl https://maxm--df1d09da00cd11f0a0de569c3dd06744.web.val.run

Hello GET https://maxm--df1d09da00cd11f0a0de569c3dd06744.web.val.run/
```
