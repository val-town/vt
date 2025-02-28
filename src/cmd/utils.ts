export function getActiveDir(givenDir: string): string {
  return givenDir || Deno.cwd();
}

