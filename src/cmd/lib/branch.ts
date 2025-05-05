import { Command } from "@cliffy/command";
import sdk, { branchNameToBranch } from "~/sdk.ts";
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

async function listBranches(vt: VTClient) {
  return await doWithSpinner("Loading branches...", async (spinner) => {
    const meta = await vt.getMeta().loadVtState();

    const branches = await Array.fromAsync(
      sdk.vals.branches.list(meta.val.id, {}),
    );

    const formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

    // Separate current branch, place it at the top, and then sort the rest
    // by update time
    const currentBranch = branches
      .find((branch) => branch.id === meta.branch.id);

    const otherBranches = branches
      .filter((branch) => branch.id !== meta.branch.id)
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
          branch.id === meta.branch.id
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
}

async function deleteBranch(vt: VTClient, toDeleteName: string) {
  const meta = await vt.getMeta().loadVtState();

  await doWithSpinner("Deleting branch...", async (spinner) => {
    const toDeleteBranch = await branchNameToBranch(
      meta.val.id,
      toDeleteName,
    );
    if (toDeleteBranch.id === meta.branch.id) {
      throw new Error(
        "Cannot delete the current branch. Please switch to another branch first.",
      );
    }

    await sdk.vals.branches.delete(meta.val.id, toDeleteBranch.id);
    spinner.succeed(`Branch '${toDeleteName}' has been deleted.`);
  });
}

export const branchCmd = new Command()
  .name("branch")
  .description("List or delete branches")
  .option(
    "-D, --delete <name:string>",
    "Delete a branch",
  )
  .example("List all branches", "vt branch")
  .action(async ({ delete: delete_ }) => {
    const vt = VTClient.from(await findVtRoot(Deno.cwd()));

    if (delete_) {
      await deleteBranch(vt, delete_);
    } else {
      await listBranches(vt);
    }
  });
