"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addInternalNote, changeTravelRequestStatus } from "./actions";
import { TRAVEL_REQUEST_STATUS_LABELS, type TravelRequestStatus } from "@/lib/status";

const STATUSES = Object.keys(TRAVEL_REQUEST_STATUS_LABELS) as TravelRequestStatus[];

export function StatusNoteForm({
  travelRequestId,
  currentStatus,
}: {
  travelRequestId: string;
  currentStatus: TravelRequestStatus;
}) {
  const router = useRouter();
  const [newStatus, setNewStatus] = useState<TravelRequestStatus>(currentStatus);
  const [statusNote, setStatusNote] = useState("");
  const [note, setNote] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusSaving(true);
    setError(null);
    try {
      await changeTravelRequestStatus(travelRequestId, newStatus, statusNote);
      setStatusNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Changement de statut impossible");
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNoteSaving(true);
    setError(null);
    try {
      await addInternalNote(travelRequestId, note);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout de la note impossible");
    } finally {
      setNoteSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-fenua-violet dark:border-white/10 dark:bg-transparent";

  return (
    <div className="mt-3 space-y-4">
      <form onSubmit={handleStatusChange} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">Nouveau statut</span>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as TravelRequestStatus)}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {TRAVEL_REQUEST_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <input
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          placeholder="Commentaire (visible du client, optionnel)"
          className={`${inputClass} flex-1 min-w-48`}
        />
        <button
          type="submit"
          disabled={statusSaving || newStatus === currentStatus}
          className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-60 dark:border-white/10"
        >
          {statusSaving ? "…" : "Changer le statut"}
        </button>
      </form>

      <form onSubmit={handleAddNote} className="space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note interne (jamais visible du client)"
          rows={2}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={noteSaving || !note.trim()}
          className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-60 dark:border-white/10"
        >
          {noteSaving ? "…" : "Ajouter la note"}
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
