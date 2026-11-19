"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Trash2 } from "lucide-react";
import { deleteGeoFence, saveGeoFence, toggleGeoFence, type GeoFenceAssignment } from "./actions";

type User = { id: string; name: string };
const RADIUS_PRESETS = [50, 100, 200, 500];

export function GeoSettingsManager({ users, fences }: { users: User[]; fences: GeoFenceAssignment[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [isPending, startTransition] = useTransition();

  const nameById = new Map(users.map((user) => [user.id, user.name]));
  const assignedUserIds = new Set(fences.map((fence) => fence.user_id));
  const availableUsers = users.filter((user) => !assignedUserIds.has(user.id));

  function useMyLocation() {
    if (!navigator.geolocation) { setMessage("This browser does not support location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLat(position.coords.latitude.toFixed(6)); setLng(position.coords.longitude.toFixed(6)); setLocating(false); },
      () => { setMessage("Could not get your current location. Enter coordinates manually."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const formData = new FormData(event.currentTarget);
      const result = await saveGeoFence(formData);
      setMessage(result.message);
      if (result.ok) { setUserId(""); setLabel(""); setLat(""); setLng(""); setRadius("100"); router.refresh(); }
    });
  }

  function toggle(fence: GeoFenceAssignment) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", fence.id);
      formData.set("isActive", String(!fence.is_active));
      await toggleGeoFence(formData);
      router.refresh();
    });
  }

  function remove(fence: GeoFenceAssignment) {
    if (!window.confirm(`Remove the geofence for ${nameById.get(fence.user_id) ?? "this user"}?`)) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", fence.id);
      await deleteGeoFence(formData);
      router.refresh();
    });
  }

  return <div className="mt-6 space-y-6">
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-extrabold text-slate-900">Add a geofence</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">CRM user *
          <select name="userId" required value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-red-400">
            <option value="">Select a user</option>
            {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">Label <span className="font-medium text-slate-400">(optional)</span>
          <input name="label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Office HQ" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" />
        </label>
        <label className="text-xs font-bold text-slate-700">Latitude *
          <input name="lat" required inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="19.076090" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" />
        </label>
        <label className="text-xs font-bold text-slate-700">Longitude *
          <input name="lng" required inputMode="decimal" value={lng} onChange={(event) => setLng(event.target.value)} placeholder="72.877426" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" />
        </label>
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">Radius (meters) *
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {RADIUS_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setRadius(String(preset))} className={`rounded-md border px-3 py-1.5 text-xs font-bold ${radius === String(preset) ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}>{preset} m</button>)}
            <input name="radiusMeters" required inputMode="numeric" value={radius} onChange={(event) => setRadius(event.target.value.replace(/\D/g, ""))} className="h-9 w-28 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" />
          </div>
        </label>
      </div>
      <button type="button" onClick={useMyLocation} disabled={locating} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><MapPin className="h-3.5 w-3.5 text-red-600" />{locating ? "Getting location…" : "Use my current location as the center"}</button>
      {message && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${message.includes("saved") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}
      <div className="mt-4 flex justify-end"><button disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Saving…" : "Save geofence"}</button></div>
    </form>

    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3"><h2 className="text-sm font-extrabold text-slate-900">Configured geofences</h2></div>
      <div className="divide-y divide-slate-100">
        {fences.map((fence) => <div key={fence.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <p className="text-sm font-extrabold text-slate-800">{nameById.get(fence.user_id) ?? "Unknown user"}{fence.label && <span className="ml-2 font-medium text-slate-400">({fence.label})</span>}</p>
            <p className="mt-0.5 text-xs text-slate-500">{fence.center_lat.toFixed(6)}, {fence.center_lng.toFixed(6)} · {fence.radius_meters} m radius</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => toggle(fence)} disabled={isPending} className={`rounded-full px-2.5 py-1 text-xs font-bold ${fence.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{fence.is_active ? "Active" : "Disabled"}</button>
            <button type="button" onClick={() => remove(fence)} disabled={isPending} aria-label="Remove geofence" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>)}
        {!fences.length && <p className="px-5 py-8 text-center text-sm font-semibold text-slate-400">No geofences configured yet.</p>}
      </div>
    </div>
  </div>;
}
