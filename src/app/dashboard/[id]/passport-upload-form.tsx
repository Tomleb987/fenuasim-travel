"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadPassportPhoto } from "../actions";

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function PassportUploadForm({ travelRequestId }: { travelRequestId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);

    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_MIME_TYPES.includes(selected.type)) {
      setError("Format non supporté. Utilisez une photo JPEG, PNG, WebP ou HEIC.");
      setFile(null);
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setError("Photo trop volumineuse (10 Mo maximum).");
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.set("passport_photo", file);
      await uploadPassportPhoto(travelRequestId, formData);
      router.refresh();
    } catch {
      setError("Envoi impossible. Merci de réessayer.");
      setStatus("idle");
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Photo du passeport
      </h2>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Prenez en photo la page principale de votre passeport (celle avec votre photo et vos
        informations).
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          onChange={handleFileChange}
          className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-black/5 file:px-4 file:py-2 file:text-sm file:font-medium dark:file:bg-white/10"
        />
        <button
          type="submit"
          disabled={!file || status === "uploading"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "uploading" ? "Envoi…" : "Envoyer la photo"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
