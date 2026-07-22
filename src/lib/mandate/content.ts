// Texte du mandat électronique — rédigé comme point de départ raisonnable,
// PAS une version validée juridiquement. À faire relire par un juriste avant
// mise en production réelle (cf. docs/etape-0-mvp-esta.md, Sprint 4), même
// caveat que db/seed-questionnaire.sql pour les questions ESTA.
//
// `MANDATE_VERSION` doit être incrémentée à chaque changement du texte
// ci-dessous : la version acceptée est tracée dans `mandates.version`, et le
// texte exact accepté est de toute façon figé dans `mandates.content_snapshot`
// à la signature (traçabilité même si ce fichier évolue ensuite).
export const MANDATE_VERSION = "1";

export const MANDATE_TEXT = `MANDAT D'ASSISTANCE ADMINISTRATIVE — DEMANDE ESTA

En signant ce mandat, vous autorisez FENUASIM à effectuer, en votre nom et pour votre compte, les démarches suivantes auprès du système américain ESTA (Electronic System for Travel Authorization) : saisie et transmission des informations que vous avez fournies et validées dans ce dossier, paiement des frais officiels ESTA pour votre compte, et dépôt de la demande d'autorisation de voyage.

FENUASIM n'est ni un organisme gouvernemental américain, ni affilié au gouvernement des États-Unis. FENUASIM propose un service payant d'assistance administrative ; l'ESTA peut être demandée directement et gratuitement (hors frais officiels) sur le site officiel du gouvernement américain.

Vous certifiez que toutes les informations fournies dans ce dossier sont exactes et complètes à votre connaissance, et que les réponses au questionnaire d'éligibilité reflètent fidèlement votre situation. FENUASIM ne garantit pas l'obtention de l'autorisation ESTA, la décision finale relevant exclusivement des autorités américaines.

Les frais de service FENUASIM restent dus une fois la demande déposée auprès des autorités américaines, y compris en cas de refus de l'autorisation ESTA. Les frais officiels du gouvernement américain ne sont, dans tous les cas, ni remboursables ni sous le contrôle de FENUASIM une fois transmis.

En cochant la case de consentement et en indiquant votre nom complet ci-dessous, vous signez électroniquement ce mandat. Cette signature a la même valeur qu'une signature manuscrite ; l'horodatage, l'adresse IP et le navigateur utilisés sont conservés comme preuve d'acceptation.`;
