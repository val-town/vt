import { Command } from "@cliffy/command";
import ValTown from "@valtown/sdk";
import Kia from "kia";
import sdk, { branchIdToBranch } from "~/sdk.ts";
import { CheckoutResult } from "~/vt/git/checkout.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { dirtyErrorMsg } from "~/cmd/git/utils.ts";

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
  .example(
    "Switch to an existing branch",
    `vt checkout main`,
  )
  .example(
    "Create a new branch",
    `vt checkout -b new-feature`,
  )
  .example(
    "Force checkout ignoring local changes",
    `vt checkout -f main`,
  )
  .example(
    "Create a new branch and force checkout",
    `vt checkout -b bugfix -f`,
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
      spinner.start();

      // !branch && await vt.isDirty(cwd) means that we only do the isDirty
      // check if the branch is not new
      if (!force && (!branch && await vt.isDirty())) {
        spinner.fail(dirtyErrorMsg("checkout"));
        return;
      }

      let checkoutResult: CheckoutResult;

      if (branch) {
        // -b flag was used, create new branch from source
        try {
          checkoutResult = await vt.checkout(branch, config.currentBranch);

          spinner.succeed(
            `Created and switched to new branch "${branch}" from "${checkoutResult.fromBranch.name}"`,
          );
        } catch (e) {
          if (e instanceof ValTown.APIError && e.status === 409) {
            spinner.fail(`Branch "${branch}" already exists`);
          } else {
            throw e; // Re-throw error if it's not a 409
          }
        }
      } else if (existingBranchName) {
        try {
          // Verify that the branch exists, and if it exists that it is not
          // the branch we are already on.
          const branch = await branchIdToBranch(
            config.projectId,
            existingBranchName,
          );
          if (branch.name == existingBranchName) {
            spinner.fail(`Already on branch "${existingBranchName}"`);
            return;
          }
        } catch (e) {
          if (e instanceof Deno.errors.NotFound) {
            const project = await sdk.projects.retrieve(config.projectId);
            throw new Deno.errors.NotFound(
              `Branch "${existingBranchName}" not found in project "${project.name}"`,
            );
          } else throw e;
        }

        checkoutResult = await vt.checkout(existingBranchName);

        spinner.succeed(
          `Switched to branch "${existingBranchName}" from "${checkoutResult.fromBranch.name}"`,
        );
      } else {
        spinner.fail(
          "Branch name is required. Use -b to create a new branch or specify an existing branch name",
        );
        return;
      }
    },
  );
