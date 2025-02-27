import ValTown from "@valtown/sdk";
import "@std/dotenv/load";

export default new ValTown({
  bearerToken: Deno.env.get("VAL_TOWN_BEARER_TOKEN")!,
});
