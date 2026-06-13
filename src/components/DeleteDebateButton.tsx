"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteDebateButtonProps {
  debateId: string;
  topic: string;
  onDeleted?: () => void;
  redirectHome?: boolean;
  className?: string;
}

export function DeleteDebateButton({
  debateId,
  topic,
  onDeleted,
  redirectHome = false,
  className = "",
}: DeleteDebateButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const label = topic.length > 40 ? `${topic.slice(0, 40)}…` : topic;
    if (!window.confirm(`「${label}」 토론을 삭제할까요?\n삭제하면 메시지·기록도 같이 없어집니다.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/debates/${debateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");

      onDeleted?.();
      if (redirectHome) router.push("/");
    } catch {
      window.alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs text-white/35 transition hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50 ${className}`}
      aria-label="토론 삭제"
    >
      {deleting ? "삭제 중…" : "삭제"}
    </button>
  );
}
