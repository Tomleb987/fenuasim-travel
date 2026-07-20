"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitTravelerDetails } from "../actions";

export function TravelerDetailsForm({
  travelerId,
  previewUrl,
}: {
  travelerId: string;
  previewUrl: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      await submitTravelerDetails(travelerId, new FormData(event.currentTarget));
      router.refresh();
    } catch {
      setError("Enregistrement impossible. Vérifiez les champs et réessayez.");
      setStatus("idle");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-fenua-violet dark:border-white/10";
  const labelClass = "text-xs font-medium text-black/60 dark:text-white/60";

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Vérifiez vos informations
      </h2>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        La lecture automatique n&apos;est pas encore disponible : merci de saisir vous-même les
        informations de votre passeport. Tous les champs sont modifiables.
      </p>

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Photo du passeport envoyée"
          className="mt-4 max-h-64 rounded-lg border border-black/10 dark:border-white/10"
        />
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={labelClass}>Prénom</span>
            <input name="first_name" required className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Nom</span>
            <input name="last_name" required className={inputClass} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={labelClass}>Sexe</span>
            <select name="sex" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Sélectionner
              </option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Date de naissance</span>
            <input type="date" name="date_of_birth" required className={inputClass} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>Nationalité (code pays, ex. FRA)</span>
          <input name="nationality" required maxLength={3} className={inputClass} />
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>Numéro de passeport</span>
          <input name="passport_number" required className={inputClass} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={labelClass}>Pays émetteur (code, ex. FRA)</span>
            <input name="passport_issuing_country" required maxLength={3} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Date d&apos;expiration</span>
            <input type="date" name="passport_expiry_date" required className={inputClass} />
          </label>
        </div>

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "saving" ? "Enregistrement…" : "Valider mes informations"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
