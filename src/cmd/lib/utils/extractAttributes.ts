import type ValTown from "@valtown/sdk";

export function extractAttributes(
  attributes: ValTown.Telemetry.Logs.LogListResponse.Data.Attribute[],
) {
  const result: Record<string, string> = {};
  for (const attr of attributes) {
    if (attr.value.stringValue) {
      result[attr.key] = attr.value.stringValue;
    } else if (attr.value.intValue !== undefined) {
      result[attr.key] = attr.value.intValue.toString();
    } else if (attr.value.boolValue !== undefined) {
      result[attr.key] = attr.value.boolValue.toString();
    }
  }

  return {
    valType: result["val.type"],
    valFileId: result["val.file_id"],
    valBranchId: result["val.branch_id"],
    valVersion: result["val.version"],
    httpReqMethod: result["http.request.method"],
    httpResStatusCode: result["http.response.status_code"],
    urlFull: result["url.full"],
    ...result,
  };
}
