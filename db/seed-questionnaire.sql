-- ============================================================================
-- FENUASIM TRAVEL — Seed : questionnaire ESTA v1
-- À exécuter une fois (donnée/config, pas une migration de schéma applicative).
-- ============================================================================
-- Les 9 questions d'éligibilité ESTA (catégories standard CBP), rédigées en
-- français à partir des catégories officielles — ATTENTION : ce n'est pas une
-- copie certifiée de la traduction DHS/CBP, à faire relire avant mise en
-- production réelle (cf. docs/etape-0-mvp-esta.md, Sprint 3).
--
-- `on conflict` ne met à jour que title/schema_json : `is_active` n'est
-- volontairement jamais réécrit ici pour ne pas écraser une décision
-- d'activation prise ensuite depuis le back-office (src/app/admin/dashboard/questionnaire).

insert into questionnaires (destination_code, version, title, schema_json, is_active)
values (
  'ESTA_US',
  1,
  'Questionnaire d''éligibilité ESTA — v1',
  '[
    {
      "key": "communicable_disease",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous une maladie transmissible présentant un intérêt pour la santé publique (choléra, tuberculose active, peste, variole, fièvre jaune, fièvres hémorragiques virales dont Ebola, etc.), ou un trouble physique ou mental pouvant représenter une menace pour vous-même ou pour autrui, ou êtes-vous toxicomane ?"
    },
    {
      "key": "arrest_conviction",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà été arrêté(e) ou condamné(e) pour une infraction ayant causé un dommage grave à des biens ou un préjudice grave à une personne ou à une autorité publique ?"
    },
    {
      "key": "controlled_substance_trafficking",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà été trafiquant(e) de stupéfiants, ou cherchez-vous à entrer aux États-Unis pour vous livrer à une activité illégale ou immorale ?"
    },
    {
      "key": "security_terrorism_espionage",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà été impliqué(e), ou cherchez-vous à vous livrer, à des activités d''espionnage, de sabotage, de terrorisme ou de génocide ; ou, entre 1933 et 1945, avez-vous été impliqué(e), de quelque manière que ce soit, dans des persécutions liées à l''Allemagne nazie ou à ses alliés ?"
    },
    {
      "key": "fraud_deportation",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà fraudé ou fait de fausses déclarations pour obtenir, ou aider une autre personne à obtenir, un visa ou une admission aux États-Unis, ou avez-vous déjà été expulsé(e) ou renvoyé(e) des États-Unis ?"
    },
    {
      "key": "child_custody",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà retenu la garde d''un enfant en dehors des États-Unis alors que la garde en avait été confiée à un(e) citoyen(ne) américain(e) ?"
    },
    {
      "key": "visa_denial_admission_refusal",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà eu un visa américain refusé pour le passeport que vous utilisez actuellement ou pour un passeport précédent, avez-vous déjà été refusé(e) à l''entrée aux États-Unis, ou avez-vous retiré votre demande d''admission à un point d''entrée américain ?"
    },
    {
      "key": "esta_visa_revoked",
      "type": "boolean",
      "required": true,
      "label": "Avez-vous déjà eu une autorisation ESTA ou un visa américain annulé(e) ou révoqué(e) ?"
    },
    {
      "key": "travel_restricted_countries",
      "type": "boolean",
      "required": true,
      "label": "Depuis le 1er mars 2011, vous êtes-vous rendu(e) ou avez-vous séjourné en Iran, en Irak, en Libye, en Corée du Nord, en Somalie, au Soudan, en Syrie ou au Yémen (hors déplacement officiel pour le compte d''un gouvernement ou d''une armée) ?"
    }
  ]'::jsonb,
  true
)
on conflict (destination_code, version) do update set
  title = excluded.title,
  schema_json = excluded.schema_json;
