"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { correctTravelerDetails } from "./actions";

type InitialValues = {
  first_name: string | null;
  last_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_issuing_country: string | null;
  passport_expiry_date: string | null;
};

export function TravelerCorrectionForm({
  travelerId,
  initialValues,
}: {
  travelerId: string;
  initialValues: InitialValues;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      await correctTravelerDetails(travelerId, new FormData(event.currentTarget));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
      setStatus("idle");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-fenua-violet dark:border-white/10 dark:bg-transparent";
  const labelClass = "text-xs font-medium text-black/60 dark:text-white/60";

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={labelClass}>Prénom</span>
          <input name="first_name" required defaultValue={initialValues.first_name ?? ""} className={inputClass} />
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Nom</span>
          <input name="last_name" required defaultValue={initialValues.last_name ?? ""} className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={labelClass}>Sexe</span>
          <select name="sex" required defaultValue={initialValues.sex ?? ""} className={inputClass}>
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
          <input
            type="date"
            name="date_of_birth"
            required
            defaultValue={initialValues.date_of_birth ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className={labelClass}>Nationalité (code pays)</span>
        <input
          name="nationality"
          required
          maxLength={3}
          defaultValue={initialValues.nationality ?? ""}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1">
        <span className={labelClass}>Numéro de passeport</span>
        <input
          name="passport_number"
          required
          defaultValue={initialValues.passport_number ?? ""}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={labelClass}>Pays émetteur (code)</span>
          <input
            name="passport_issuing_country"
            required
            maxLength={3}
            defaultValue={initialValues.passport_issuing_country ?? ""}
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Date d&apos;expiration</span>
          <input
            type="date"
            name="passport_expiry_date"
            required
            defaultValue={initialValues.passport_expiry_date ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-60 dark:border-white/10"
      >
        {status === "saving" ? "Enregistrement…" : "Enregistrer la correction"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
