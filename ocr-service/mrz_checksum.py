"""Validation de checksums ICAO 9303 (Doc 9303, partie 4) pour une MRZ TD3
(passeport, 2 lignes de 44 caractères) et correction des confusions OCR
courantes (O<->0, I<->1, B<->8) avant abandon.
"""

from dataclasses import dataclass

_WEIGHTS = (7, 3, 1)


def _char_value(ch: str) -> int:
    if ch == "<":
        return 0
    if ch.isdigit():
        return int(ch)
    if ch.isalpha():
        return ord(ch.upper()) - ord("A") + 10
    raise ValueError(f"Caractère MRZ invalide : {ch!r}")


def compute_check_digit(field: str) -> int:
    total = 0
    for i, ch in enumerate(field):
        total += _char_value(ch) * _WEIGHTS[i % 3]
    return total % 10


def check_digit_matches(field: str, expected_digit: str) -> bool:
    if not expected_digit.isdigit():
        return False
    return compute_check_digit(field) == int(expected_digit)


# Confusions fréquentes entre caractères visuellement proches en OCR sur
# police MRZ (OCR-B). On tente les variantes une par une sur un champ donné
# tant que son checksum ne passe pas.
_CONFUSIONS = {
    "O": "0", "0": "O",
    "I": "1", "1": "I",
    "B": "8", "8": "B",
}


def _candidates(field: str):
    yield field
    for i, ch in enumerate(field):
        alt = _CONFUSIONS.get(ch)
        if alt:
            yield field[:i] + alt + field[i + 1 :]


def reconcile_field(field: str, expected_digit: str) -> tuple[str, bool]:
    """Retourne (champ_corrigé, checksum_valide). N'essaie qu'une seule
    substitution à la fois (suffisant pour les erreurs isolées typiques d'un
    passage OCR ; une MRZ avec plusieurs caractères illisibles à la fois doit
    de toute façon retomber en confiance basse / fallback manuel)."""
    for candidate in _candidates(field):
        if check_digit_matches(candidate, expected_digit):
            return candidate, True
    return field, False


@dataclass
class Td3ChecksumResult:
    document_number: str
    document_number_valid: bool
    date_of_birth: str
    date_of_birth_valid: bool
    expiry_date: str
    expiry_date_valid: bool
    composite_valid: bool

    @property
    def all_valid(self) -> bool:
        return (
            self.document_number_valid
            and self.date_of_birth_valid
            and self.expiry_date_valid
            and self.composite_valid
        )


def validate_td3(line1: str, line2: str) -> Td3ChecksumResult:
    """line1/line2 : les deux lignes de 44 caractères de la MRZ TD3."""
    line2 = line2.ljust(44, "<")[:44]

    doc_number = line2[0:9]
    doc_number_check = line2[9]
    doc_number, doc_number_valid = reconcile_field(doc_number, doc_number_check)

    dob = line2[13:19]
    dob_check = line2[19]
    dob, dob_valid = reconcile_field(dob, dob_check)

    expiry = line2[21:27]
    expiry_check = line2[27]
    expiry, expiry_valid = reconcile_field(expiry, expiry_check)

    optional_data = line2[28:42]
    optional_check = line2[42]
    composite_field = doc_number + doc_number_check + dob + dob_check + expiry + expiry_check + optional_data
    composite_check = line2[43]
    composite_valid = check_digit_matches(composite_field, composite_check) or check_digit_matches(
        composite_field, optional_check
    )

    return Td3ChecksumResult(
        document_number=doc_number,
        document_number_valid=doc_number_valid,
        date_of_birth=dob,
        date_of_birth_valid=dob_valid,
        expiry_date=expiry,
        expiry_date_valid=expiry_valid,
        composite_valid=composite_valid,
    )
