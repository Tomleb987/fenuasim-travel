"""Découpage d'une MRZ TD3 (passeport) validée en champs applicatifs, avec
les mêmes noms de clés que ceux attendus par submitTravelerDetails côté
Next.js (src/app/dashboard/actions.ts)."""

from datetime import date

from mrz_checksum import Td3ChecksumResult


def _mrz_date_to_iso(yymmdd: str, *, is_birth_date: bool) -> str | None:
    if len(yymmdd) != 6 or not yymmdd.isdigit():
        return None
    yy, mm, dd = int(yymmdd[0:2]), int(yymmdd[2:4]), int(yymmdd[4:6])

    if is_birth_date:
        current_yy = date.today().year % 100
        century = 1900 if yy > current_yy else 2000
    else:
        # Un passeport n'est jamais délivré avec plusieurs décennies de
        # validité : la date d'expiration est en pratique toujours "20yy".
        century = 2000

    try:
        return date(century + yy, mm, dd).isoformat()
    except ValueError:
        return None


def _split_names(line1: str) -> tuple[str, str]:
    # P<CCCSURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<<
    names_field = line1[5:44].rstrip("<")
    surname, _, given = names_field.partition("<<")
    last_name = surname.replace("<", " ").strip()
    first_name = given.replace("<", " ").strip()
    return first_name, last_name


def parse_td3_fields(line1: str, line2: str, checksum: Td3ChecksumResult) -> dict:
    line1 = line1.ljust(44, "<")[:44]
    line2 = line2.ljust(44, "<")[:44]

    first_name, last_name = _split_names(line1)
    issuing_country = line1[2:5].replace("<", "")
    nationality = line2[10:13].replace("<", "")
    sex_raw = line2[20]
    sex = sex_raw if sex_raw in ("M", "F") else "X"

    return {
        "first_name": first_name,
        "last_name": last_name,
        "sex": sex,
        "date_of_birth": _mrz_date_to_iso(checksum.date_of_birth, is_birth_date=True),
        "nationality": nationality,
        "passport_number": checksum.document_number.replace("<", ""),
        "passport_issuing_country": issuing_country,
        "passport_expiry_date": _mrz_date_to_iso(checksum.expiry_date, is_birth_date=False),
    }
