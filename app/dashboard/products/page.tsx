import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";

export const instant = false;

export default async function ProductsPage() {
  const { roles } = await requireUser();
  if (!roles.includes("admin") && !roles.includes("sales_executive") && !roles.includes("sales_manager")) redirect("/dashboard");
  const isAdmin = roles.includes("admin");

  // Products are shared CRM configuration. Use the same cached configuration
  // source as Leads and Admin so a manager sees every active product even
  // before they have product work assigned personally.
  const { products, columnsError } = await getLeadSharedConfig();

  return <section className="mx-auto max-w-[1500px] space-y-5">
    <header>
      <p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">PRODUCT WORKSPACE</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Products</h1>
      <p className="mt-1 text-sm text-slate-500">{isAdmin ? "Open a product to review every assigned lead and reassign its product work." : "Open a product to review its stages, leads, follow-ups, and activity resolutions."}</p>
    </header>
    {columnsError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">Products could not be loaded. Please refresh the page.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => <Link key={product.id} href={`/dashboard/products/${encodeURIComponent(product.code)}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">{product.code.replace(/_/g, " ")}</p><h2 className="mt-2 text-lg font-extrabold text-slate-900">{product.name}</h2><span className="mt-4 inline-block text-xs font-bold text-red-600 group-hover:underline">Open workspace →</span></Link>)}{!products.length && <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">No active products are configured yet.</p>}</div>}
  </section>;
}
