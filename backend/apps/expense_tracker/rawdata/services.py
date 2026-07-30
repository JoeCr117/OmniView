"""
Listing/viewing of, and upload into, a bank account's raw CSV exports,
stored as RawFile rows in the `default` database (omniview schema) - the
same rows pipelines/expense_tracker/banks/source.py feeds the pipeline. Replaces the old
Data/Banks/<Bank>/<Account>/*.csv filesystem layout; a bank/account "exists"
iff it has at least one stored CSV. This module never touches the
parsed/staged data, only the raw source rows.

MVP hardcodes the "Golden1" bank (same deferral as budgets/yaml_repository.py
- see plan risk #4).
"""

import csv
import io
from pathlib import Path

from django.db import IntegrityError
from ninja.errors import HttpError

from .models import RawFile

CSV_SUFFIX = ".csv"


def _require_bank(bank: str) -> None:
    if not RawFile.objects.filter(bank=bank).exists():
        raise HttpError(404, f"Unknown bank '{bank}'")


def list_accounts(bank: str = "Golden1") -> list[str]:
    _require_bank(bank)
    # order_by() clears Meta.ordering, whose columns would otherwise be added
    # to the SELECT and defeat DISTINCT (one row per file, not per account).
    return sorted(
        RawFile.objects.filter(bank=bank)
        .order_by()
        .values_list("account", flat=True)
        .distinct()
    )


def _require_account(bank: str, account: str) -> None:
    if account not in list_accounts(bank):
        raise HttpError(404, f"Unknown account '{account}' for bank '{bank}'")


def list_csv_files(account: str, bank: str = "Golden1") -> list[str]:
    _require_account(bank, account)
    return sorted(
        RawFile.objects.filter(bank=bank, account=account).values_list("filename", flat=True)
    )


def _safe_csv_name(filename: str) -> str:
    # Path(...).name strips any directory components, so a hostile filename
    # can't smuggle path separators into the stored name.
    safe_name = Path(filename).name
    if not safe_name.lower().endswith(CSV_SUFFIX):
        raise HttpError(422, "Only .csv files are supported")
    return safe_name


def read_csv_rows(account: str, filename: str, bank: str = "Golden1") -> list[dict]:
    _require_account(bank, account)
    safe_name = _safe_csv_name(filename)
    raw_file = RawFile.objects.filter(bank=bank, account=account, filename=safe_name).first()
    if raw_file is None:
        raise HttpError(404, f"CSV file '{filename}' not found for {bank}/{account}")
    return list(csv.DictReader(io.StringIO(raw_file.content)))


def save_uploaded_csv(account: str, filename: str, content: bytes, bank: str = "Golden1") -> str:
    _require_account(bank, account)
    safe_name = _safe_csv_name(filename)

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HttpError(422, "File is not valid UTF-8 text") from exc
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header or not any(h.strip() for h in header):
        raise HttpError(422, "CSV file has no header row")

    duplicate_message = (
        f"'{safe_name}' already exists for {bank}/{account} - rename the file "
        "or remove the existing one first"
    )
    if RawFile.objects.filter(bank=bank, account=account, filename=safe_name).exists():
        raise HttpError(409, duplicate_message)
    try:
        RawFile.objects.create(
            bank=bank, account=account, filename=safe_name, content=text, size=len(content)
        )
    except IntegrityError as exc:
        # Concurrent upload of the same name lost the race to the unique
        # constraint - same outcome as the pre-check.
        raise HttpError(409, duplicate_message) from exc
    return safe_name
