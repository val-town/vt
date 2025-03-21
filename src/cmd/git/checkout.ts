import { Command } from "@cliffy/command";
import ValTown from "@valtown/sdk";
import { CheckoutResult } from "~/vt/git/checkout.ts";
import { dirtyErrorMsg } from "~/cmd/git/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

const toListBranches = "Use \`vt branch\` to list branches.";

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
    (
      { branch, force }: { branch?: string; force?: boolean },
      existingBranchName?: string,
    ) => {
      doWithSpinner("Checking out branch...", async (spinner) => {
        const vt = VTClient.from(await findVtRoot(Deno.cwd()));
        const config = await vt.getMeta().loadConfig();

        const statusResult = await vt.status();
        // !branch && await vt.isDirty(cwd) means that we only do the isDirty
        // check if the branch is not new
        if (!force && (!branch && await vt.isDirty({ statusResult }))) {
          throw new Error(dirtyErrorMsg("checkout"));
        }

        let checkoutResult: CheckoutResult;

        if (branch) {
          // -b flag was used, create new branch from source
          try {
            checkoutResult = await vt
              .checkout(branch, {
                forkedFrom: config.currentBranch,
                statusResult,
              });

            spinner.succeed(
              `Created and switched to new branch "${branch}" from "${checkoutResult.fromBranch.name}"`,
            );
          } catch (e) {
            if (e instanceof ValTown.APIError && e.status === 409) {
              throw new Error(
                `Branch "${branch}" already exists. Choose a new branch name. ` +
                  toListBranches,
              );
            } else throw e; // Re-throw error if it's not a 409
          }
        } else if (existingBranchName) {
          try {
            checkoutResult = await vt.checkout(existingBranchName, {
              statusResult,
            });

            spinner.succeed(
              `Switched to branch "${existingBranchName}" from "${checkoutResult.fromBranch.name}"`,
            );
          } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
              throw new Error(
                `Branch "${existingBranchName}" does not exist in project. ` +
                  toListBranches,
              );
            } else throw e; // Re-throw other errors
          }
        } else {
          throw new Error(
            "Branch name is required. Use -b to create a new branch " +
              toListBranches,
          );
        }
      });
    },
  );
