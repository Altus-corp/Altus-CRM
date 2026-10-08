import React from "react";
import { NavLink } from "react-router-dom";

export const NAV_ITEMS = [
  ["/leads", "Leads"],
  ["/marketing", "Marketing"],
  ["/reports", "Reports"],
  ["/quotes-invoicing", "Quote & Invoicing"],
  ["/accounts-contacts", "Accounts & Contacts"],
  ["/tasks-activity", "Tasks & Activity"],
];

export function Navbar() {
  return React.createElement("nav", { "aria-label": "Primary navigation" }, NAV_ITEMS.map(([to, label]) => React.createElement(NavLink, { key: to, to }, label)));
}
