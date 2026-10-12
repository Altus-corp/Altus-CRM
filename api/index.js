import crm from "../server/index.cjs";

const { handler } = crm;

function apiPath(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const route = String(url.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  if (!route || route.split("/").some((part) => part === "." || part === "..")) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "Not found." }));
    return false;
  }
  url.searchParams.delete("path");
  req.url = `/api/${route}${url.search}`;
  return true;
}

export default function api(req, res) {
  return apiPath(req, res) && handler(req, res);
}
