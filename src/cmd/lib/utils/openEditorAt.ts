/**
 * Opens a file at the specified path using the editor defined in the EDITOR environment variable.
 * If the EDITOR variable is not set, it simply prints the file path.
 *
 * @param {string} filePath - The path to the file that should be opened in the editor.
 */
export async function openEditorAt(filePath: string) {
  const editor = Deno.env.get("EDITOR");

  if (editor) {
    const process = new Deno.Command(editor, {
      args: [filePath],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const { status } = process.spawn();
    if (!(await status).success) {
      console.log(`Failed to open editor ${editor}`);
    }
  } else {
    console.log(filePath);
  }
}
