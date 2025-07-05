import { assertEquals } from "@std/assert";
import { asPosixPath } from "./utils.ts";

Deno.test("ensurePosixPath converts backslashes to forward slashes", () => {
  assertEquals(asPosixPath("path\\to\\file.txt"), "path/to/file.txt");
  assertEquals(
    asPosixPath("folder\\subfolder\\index.js"),
    "folder/subfolder/index.js",
  );
  assertEquals(asPosixPath("single\\path"), "single/path");
});

Deno.test("ensurePosixPath handles mixed path separators", () => {
  assertEquals(asPosixPath("path/to\\file.txt"), "path/to/file.txt");
  assertEquals(
    asPosixPath("folder\\subfolder/index.js"),
    "folder/subfolder/index.js",
  );
  assertEquals(asPosixPath("mixed\\path/to\\file"), "mixed/path/to/file");
});

Deno.test("ensurePosixPath preserves forward slashes", () => {
  assertEquals(asPosixPath("path/to/file.txt"), "path/to/file.txt");
  assertEquals(
    asPosixPath("folder/subfolder/index.js"),
    "folder/subfolder/index.js",
  );
  assertEquals(asPosixPath("/absolute/path"), "/absolute/path");
});

Deno.test("ensurePosixPath handles absolute Windows paths", () => {
  assertEquals(
    asPosixPath("C:\\Users\\user\\file.txt"),
    "/Users/user/file.txt",
  );
  assertEquals(
    asPosixPath("D:\\Projects\\myapp\\src\\index.ts"),
    "/Projects/myapp/src/index.ts",
  );
  assertEquals(asPosixPath("E:\\temp\\file"), "/temp/file");
});

Deno.test("ensurePosixPath handles absolute Windows paths with forward slashes", () => {
  assertEquals(
    asPosixPath("C:/Users/user/file.txt"),
    "/Users/user/file.txt",
  );
  assertEquals(
    asPosixPath("D:/Projects/myapp/src/index.ts"),
    "/Projects/myapp/src/index.ts",
  );
  assertEquals(asPosixPath("Z:/temp/file"), "/temp/file");
});

Deno.test("ensurePosixPath handles relative paths correctly", () => {
  assertEquals(asPosixPath("..\\parent\\file.txt"), "../parent/file.txt");
  assertEquals(asPosixPath(".\\current\\file.txt"), "./current/file.txt");
  assertEquals(asPosixPath("relative\\path"), "relative/path");
});

Deno.test("ensurePosixPath handles edge cases", () => {
  assertEquals(asPosixPath(""), "");
  assertEquals(asPosixPath("\\"), "/");
  assertEquals(asPosixPath("/"), "/");
  assertEquals(asPosixPath("file.txt"), "file.txt");
  assertEquals(asPosixPath("C:"), "");
  assertEquals(asPosixPath("C:\\"), "/");
});

Deno.test("ensurePosixPath handles UNC paths", () => {
  // UNC paths should be preserved but with forward slashes
  assertEquals(
    asPosixPath("\\\\server\\share\\file.txt"),
    "//server/share/file.txt",
  );
  assertEquals(
    asPosixPath("//server/share/file.txt"),
    "//server/share/file.txt",
  );
});

Deno.test("ensurePosixPath handles nested directories", () => {
  assertEquals(
    asPosixPath("parent\\child\\grandchild\\file.txt"),
    "parent/child/grandchild/file.txt",
  );
  assertEquals(
    asPosixPath("C:\\Program Files\\MyApp\\bin\\app.exe"),
    "/Program Files/MyApp/bin/app.exe",
  );
});
