const test = require("node:test");
const assert = require("node:assert/strict");
test("rendered navbar has exactly six items for every role in both themes", async () => {
  const React = require("react");
  const ReactDOMServer = require("react-dom/server");
  const { MemoryRouter } = require("react-router-dom");
  const { Navbar } = await import("../src/shared/layout/nav.js");
  const roles = ["Owner", "Admin", "Sales", "Finance", "Marketing", "Viewer"];
  const themes = ["light", "dark"];
  const expected = ["Leads", "Marketing", "Reports", "Quote & Invoicing", "Accounts & Contacts", "Tasks & Activity"];
  for (const role of roles) for (const theme of themes) {
    const markup = ReactDOMServer.renderToStaticMarkup(React.createElement("div", { "data-theme": theme, "data-role": role }, React.createElement(MemoryRouter, { initialEntries: ["/leads"] }, React.createElement(Navbar))));
    const labels = [...markup.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    assert.deepEqual(labels, expected, `${role}/${theme}`);
  }
});
