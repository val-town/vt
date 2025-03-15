import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import sdk, { branchIdToName } from "~/sdk.ts";
import Kia from "kia";
import ValTown from "@valtown/sdk";

export const checkoutCmd = new Command()
  .name("checkout")
  .description("Check out a different branch")
  .arguments("[existingBranchName:string]")
  .option(
    "-b, --branch <newBranchName:string>",
    "Create a new branch with the specified name",
  )
  .option(
    "-f, --force",
    "Force checkout by ignoring local changes",
  )
  .action(
    async (
      { branch, force }: { branch?: string; force?: boolean },
      existingBranchName?: string,
    ) => {
      const spinner = new Kia("Checking out branch...");
      const cwd = Deno.cwd();

      const vt = VTClient.from(cwd);
      const config = await vt.getMeta().loadConfig();
      try {
        spinner.start();

        if (!force && await vt.isDirty()) {
          spinner.fail(
            "Cannot checkout with unpushed changes. " +
              "Use `checkout -f` to ignore local changes.",
          );
          return;
        }

        if (branch) {
          // -b flag was used, create new branch from source
          try {
            await vt.checkout(branch, config.currentBranch);

            const existingBranchName = await sdk.projects.branches.retrieve(
              config.projectId,
              config.currentBranch,
            ).then((branch) => branch.name);

            spinner.succeed(
              `Created and switched to new branch "${branch}" from "${existingBranchName}"`,
            );
          } catch (error) {
            if (error instanceof ValTown.APIError && error.status === 409) {
              spinner.fail(`Branch "${branch}" already exists.`);
            } else {
              throw error; // Re-throw error if it's not a 409
            }
          }
        } else if (existingBranchName) {
          // Regular checkout. Check to see if branch exists.
          try {
            await branchIdToName(config.projectId, existingBranchName);
          } catch {
            const project = await sdk.projects.retrieve(config.projectId);
            throw new Error(
              `Branch "${existingBranchName}" not found in project "${project.name}"`,
            );
          }

          await vt.checkout(cwd, existingBranchName);
          spinner.succeed(`Switched to branch "${existingBranchName}"`);
        } else {
          throw new Error("Branch name is required");
        }
      } catch (error) {
        if (error instanceof Error) {
          spinner.fail(error.message);
        }
      }
    },
  );
