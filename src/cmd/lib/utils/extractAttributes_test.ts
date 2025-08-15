import { assertEquals } from "@std/assert";
import { extractAttributes } from "./extractAttributes.ts";
import type ValTown from "@valtown/sdk";

Deno.test("extractAttributes", () => {
  const attributes: ValTown.Telemetry.Logs.LogListResponse.Data.Attribute[] = [
    {
      key: "val.type",
      value: { stringValue: "http" },
    },
    {
      key: "val.file_id",
      value: { stringValue: "file123" },
    },
    {
      key: "http.request.method",
      value: { stringValue: "GET" },
    },
  ];

  const result = extractAttributes(attributes);

  assertEquals(result.valType, "http");
  assertEquals(result.valFileId, "file123");
  assertEquals(result.httpReqMethod, "GET");
  assertEquals(result.valType, "http");
  assertEquals(result.valFileId, "file123");
  assertEquals(result.httpReqMethod, "GET");
});
