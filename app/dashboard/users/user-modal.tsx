"use client";

import { useState } from "react";
import { UserForm } from "./user-form";

export function UserModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="rounded-md bg-[#d90000] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700">+ Add user</button>
      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <div role="dialog" aria-modal="true" aria-labelledby="create-user-title" className="w-full max-w-[920px] rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 id="create-user-title" className="text-lg font-extrabold tracking-[-0.03em] text-slate-900">Create user</h2>
                <p className="mt-0.5 text-sm font-medium text-slate-500">Add a new team member to your CRM.</p>
              </div>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-lg text-slate-500 hover:bg-slate-100">×</button>
            </div>
            <UserForm onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
