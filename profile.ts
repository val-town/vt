import { join } from "@std/path";
import { randomValName } from "~/sdk.ts";

const vtCmd = Deno.args[0] ? join(Deno.cwd(), Deno.args[0]) : "vt";
const tempDir = await Deno.makeTempDir();

try {
  const n = 5;

  await doProfileCase(
    "vt remix",
    tempDir,
    [
      "remix",
      "https://www.val.town/x/wolf/VtStressTestProject",
      randomValName(),
      "--no-editor-files",
    ],
    false,
    n,
  );

  await doProfileCase(
    "vt status",
    tempDir,
    ["status"],
    true,
    n,
  );

  await doProfileCase(
    "vt pull",
    tempDir,
    ["pull", "-f"],
    true,
    n,
  );

  for await (const dirEntry of Deno.readDir(tempDir)) {
    if (dirEntry.isDirectory) {
      const dirPath = join(tempDir, dirEntry.name);
      const asciiContent = crypto.randomUUID().repeat(1000);
      for (let j = 0; j < 50; j++) {
        const filePath = join(dirPath, `file${j}-${crypto.randomUUID()}.txt`);
        await Deno.writeTextFile(filePath, asciiContent);
      }
      console.log(`Created 50 files in ${dirPath}`);
    }
  }

  await doProfileCase(
    "vt push",
    tempDir,
    ["push"],
    true,
    n,
  );
} finally {
  await Deno.remove(tempDir, { recursive: true });
}

/**
 * Executes a profiling case with timing information.
 *
 * This function runs a command using the vt CLI and measures its execution time.
 * It can either run a single command in the specified directory or iterate through
 * subdirectories and run commands in each one.
 *
 * @param description - A description of the profiling case to be displayed
 * @param tempDir - The directory path where the command(s) will be executed
 * @param args - An array of command arguments
 * @param iterateDirectories - If true, will execute the command in each subdirectory of tempDir
 *                             If false (default), will execute the command in tempDir only
 * @param n - Number of times to run the command (default is 1)
 */
async function doProfileCase(
  description: string,
  tempDir: string,
  args: string[],
  iterateDirectories: boolean = false,
  n: number = 1,
) {
  console.log(`Profiling '${description}'`);
  const start = performance.now();

  for (let i = 0; i < n; i++) {
    if (iterateDirectories) {
      for await (const dirEntry of Deno.readDir(tempDir)) {
        if (dirEntry.isDirectory) {
          const dirPath = join(tempDir, dirEntry.name);
          const command = new Deno.Command(vtCmd, {
            args,
            cwd: dirPath,
          });
          const {stdout} = await command.output();
          console.log(new TextDecoder().decode(stdout));
        }
      }
    } else {
      const command = new Deno.Command(vtCmd, {
        args,
        cwd: tempDir,
      });
      await command.output();
    }
  }

  const duration = performance.now() - start;
  console.log(`Duration: ${duration.toFixed(4)} ms`);
  console.log();
}
