"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptPassportField } from "@/lib/crypto/passport-encryption";
import { bytesToPgHex } from "@/lib/postgres-bytea";
import { generateScanToken, hashScanToken } from "@/lib/crypto/qr-token";
import { runPassportUploadSequence } from "./passport-upload-sequence";
import { parseQuestionnaireSchema, type QuestionnaireQuestion } from "@/lib/questionnaire/types";
import { MANDATE_TEXT, MANDATE_VERSION } from "@/lib/mandate/content";
import { computeLineAmounts, type Pricing } from "@/lib/pricing";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { sendTransactionalEmail } from "@/lib/email/brevo-client";

// app_settings n'a aucune policy de lecture pour un client authentifié
// (cf. db/schema.sql, section RLS) : ces valeurs sont lues côté serveur via
// service_role, jamais exposées en direct au front (docs section 9).
async function getAppSettingNumber(key: string): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service.from("app_settings").select("value").eq("key", key).single();

  if (error || !data) throw new Error(`Impossible de lire "${key}" (app_settings)`);
  return Number(data.value);
}

async function getEstaPriceCents(): Promise<number> {
  return getAppSettingNumber("esta_price_cents");
}

async function getQrSessionTtlMinutes(): Promise<number> {
  return getAppSettingNumber("qr_session_ttl_minutes");
}

export async function getPricing(): Promise<Pricing> {
  const [serviceFeeCents, officialFeeUsdCents, eurXpfRate, usdEurRate] = await Promise.all([
    getAppSettingNumber("esta_price_cents"),
    getAppSettingNumber("esta_official_fee_usd_cents"),
    getAppSettingNumber("eur_xpf_fixed_rate"),
    getAppSettingNumber("usd_eur_fx_rate"),
  ]);
  return { serviceFeeCents, officialFeeUsdCents, eurXpfRate, usdEurRate };
}

export async function createTravelRequest() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  // Un utilisateur authentifié (ex. session admin/back-office) mais sans
  // ligne `customers` liée n'est pas un client : redirection plutôt qu'un
  // 500 brut, cohérent avec le `!user` ci-dessus.
  if (customerError || !customer) redirect("/connexion");

  const priceAmountCents = await getEstaPriceCents();

  const { data: travelRequest, error: insertError } = await supabase
    .from("travel_requests")
    .insert({
      customer_id: customer.id,
      destination_code: "ESTA_US",
      price_amount_cents: priceAmountCents,
      source_platform: "desktop",
    })
    .select("id")
    .single();
  if (insertError || !travelRequest) throw new Error("Création du dossier impossible");

  // traveler_count vaut 1 par défaut : pas encore d'UI de sélection du nombre
  // de voyageurs, ce parcours ne gère qu'un seul voyageur pour le moment.
  const { error: travelerError } = await supabase.from("travelers").insert({
    travel_request_id: travelRequest.id,
  });
  if (travelerError) throw new Error("Création du voyageur impossible");

  await supabase.from("timeline").insert({
    travel_request_id: travelRequest.id,
    event_type: "status_change",
    to_status: "draft",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Dossier créé",
  });

  if (user.email) {
    const { success } = await sendTransactionalEmail({
      to: user.email,
      subject: "Votre dossier ESTA FenuaSIM a bien été créé",
      htmlContent: `<p>Bonjour,</p><p>Votre dossier de demande d'autorisation ESTA a bien été créé. Vous pouvez le retrouver à tout moment depuis votre espace client.</p>`,
    });
    if (success) {
      await supabase.from("timeline").insert({
        travel_request_id: travelRequest.id,
        event_type: "email_sent",
        actor_type: "system",
        message: "Email de confirmation de création du dossier envoyé",
      });
    }
  }

  redirect(`/dashboard/${travelRequest.id}`);
}

export async function uploadPassportPhoto(travelRequestId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // Le select ci-dessous respecte la RLS (travel_requests_select) : si ce
  // dossier n'appartient pas au client courant, aucune ligne n'est retournée.
  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status")
    .eq("id", travelRequestId)
    .single();
  if (!travelRequest) throw new Error("Dossier introuvable");
  if (travelRequest.status !== "draft" && travelRequest.status !== "to_verify") {
    throw new Error("Ce dossier n'accepte pas de nouvelle photo à ce stade");
  }

  const { data: traveler } = await supabase
    .from("travelers")
    .select("id")
    .eq("travel_request_id", travelRequestId)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  const file = formData.get("passport_photo");
  if (!(file instanceof File)) throw new Error("Aucune photo fournie");

  await runPassportUploadSequence({
    travelRequestId,
    travelerId: traveler.id,
    currentStatus: travelRequest.status,
    file,
    captureMethod: "desktop_upload",
    actorId: customer.id,
  });
}

export async function createQrScanSession(travelRequestId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Le select ci-dessous respecte la RLS (travel_requests_select) : si ce
  // dossier n'appartient pas au client courant, aucune ligne n'est retournée.
  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status")
    .eq("id", travelRequestId)
    .single();
  if (!travelRequest) throw new Error("Dossier introuvable");
  if (travelRequest.status !== "draft" && travelRequest.status !== "to_verify") {
    throw new Error("Ce dossier n'accepte pas de nouvelle photo à ce stade");
  }

  const token = generateScanToken();
  const ttlMinutes = await getQrSessionTtlMinutes();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  // qr_scan_sessions n'a aucune policy RLS (cf. db/schema.sql) : toute
  // création/consommation passe exclusivement par service_role côté serveur.
  const service = createServiceClient();
  const { error } = await service.from("qr_scan_sessions").insert({
    travel_request_id: travelRequestId,
    token_hash: hashScanToken(token),
    expires_at: expiresAt,
  });
  if (error) throw new Error("Création de la session de scan impossible");

  const scanUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/scan/${token}`;
  const qrCodeDataUrl = await QRCode.toDataURL(scanUrl);

  return { scanUrl, qrCodeDataUrl, expiresAt };
}

export async function submitTravelerDetails(travelerId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // travelers_select (owns_travel_request) garantit que cette ligne n'est
  // retournée que si le voyageur appartient à un dossier du client courant.
  const { data: traveler } = await supabase
    .from("travelers")
    .select("id, travel_request_id")
    .eq("id", travelerId)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const sex = String(formData.get("sex") ?? "");
  const dateOfBirth = String(formData.get("date_of_birth") ?? "");
  const nationality = String(formData.get("nationality") ?? "").trim();
  const passportNumber = String(formData.get("passport_number") ?? "").trim();
  const passportIssuingCountry = String(formData.get("passport_issuing_country") ?? "").trim();
  const passportExpiryDate = String(formData.get("passport_expiry_date") ?? "");

  if (
    !firstName ||
    !lastName ||
    !["M", "F", "X"].includes(sex) ||
    !dateOfBirth ||
    !nationality ||
    !passportNumber ||
    !passportIssuingCountry ||
    !passportExpiryDate
  ) {
    throw new Error("Tous les champs sont requis");
  }

  const { encrypted, keyVersion } = encryptPassportField(passportNumber);

  const { error: updateError } = await supabase
    .from("travelers")
    .update({
      first_name: firstName,
      last_name: lastName,
      sex,
      date_of_birth: dateOfBirth,
      nationality,
      passport_number_encrypted: bytesToPgHex(encrypted),
      passport_number_last4: passportNumber.slice(-4),
      passport_issuing_country: passportIssuingCountry,
      passport_expiry_date: passportExpiryDate,
      encryption_key_version: keyVersion,
      data_validated_by_customer: true,
      data_validated_at: new Date().toISOString(),
    })
    .eq("id", travelerId);
  if (updateError) throw new Error("Enregistrement des informations impossible");

  await supabase.from("timeline").insert({
    travel_request_id: traveler.travel_request_id,
    event_type: "note",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Informations passeport validées par le client",
  });

  revalidatePath(`/dashboard/${traveler.travel_request_id}`);
}

// Valide et normalise la valeur brute d'une réponse (FormData -> jsonb) selon
// le type de la question. Lève si la question est obligatoire et sans réponse
// exploitable, ou si la valeur ne correspond pas au type attendu.
function parseAnswerValue(question: QuestionnaireQuestion, raw: FormDataEntryValue | null): string | boolean | null {
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    if (question.required) throw new Error(`La question « ${question.label} » est obligatoire`);
    return null;
  }

  switch (question.type) {
    case "boolean":
      if (value !== "true" && value !== "false") {
        throw new Error(`Réponse invalide pour « ${question.label} »`);
      }
      return value === "true";
    case "select":
      if (!question.options?.includes(value)) {
        throw new Error(`Réponse invalide pour « ${question.label} »`);
      }
      return value;
    case "date":
    case "text":
      return value;
  }
}

export async function submitQuestionnaireAnswers(
  travelerId: string,
  questionnaireId: string,
  formData: FormData,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // travelers_select (owns_travel_request) garantit que cette ligne n'est
  // retournée que si le voyageur appartient à un dossier du client courant.
  const { data: traveler } = await supabase
    .from("travelers")
    .select("id, travel_request_id")
    .eq("id", travelerId)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  // On ne fait jamais confiance au questionnaireId soumis par le client comme
  // source de vérité : si un admin a activé une nouvelle version pendant que
  // ce client remplissait le formulaire, on le détecte ici plutôt que
  // d'enregistrer des réponses contre une version qui n'est plus active.
  const { data: activeQuestionnaire } = await supabase
    .from("questionnaires")
    .select("id, schema_json")
    .eq("destination_code", "ESTA_US")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!activeQuestionnaire || activeQuestionnaire.id !== questionnaireId) {
    throw new Error("Le questionnaire a été mis à jour, merci de recharger la page.");
  }

  const schema = parseQuestionnaireSchema(activeQuestionnaire.schema_json);

  const parsedAnswers = schema.map((question) => ({
    question,
    value: parseAnswerValue(question, formData.get(question.key)),
  }));

  const { data: existingAnswers } = await supabase
    .from("answers")
    .select("id, question_key")
    .eq("traveler_id", travelerId)
    .eq("questionnaire_id", questionnaireId)
    .is("deleted_at", null);

  const existingByKey = new Map((existingAnswers ?? []).map((a) => [a.question_key, a.id]));

  for (const { question, value } of parsedAnswers) {
    if (value === null) continue; // question optionnelle laissée vide

    const existingId = existingByKey.get(question.key);
    if (existingId) {
      const { error } = await supabase
        .from("answers")
        .update({ answer_value: value, question_label_snapshot: question.label })
        .eq("id", existingId);
      if (error) throw new Error("Enregistrement des réponses impossible");
    } else {
      const { error } = await supabase.from("answers").insert({
        travel_request_id: traveler.travel_request_id,
        traveler_id: travelerId,
        questionnaire_id: questionnaireId,
        question_key: question.key,
        question_label_snapshot: question.label,
        answer_value: value,
      });
      if (error) throw new Error("Enregistrement des réponses impossible");
    }
  }

  await supabase.from("timeline").insert({
    travel_request_id: traveler.travel_request_id,
    event_type: "note",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Questionnaire ESTA complété par le client",
  });

  revalidatePath(`/dashboard/${traveler.travel_request_id}`);
}

export async function submitMandate(travelerId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // travelers_select (owns_travel_request) garantit que cette ligne n'est
  // retournée que si le voyageur appartient à un dossier du client courant.
  const { data: traveler } = await supabase
    .from("travelers")
    .select("id, travel_request_id")
    .eq("id", travelerId)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status")
    .eq("id", traveler.travel_request_id)
    .single();
  if (!travelRequest || travelRequest.status !== "to_verify") {
    throw new Error("Cette étape n'est plus disponible pour ce dossier.");
  }

  // Ne fait jamais confiance à l'écran atteint côté client : revalide que le
  // questionnaire actif est entièrement répondu avant d'accepter la signature,
  // même logique de complétion dérivée que dans page.tsx / submitQuestionnaireAnswers.
  const { data: activeQuestionnaire } = await supabase
    .from("questionnaires")
    .select("id, schema_json")
    .eq("destination_code", "ESTA_US")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!activeQuestionnaire) throw new Error("Questionnaire introuvable");

  const schema = parseQuestionnaireSchema(activeQuestionnaire.schema_json);
  const { data: answers } = await supabase
    .from("answers")
    .select("question_key")
    .eq("traveler_id", travelerId)
    .eq("questionnaire_id", activeQuestionnaire.id)
    .is("deleted_at", null);
  const answeredKeys = new Set((answers ?? []).map((a) => a.question_key));
  const questionnaireComplete = schema.filter((q) => q.required).every((q) => answeredKeys.has(q.key));
  if (!questionnaireComplete) {
    throw new Error("Merci de répondre au questionnaire avant de signer le mandat.");
  }

  const signerFullName = String(formData.get("signer_full_name") ?? "").trim();
  if (!signerFullName) throw new Error("Le nom complet est requis pour signer");
  if (formData.get("consent") !== "on") {
    throw new Error("Merci de cocher la case d'acceptation du mandat");
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = requestHeaders.get("user-agent");

  const acceptedAt = new Date().toISOString();
  const proofHash = createHash("sha256")
    .update(`${MANDATE_VERSION}|${MANDATE_TEXT}|${traveler.travel_request_id}|${signerFullName}|${acceptedAt}`)
    .digest("hex");

  const { error: mandateError } = await supabase.from("mandates").insert({
    travel_request_id: traveler.travel_request_id,
    customer_id: customer.id,
    version: MANDATE_VERSION,
    content_snapshot: MANDATE_TEXT,
    signer_full_name: signerFullName,
    ip_address: ipAddress,
    user_agent: userAgent,
    accepted_at: acceptedAt,
    proof_hash: proofHash,
  });

  if (mandateError) {
    // 23505 = violation de mandates_one_per_request_idx : un mandat existe déjà
    // pour ce dossier (double-clic / soumission concurrente) — traité comme
    // déjà signé plutôt qu'en erreur.
    if (mandateError.code !== "23505") {
      throw new Error("Signature du mandat impossible");
    }
  } else {
    const { error: statusError } = await supabase
      .from("travel_requests")
      .update({ status: "payment_pending" })
      .eq("id", traveler.travel_request_id)
      .eq("status", "to_verify");
    if (statusError) throw new Error("Mise à jour du dossier impossible");

    await supabase.from("timeline").insert({
      travel_request_id: traveler.travel_request_id,
      event_type: "mandate_signed",
      from_status: "to_verify",
      to_status: "payment_pending",
      actor_type: "customer",
      actor_id: customer.id,
      message: `Mandat électronique signé par ${signerFullName}`,
    });
  }

  revalidatePath(`/dashboard/${traveler.travel_request_id}`);
}

export async function createCheckoutSession(travelRequestId: string, currency: "eur" | "xpf") {
  if (!isStripeConfigured()) {
    throw new Error("Le paiement en ligne n'est pas encore disponible.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // travel_requests_select (owns_travel_request) garantit que cette ligne
  // n'est retournée que si le dossier appartient au client courant.
  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status")
    .eq("id", travelRequestId)
    .single();
  if (!travelRequest || travelRequest.status !== "payment_pending") {
    throw new Error("Cette étape n'est plus disponible pour ce dossier.");
  }

  // Ne fait jamais confiance à l'écran atteint côté client : un dossier ne
  // peut être payé que si un mandat a bien été signé au préalable.
  const { data: mandate } = await supabase
    .from("mandates")
    .select("id")
    .eq("travel_request_id", travelRequestId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!mandate) throw new Error("Le mandat électronique doit être signé avant le paiement.");

  const pricing = await getPricing();
  const { serviceFeeAmount, officialFeeAmount, amountTotal } = computeLineAmounts(currency, pricing);
  const idempotencyKey = randomUUID();

  // payments n'a aucune policy d'insert pour authenticated (cf. db/schema.sql :
  // écriture exclusivement service_role, côté webhook/actions serveur) —
  // même justification que getAppSettingNumber ci-dessus.
  const service = createServiceClient();
  const { data: payment, error: paymentError } = await service
    .from("payments")
    .insert({
      travel_request_id: travelRequestId,
      currency,
      amount_cents: amountTotal,
      service_fee_amount: serviceFeeAmount,
      official_fee_amount: officialFeeAmount,
      official_fee_amount_usd_cents: pricing.officialFeeUsdCents,
      fx_rate_eur_xpf: currency === "xpf" ? pricing.eurXpfRate : null,
      fx_rate_usd_eur: pricing.usdEurRate,
      idempotency_key: idempotencyKey,
      status: "pending",
    })
    .select("id")
    .single();
  if (paymentError || !payment) throw new Error("Impossible de préparer le paiement");

  const stripe = getStripeClient();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        currency,
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: "Frais de service FenuaSIM — ESTA" },
              unit_amount: serviceFeeAmount,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency,
              product_data: { name: "Frais officiels ESTA (gouvernement américain)" },
              unit_amount: officialFeeAmount,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/dashboard/${travelRequestId}?payment=success`,
        cancel_url: `${baseUrl}/dashboard/${travelRequestId}?payment=cancelled`,
        metadata: { travel_request_id: travelRequestId, payment_id: payment.id },
        expand: ["payment_intent"],
      },
      { idempotencyKey },
    );
  } catch (error) {
    console.error("Stripe: création de la session de paiement en échec", error);
    throw new Error("Le paiement n'a pas pu être initié. Réessayez.");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  await service
    .from("payments")
    .update({
      stripe_payment_intent_id: paymentIntentId ?? null,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
    })
    .eq("id", payment.id);

  if (!session.url) throw new Error("Le paiement n'a pas pu être initié. Réessayez.");
  redirect(session.url);
}

export async function getPassportPreviewUrl(documentId: string): Promise<string | null> {
  const supabase = await createClient();

  // documents_select (owns_travel_request) garantit que ce document
  // n'est retourné que s'il appartient à un dossier du client courant.
  const { data: document } = await supabase
    .from("documents")
    .select("storage_bucket, storage_path")
    .eq("id", documentId)
    .single();
  if (!document) return null;

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 300);
  if (error || !data) return null;

  return data.signedUrl;
}
