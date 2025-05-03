import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import sdk from "~/sdk.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { arrayFromAsyncN } from "~/utils.ts";

const VAL_LIST_BATCH_SIZE = 20;

export const listCmd = new Command()
  .name("list")
  .arguments("[offset:number]")
  .description("List all your Vals")
  .example("List all vals", "vt list")
  .action(async (_, offset) => {
    const [myVals, hasMore] = await doWithSpinner(
      "Loading val list...",
      async (spinner) => {
        const result = await arrayFromAsyncN(
          sdk.me.vals.list({ offset }),
          VAL_LIST_BATCH_SIZE,
        );

        spinner.stop();
        return result;
      },
    );

    if (myVals.length === 0) {
      if (!offset) console.log(colors.yellow("You don't have any Vals yet."));
      else console.log(colors.yellow(`No Vals found at offset ${offset}.`));
      return;
    }

    // Display the vals in a table
    const valsTable = Table.from([
      [
        colors.bold("Name"),
        colors.bold("Privacy"),
        colors.bold("Created"),
      ],
      ...myVals.map((val) => [
        colors.green(val.name),
        val.privacy,
        colors.dim(new Date(val.createdAt).toLocaleDateString()),
      ]),
    ]);

    // If there are more vals, add a note at the bottom
    if (hasMore) {
      valsTable.push([
        colors.yellow("..."),
        colors.yellow("..."),
        colors.yellow("..."),
      ]);
    }

    console.log(valsTable.toString());
    console.log();

    if (hasMore) {
      const nextOffset = (offset || 0) + VAL_LIST_BATCH_SIZE;
      console.log(
        colors.yellow(
          `Listed ${
            colors.bold(myVals.length.toString())
          } Vals, but there are more.\n` +
            `Use \`vt list <${
              colors.bold(nextOffset.toString())
            }>\` to view the next batch.`,
        ),
      );
    } else {
      console.log(
        `Listed ${colors.yellow(myVals.length.toString())} Vals.`,
      );
    }
  });
