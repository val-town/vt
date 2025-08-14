import { assert, assertFalse } from "@std/assert";
import { canWriteToVal } from "./sdk.ts";
import { doWithNewVal } from "./vt/lib/tests/utils.ts";

Deno.test({
  name: "Checking if we can write to Vals",
  permissions: "inherit",
  async fn() {
    const VAL_WE_CANT_WRITE_TO = "6b9c47c6-0ffc-11f0-aae0-569c3dd06744";

    await doWithNewVal(async ({ val }) => {
      assert(await canWriteToVal(val.id));
      assertFalse(await canWriteToVal(VAL_WE_CANT_WRITE_TO));
    });
  },
  sanitizeResources: false,
});
