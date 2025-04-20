import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt/input";
import { colors } from "@cliffy/ansi/colors";
import sdk, { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { relative } from "@std/path";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { tty } from "@cliffy/ansi/tty";

export const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("[projectUri:string] [targetDir:string] [branchName:string]")
  .example(
    "Interactive project selection",
    `vt clone`,
  )
  .example(
    "Clone with username/projectName",
    `vt clone username/projectName`,
  )
  .example(
    "Clone into the current directory",
    `vt clone username/projectName .`,
  )
  .example(
    "Clone with link",
    `vt clone https://www.val.town/x/username/projectName`,
  )
  .example(
    "Clone into a new directory",
    `vt clone username/projectName new-directory`,
  )
  .action(
    async (_, projectUri?: string, targetDir?: string, branchName?: string) => {
      let ownerName: string;
      let projectName: string;

      // If no project URI is provided, show interactive project selection
      if (!projectUri) {
        const projects = await doWithSpinner(
          "Loading projects...",
          async (spinner) => {
            const allProjects = [];
            for await (const project of sdk.me.projects.list({})) {
              allProjects.push(project);
            }
            spinner.stop();
            return allProjects;
          },
        );

        if (projects.length === 0) {
          console.log(colors.yellow("You don't have any projects yet."));
          return;
        }

        // Map projects to name format for selection
        const projectNames = projects.map((p) => p.name);

        const selectedProject = await Input.prompt({
          message: "Choose a project to clone",
          list: true,
          info: true,
          suggestions: projectNames,
        });

        const project = projects.find((p) => p.name === selectedProject);
        if (!project) {
          console.error(colors.red("Project not found"));
          return;
        }

        ownerName = project.author.username || user.username!;
        projectName = project.name;

        // Scroll up a line so that they don't see the prompt they were just
        // given
        tty.scrollDown(1);
      } else {
        // Parse project URI if provided
        const parsed = parseProjectUri(projectUri, user.username!);
        ownerName = parsed.ownerName;
        projectName = parsed.projectName;
      }

      return await doWithSpinner("Cloning project...", async (spinner) => {
        branchName = branchName || DEFAULT_BRANCH_NAME;
        const clonePath = getClonePath(targetDir, projectName);

        const vt = await VTClient.clone({
          rootPath: clonePath,
          projectName,
          username: ownerName,
        });
        await vt.addEditorTemplate();

        spinner.succeed(
          `Project ${ownerName}/${projectName} cloned to "${
            relative(Deno.cwd(), clonePath)
          }"`,
        );
      });
    },
  );
