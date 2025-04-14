# Val Town CLI

VT is a cli to work with projects in the [Val Town](https://val.town) platform.

```
Usage:   vt    
Version: 0.1.19

Options:

  -h, --help     - Show this help.                            
  -V, --version  - Show the version number for this program.  

Commands:

  clone     [projectUri] [cloneDir] [branchName]           - Clone a val town project                              
  push                                                     - Push local changes to a val town project              
  pull                                                     - Pull the latest changes for a val town project        
  status                                                   - Show the working tree status                          
  branch                                                   - List or delete branches                               
  checkout  [existingBranchName]                           - Check out a different branch                          
  watch                                                    - Watch for changes and automatically sync with Val Town
  browse                                                   - Open a project in a web browser                       
  create    <projectName> [targetDir]                      - Create a new Val Town project                         
  remix     <fromProjectUri> [newProjectName] [targetDir]  - Remix a Val Town project                              
  config                                                   - Manage vt configuration                               
  delete                                                   - Delete a Val Town project                             
  list                                                     - List all your Val Town projects
```

## Installation

To install or update to the latest version, run:

```bash
deno install -grAf jsr:@valtown/vt
```

Or if you would prefer a more descriptive command with minimal permissions:

```bash
deno install --global --force --reload --allow-read --allow-write --allow-env --allow-net jsr:@valtown/vt
```

To authenticate with `val.town`, just run `vt`, and you should get the dialog

```
Welcome to the Val Town CLI!

  VT is a companion CLI to interface with Val Town projects.

  With this CLI, you can:
  - Create and manage Val Town projects
  - Push and pull changes between your local system and Val Town
  - Watch a directory to keep it automatically synced with Val Town
  - And more!

  To get started, you need to authenticate with Val Town.

? Would you like to open val.town/settings/api in a browser to get an API key? (y/n) ›
```

Respond yes, and ensure you select to create an API key with user read & project
read+write permissions.

Alternatively, you can set the `VAL_TOWN_API_KEY` environment variable to
authenticate. Either as an environment variable, or place it in a .env in your
project.

Now you can run `vt` again to confirm everything is working:

```bash
$ vt --version

vt 0.0.11
```

## Getting Started

Let's walk through a complete workflow to get you familiar with the Val Town
CLI.

First, let's remix a nice starting project.

```bash
$ vt remix std/reactHonoStarter myNewWebsite

√ Remixed "@std/reactHonoStarter" to public project "@you/myNewWebsite"

$ cd myNewWebsite
```

![Your new project!](https://wolf-imagedumper.web.val.run/blob/blob_file_1744521935175_7f04c371-d619-4062-8bc6-941d56a23eed.png)

Alternatively, you can use `vt create` to create a new empty project. If you
don't specify a path, the name of the project will automatically be used.

When you `remix`, `create`, or `clone` a project, `vt` creates a `.vt` that
tracks your project metadata. You can think of this like `.git`, it is not meant
to be manually edited and is used for internal bookkeeping.

`vt` also creates an ignore file, `.vtignore`, which works like `.gitignore`,
and a `deno.json`. By having a `deno.json`, your editor will be able to make use
of the [Deno LSP](https://docs.deno.com/runtime/reference/cli/lsp/) (for code
suggestions -- red squiggles, etc). If you use `vscode`, head over and get
[Deno's official VsCode plugin](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno).

If you use some other editor, you'll want to head over to
[Deno's editor set up](https://docs.deno.com/runtime/getting_started/setup_your_environment/)
guide and find how to configure yours.

![Making changes](https://wolf-imagedumper.web.val.run/blob/blob_file_1744522002151_95d9436e-9e8b-4361-880f-bf6d7e970741.png)

Let's start editing our project! Fire up your favorite editor, and then make a
change to `README.md`.

Now, let's upload this file to your project with `vt push`

```bash
Pushed:
  A (file) .vtignore
  A (file) deno.json
  M (file) README.md

Summary:
  2 created
  1 modified

√ Successfully pushed local changes
```

The `deno.json` and `.vtignore` by default get tracked in Val Town. If you don't
want this behavior, then you can delete them and add `deno.json` and `.vtignore`
to the `.vtignore`(the `.vtignore` will respect itself being ignored!).

![Browse the project on the website](https://wolf-imagedumper.web.val.run/blob/blob_file_1744522722640_recording.gif)

Now run `vt browse` to see your file in the Val Town website UI. We advise you
use `vt` in conjunction with the Val Town website. The CLI can do a lot, but not
everything.

#### HTTP Val

Now that we've written our text file, let's create a new HTTP val. Create new
file with the `.http.tsx` extension and we'll automatically create it as an HTTP
val with an endpoint. Any file with "http" in the name is detected to be an http
val, so `_http.tsx` also would work.

```bash
$touch index.http.tsx
$ vt push

Changes pushed:
  A (http) index.http.tsx

Changes pushed:
  1 created

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
