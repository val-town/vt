import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import sdk from "~/sdk.ts";
import { doWithSpinner } from "~/cmd/utils.ts";

export const listCmd = new Command()
  .name("list")
  .description("List all your Val Town projects")
  .example("List all projects", "vt list")
  .action(async () => {
    const myProjects = await doWithSpinner(
      "Loading project list...",
      async (spinner) => {
        const myProjects = await Array.fromAsync(sdk.me.vals.list({}));
        spinner.stop();
        return myProjects;
      },
    );

    if (myProjects.length === 0) {
      console.log(colors.yellow("You don't have any projects yet."));
      return;
    }

    // Display the projects in a table
    const projectsTable = Table.from([
      [
        colors.bold("Name"),
        colors.bold("Privacy"),
        colors.bold("Created"),
      ],
      ...myProjects.map((project) => [
        colors.green(project.name),
        project.privacy,
        colors.dim(new Date(project.createdAt).toLocaleDateString()),
      ]),
    ]);

    console.log(projectsTable.toString());
    console.log();
    console.log(
      `Total: ${colors.yellow(myProjects.length.toString())} projects`,
    );
  });
