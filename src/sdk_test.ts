import { assert, assertFalse } from "@std/assert";
import { canWriteToVal } from "./sdk.ts";
import { doWithNewVal } from "./vt/lib/tests/utils.ts";

Deno.test({
  name: "Checking if we can write to Vals",
  permissions: "inherit",
  async fn() {
    const VAL_WE_CANT_WRITE_TO = "b037fb4a-791b-11f0-b97e-0224a6c84d84";

    await doWithNewVal(async ({ val }) => {
      assert(await canWriteToVal(val.id));
      assertFalse(await canWriteToVal(VAL_WE_CANT_WRITE_TO));
    });
  },
  sanitizeResources: false,
});
