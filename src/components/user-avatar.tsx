"use client";
import { useState } from "react";
import { Avatar } from "./stat";

/** Foto do usuário logado (se houver), com as iniciais como alternativa. */
export function UserAvatar({ name, version, size = "md" }: { name: string; version: string | null; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const dim = size === "lg" ? "h-16 w-16" : "h-8 w-8";
  if (!version || failed) return size === "lg" ? <span className="inline-flex scale-[2] p-2"><Avatar name={name} /></span> : <Avatar name={name} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/me/avatar?v=${encodeURIComponent(version)}`} alt="" className={`${dim} shrink-0 rounded-full object-cover`} onError={() => setFailed(true)} />
  );
}
