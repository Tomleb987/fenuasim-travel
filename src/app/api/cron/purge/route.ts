import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Job de purge automatique (Sprint 6 — revue de sécurité) : déclenché par
// Vercel Cron (cf. vercel.json, quotidien à 3h UTC). Seul point d'entrée
// unauthentifié de ce dépôt côté serveur, protégé par un secret partagé plutôt
// que par une session — cf. https://vercel.com/docs/cron-jobs (en-tête
// Authorization: Bearer <CRON_SECRET>, injecté automatiquement par Vercel sur
// les invocations Cron réelles).
//
// Deux catégories, cf. docs/etape-0-mvp-esta.md section 8 (rétention) :
// - photos de passeport dont `documents.scheduled_deletion_at` est dépassé
//   (calculé à l'upload, cf. passport-upload-sequence.ts) ;
// - dossiers brouillon abandonnés depuis plus de `abandoned_draft_retention_days`.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const service = createServiceClient();

  async function getRetentionDays(key: string): Promise<number> {
    const { data, error } = await service.from("app_settings").select("value").eq("key", key).single();
    if (error || !data) throw new Error(`Impossible de lire "${key}" (app_settings)`);
    return Number(data.value);
  }

  // Supprime le fichier Storage puis marque la ligne `documents` comme
  // supprimée (soft delete) — jamais l'inverse, pour ne pas perdre la trace
  // d'un fichier orphelin si la suppression Storage échoue.
  async function purgeDocument(doc: { id: string; storage_bucket: string; storage_path: string }) {
    const { error: storageError } = await service.storage.from(doc.storage_bucket).remove([doc.storage_path]);
    if (storageError) {
      console.error("Purge: suppression Storage en échec", doc.id, storageError.message);
      return false;
    }
    await service.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", doc.id);
    return true;
  }

  let documentsPurged = 0;
  const { data: dueDocuments } = await service
    .from("documents")
    .select("id, travel_request_id, storage_bucket, storage_path")
    .lte("scheduled_deletion_at", new Date().toISOString())
    .is("deleted_at", null);

  for (const doc of dueDocuments ?? []) {
    const purged = await purgeDocument(doc);
    if (!purged) continue;
    documentsPurged += 1;
    await service.from("timeline").insert({
      travel_request_id: doc.travel_request_id,
      event_type: "system_event",
      actor_type: "system",
      message: "Photo de passeport purgée automatiquement (durée de rétention atteinte)",
    });
  }

  let draftsAbandoned = 0;
  const abandonedDraftRetentionDays = await getRetentionDays("abandoned_draft_retention_days");
  const draftCutoff = new Date(Date.now() - abandonedDraftRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: abandonedDrafts } = await service
    .from("travel_requests")
    .select("id")
    .eq("status", "draft")
    .is("deleted_at", null)
    .lte("created_at", draftCutoff);

  for (const draft of abandonedDrafts ?? []) {
    // Purge cascade : les documents de ce dossier partent avec lui, même si
    // leur propre scheduled_deletion_at n'est pas encore atteint — le dossier
    // entier disparaît, pas de raison de laisser un fichier orphelin derrière.
    const { data: draftDocuments } = await service
      .from("documents")
      .select("id, travel_request_id, storage_bucket, storage_path")
      .eq("travel_request_id", draft.id)
      .is("deleted_at", null);
    for (const doc of draftDocuments ?? []) {
      await purgeDocument(doc);
    }

    await service.from("travelers").update({ deleted_at: new Date().toISOString() }).eq("travel_request_id", draft.id);
    await service.from("travel_requests").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id);

    draftsAbandoned += 1;
    await service.from("timeline").insert({
      travel_request_id: draft.id,
      event_type: "system_event",
      actor_type: "system",
      message: `Dossier brouillon abandonné purgé automatiquement (> ${abandonedDraftRetentionDays} jours)`,
    });
  }

  return NextResponse.json({ documentsPurged, draftsAbandoned });
}
