import { Command } from "@cliffy/command";
import sdk from "~/sdk.ts";
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import ValTown from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const branchCmd = new Command()
  .name("branch")
  .description("List all project branches")
  .example("List all branches", "vt branch")
  .action(() => {
    doWithSpinner("Loading branches...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));
      const meta = await vt.getMeta().loadConfig();

      const branches: ValTown.Projects.BranchListResponse[] = [];
      for await (
        const file of (await sdk.projects.branches.list(meta.projectId, {}))
      ) branches.push(file);

      const formatter = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });

      // Separate current branch, place it at the top, and then sort the rest
      // by update time
      const currentBranch = branches
        .find((branch) => branch.id === meta.currentBranch);

      const otherBranches = branches
        .filter((branch) => branch.id !== meta.currentBranch)
        .sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

      const sortedBranches = currentBranch
        ? [currentBranch, ...otherBranches]
        : otherBranches;

      // Stop the spinner before printing out the result
      spinner.stop();

      const branchesTableList = Table.from([
        [
          colors.bold("Name"),
          colors.bold("Version"),
          colors.bold("Created On"),
          colors.bold("Updated On"),
        ],
        ...sortedBranches.map(
          (branch) => [
            branch.id === meta.currentBranch
              ? colors.green(`* ${branch.name}`)
              : branch.name,
            colors.cyan(branch.version.toString()),
            colors.yellow(formatter.format(new Date(branch.createdAt))),
            colors.magenta(formatter.format(new Date(branch.updatedAt))),
          ],
        ),
      ]);

      console.log(branchesTableList.toString());
    });
  });
