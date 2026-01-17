import { assertEquals } from "@std/assert";
import { removeNestedProperty } from "./utils.ts";

Deno.test("removeNestedProperty", () => {
  // Top level property
  const obj1 = { a: 1, b: 2 };
  const result1 = removeNestedProperty(obj1, "a");
  assertEquals(result1, { b: 2 });
  assertEquals(obj1, { a: 1, b: 2 }); // Original unchanged

  // Nested property
  const obj2 = {
    a: 1,
    b: {
      c: 2,
      d: { e: 3 },
    },
  };
  const result2 = removeNestedProperty(obj2, "b.d.e");
  assertEquals(result2, { a: 1, b: { c: 2, d: {} } });
  assertEquals(obj2.b.d.e, 3); // Original unchanged
});
