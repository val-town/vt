import { assertEquals } from "@std/assert";
import { ensurePosixPath } from "./utils.ts";

Deno.test("ensurePosixPath converts backslashes to forward slashes", () => {
  assertEquals(ensurePosixPath("path\\to\\file.txt"), "path/to/file.txt");
  assertEquals(
    ensurePosixPath("folder\\subfolder\\index.js"),
    "folder/subfolder/index.js",
  );
  assertEquals(ensurePosixPath("single\\path"), "single/path");
});

Deno.test("ensurePosixPath handles mixed path separators", () => {
  assertEquals(ensurePosixPath("path/to\\file.txt"), "path/to/file.txt");
  assertEquals(
    ensurePosixPath("folder\\subfolder/index.js"),
    "folder/subfolder/index.js",
  );
  assertEquals(ensurePosixPath("mixed\\path/to\\file"), "mixed/path/to/file");
});

Deno.test("ensurePosixPath preserves forward slashes", () => {
  assertEquals(ensurePosixPath("path/to/file.txt"), "path/to/file.txt");
  assertEquals(
    ensurePosixPath("folder/subfolder/index.js"),
    "folder/subfolder/index.js",
  );
  assertEquals(ensurePosixPath("/absolute/path"), "/absolute/path");
});

Deno.test("ensurePosixPath handles absolute Windows paths", () => {
  assertEquals(
    ensurePosixPath("C:\\Users\\user\\file.txt"),
    "/Users/user/file.txt",
  );
  assertEquals(
    ensurePosixPath("D:\\Projects\\myapp\\src\\index.ts"),
    "/Projects/myapp/src/index.ts",
  );
  assertEquals(ensurePosixPath("E:\\temp\\file"), "/temp/file");
});

Deno.test("ensurePosixPath handles absolute Windows paths with forward slashes", () => {
  assertEquals(
    ensurePosixPath("C:/Users/user/file.txt"),
    "/Users/user/file.txt",
  );
  assertEquals(
    ensurePosixPath("D:/Projects/myapp/src/index.ts"),
    "/Projects/myapp/src/index.ts",
  );
  assertEquals(ensurePosixPath("Z:/temp/file"), "/temp/file");
});

Deno.test("ensurePosixPath handles relative paths correctly", () => {
  assertEquals(ensurePosixPath("..\\parent\\file.txt"), "../parent/file.txt");
  assertEquals(ensurePosixPath(".\\current\\file.txt"), "./current/file.txt");
  assertEquals(ensurePosixPath("relative\\path"), "relative/path");
});

Deno.test("ensurePosixPath handles edge cases", () => {
  assertEquals(ensurePosixPath(""), "");
  assertEquals(ensurePosixPath("\\"), "/");
  assertEquals(ensurePosixPath("/"), "/");
  assertEquals(ensurePosixPath("file.txt"), "file.txt");
  assertEquals(ensurePosixPath("C:"), "");
  assertEquals(ensurePosixPath("C:\\"), "/");
});

Deno.test("ensurePosixPath handles UNC paths", () => {
  // UNC paths should be preserved but with forward slashes
  assertEquals(
    ensurePosixPath("\\\\server\\share\\file.txt"),
    "//server/share/file.txt",
  );
  assertEquals(
    ensurePosixPath("//server/share/file.txt"),
    "//server/share/file.txt",
  );
});

Deno.test("ensurePosixPath handles nested directories", () => {
  assertEquals(
    ensurePosixPath("parent\\child\\grandchild\\file.txt"),
    "parent/child/grandchild/file.txt",
  );
  assertEquals(
    ensurePosixPath("C:\\Program Files\\MyApp\\bin\\app.exe"),
    "/Program Files/MyApp/bin/app.exe",
  );
});
