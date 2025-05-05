# Val Town CLI

`vt` is the official CLI to work with projects on the
[Val Town](https://val.town) platform.

```
Usage:   vt    
Version: x.x.xx

Options:

  -h, --help     - Show this help.                            
  -V, --version  - Show the version number for this program.  

Commands:

  clone     [valUri] [targetDir] [branchName]      - Clone a Val                                           
  push                                             - Push local changes to a Val                           
  pull                                             - Pull the latest changes for the current Val           
  status                                           - Show the working tree status                          
  branch                                           - List or delete branches                               
  checkout  [existingBranchName]                   - Check out a different branch                          
  watch                                            - Watch for changes and automatically sync with Val Town
  browse                                           - Open a Val's main page in a web browser               
  create    <valName> [targetDir]                  - Create a new Val                                      
  remix     <fromValUri> [newValName] [targetDir]  - Remix a Val                                           
  config                                           - Manage vt configuration                               
  delete                                           - Delete the current Val                                
  list                                             - List all your Vals
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

  VT is a companion CLI to interface with Val Town vals.

  With this CLI, you can:
  - Create and manage Val Town vals
  - Push and pull changes between your local system and Val Town
  - Watch a directory to keep it automatically synced with Val Town
  - And more!

  To get started, you need to authenticate with Val Town.

? Would you like to open val.town/settings/api in a browser to get an API key? (y/n) ›
```

Respond yes, and ensure you select to create an API key with user read & val
read+write permissions.

Alternatively, you can set the `VAL_TOWN_API_KEY` environment variable to
authenticate. Either as an environment variable, or place it in a .env in your
val.

Now you can run `vt` again to confirm everything is working:

```bash
$ vt --version

vt x.x.xx
```

## Getting Started

Let's walk through a complete workflow to get you familiar with the Val Town
CLI.

First, let's remix a nice starting val.

```bash
$ vt remix std/reactHonoStarter myNewWebsite

√ Remixed "@std/reactHonoStarter" to public Val "@you/myNewWebsite"

$ cd myNewWebsite
```

![Your new Val!](https://wolf-imagedumper.web.val.run/blob/blob_file_1744521935175_7f04c371-d619-4062-8bc6-941d56a23eed.png)

Alternatively, you can use `vt create` to create a new empty val. If you don't
specify a path, the name of the Val will automatically be used.

When you `remix`, `create`, or `clone` a val, `vt` creates a `.vt` that tracks
your Val metadata. You can think of this like `.git`, it is not meant to be
manually edited and is used for internal bookkeeping.

`vt` also creates an ignore file, `.vtignore`, which works like `.gitignore`,
and a `deno.json`. By having a `deno.json`, your editor will be able to make use
of the [Deno LSP](https://docs.deno.com/runtime/reference/cli/lsp/) (for code
suggestions -- red squiggles, etc). If you use `vscode`, head over and get
[Deno's official VsCode plugin](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno).

If you use some other editor, you'll want to head over to
[Deno's editor set up](https://docs.deno.com/runtime/getting_started/setup_your_environment/)
guide and find how to configure yours.

If you use packages in your val, your editor may warn you that you do not have
those packages installed (or "cached"). Occasionally you'll want to run
`deno cache .` to make sure that all the libraries you use in your Val Town val
are installed locally.

![Making changes](https://wolf-imagedumper.web.val.run/blob/blob_file_1744522002151_95d9436e-9e8b-4361-880f-bf6d7e970741.png)

Let's start editing our val! Fire up your favorite editor, and then make a
change to `README.md`.

Now, let's upload this file to your Val with `vt push`

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

![Reverting](https://filedumpthing.val.run/blob/blob_file_1744908459972_recording.gif)

Note that `vt push` in general **is** a _forceful_ operation and there are never
confirmations when you push. This is because if you ever need to "undo" a push,
you can use the Val Town website to revert to a previous version. Make sure
after reverting to do a `vt pull` to get that new change reflected locally. `vt`
pull **is** _graceful_, so you may have to confirm you are OK losing the local
state when you pull. There should never be a situation where you run a command
that causes irreversible changes.

The `deno.json` and `.vtignore` get tracked in Val Town, but don't get pushed
until you run `vt push`. If you don't want this behavior, then you can delete
them and add `deno.json` and `.vtignore` to the `.vtignore`(the `.vtignore` will
respect itself being ignored!).

![Browse the Val on the website](https://wolf-imagedumper.web.val.run/blob/blob_file_1744522722640_recording.gif)

Now run `vt browse` to see your file in the Val Town website UI. We advise you
use `vt` in conjunction with the Val Town website. The CLI can do a lot, but not
everything.

Sometimes, when working locally you want to create a specific type of val. In
general, `vt` does not touch the metadata of your vals (this means that metadata
like `cron` settings in general should get preserved when using `vt`. One
exception to this is the type of vals created when uploading **new** files with
`vt`.

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

Now, if we return to our browser we can see that an http Val has been created.
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

### Watching for Changes

Oftentimes you'll end up in a workflow that looks like

1. Make a change locally
2. `vt push`
3. Reload the website
4. Repeat

`vt`'s solution to tightening this loop is `vt watch`. With `vt watch`, `vt`
will automatically run `vt push` when any Val files are modified **locally**.

To get automatic website reloading, check out
[this live reload middleware](https://www.val.town/x/stevekrouse/live-reload)
that works by polling Val Town for updates.

### Branching Out

One common Val Town Val workflow is branching out. `vt`'s `checkout` and
`branch` command work the same as `git`'s.

- `vt checkout <branchName>` checks out the branch as it is on Val Town. You
  will receive confirmation if the process of checking out would cause loss of
  any local state. If it would, you can push before you checkout, or you can
  force checkout (by approving the confirmation or using `vt checkout -f`)
- `vt checkout -b <newBranchName>` creates a new branch and checks it out. If a
  file in the local state does not exist on Val Town on the initial branch, it
  will also not exist on the new branch until you push.
- `vt branch` lists all branches.
- `vt branch -D` deletes a branch. You can't delete the branch you are on.

### Management

- `vt list` lists all your Val Town Vals
- `vt delete` deletes the current Val of the folder you are in (with
  confirmation).

## Configuration

`vt` has a simple to use configuration interface whose backend rests in
`<System Configuration Directory>/vt/config.yaml`. Right now, this file only
stores your `config.yaml`, and some experimental options.

This config can also be overridden locally for specific Vals by, when you are in
a `.vt` directory, using `vt config set [-g for global]` (otherwise the global
config is modified). This can be useful if someone shares an API key with you so
you can collaborate on a Val. You can view all configuration options with
`vt config`, and all the ones you've set with `vt config get`.

Right now, we offer the following configuration options:

- `dangerousOperations.confirmation`: Whether to do confirmations on actions
  that might cause you to lose local state, like `vt pull`.
- `editorTemplate`: The Val URI for the editor files that you are prompted about
  when you run a `vt clone`, `vt remix`, or `vt create`.

## LLMs

`vt` lets you use all your favorite local LLM tools like
[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview),
[Cursor](https://www.cursor.com/), and [Windsurf](https://windsurf.com/editor)
with Val Town.

If you're using local AI tools, you will find it useful providing them
[OpenTownie's system prompt](https://esm.town/v/stevekrouse/OpenTownie/prompts/system_prompt.txt).

One quirk of `vt` that's a bit different from OpenTownie is that to create http
Vals you need to include `http` in the name of the file. You can amend the
prompt, or just change the type on the Val Town website after the fact.
