"use client";

import { useEffect, useState } from "react";

export function WmsProfileAvatar({ initials }: { initials: string }) {
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/wms/attendance/me")
      .then(async (response) => response.json() as Promise<{ profileImage?: string | null }>)
      .then((data) => { if (active && data.profileImage) setProfileImage(data.profileImage); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return <div aria-label="Your profile" className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#d90000] text-[10px] font-extrabold text-white" style={profileImage ? { backgroundImage: `url(${profileImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{profileImage ? <span className="sr-only">{initials}</span> : initials}</div>;
}
