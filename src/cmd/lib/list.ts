import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import sdk from "~/sdk.ts";
import { doWithSpinner } from "~/cmd/utils.ts";

export const listCmd = new Command()
  .name("list")
  .description("List all your Vals")
  .example("List all vals", "vt list")
  .action(async () => {
    const myvals = await doWithSpinner(
      "Loading val list...",
      async (spinner) => {
        const myvals = await Array.fromAsync(sdk.me.vals.list({}));
        spinner.stop();
        return myvals;
      },
    );

    if (myvals.length === 0) {
      console.log(colors.yellow("You don't have any vals yet."));
      return;
    }

    // Display the vals in a table
    const valsTable = Table.from([
      [
        colors.bold("Name"),
        colors.bold("Privacy"),
        colors.bold("Created"),
      ],
      ...myvals.map((val) => [
        colors.green(val.name),
        val.privacy,
        colors.dim(new Date(val.createdAt).toLocaleDateString()),
      ]),
    ]);

    console.log(valsTable.toString());
    console.log();
    console.log(
      `Total: ${colors.yellow(myvals.length.toString())} vals`,
    );
  });
