export default async function (req: Request): Promise<Response> {
  console.log(req.headers);
  // Learn more: https://docs.val.town/vals/http/
  return Response.json({ ok: true });
}