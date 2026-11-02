"use client";

import { useEffect, useState } from "react";

export function WmsProfileAvatar({ initials, onClick, expanded }: { initials: string; onClick: () => void; expanded: boolean }) {
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/wms/attendance/me")
      .then(async (response) => response.json() as Promise<{ profileImage?: string | null }>)
      .then((data) => { if (active && data.profileImage) setProfileImage(data.profileImage); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return <button type="button" onClick={onClick} aria-label="Open profile menu" aria-expanded={expanded} className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#d90000] text-[10px] font-extrabold text-white ring-offset-2 transition hover:ring-2 hover:ring-red-200 focus:outline-none focus:ring-2 focus:ring-red-300" style={profileImage ? { backgroundImage: `url(${profileImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{profileImage ? <span className="sr-only">{initials}</span> : initials}</button>;
}
