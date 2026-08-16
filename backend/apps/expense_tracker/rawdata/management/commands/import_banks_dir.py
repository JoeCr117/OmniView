"""
One-time loader for a Data/Banks-style directory tree into the database:
each bank's root .yml becomes a BudgetMapDocument row and every
<bank>/<account>/*.csv becomes a RawFile row. Upserts, so re-running against
the same tree refreshes content instead of duplicating rows.

Run once per deployment (local compose PG now, Lakebase at cutover):

    uv run python backend/manage.py import_banks_dir Data/Banks
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.expense_tracker.budgets.models import BudgetMapDocument
from apps.expense_tracker.rawdata.models import RawFile


class Command(BaseCommand):
    help = 'Import a Data/Banks-style directory tree into RawFile + BudgetMapDocument rows.'

    def add_arguments(self, parser):
        parser.add_argument('path', help='Path to the Banks directory (e.g. Data/Banks)')

    def handle(self, *args, **options):
        banks_root = Path(options['path']).resolve()
        if not banks_root.is_dir():
            raise CommandError(f'{banks_root} is not a directory')

        bank_dirs = sorted(p for p in banks_root.iterdir() if p.is_dir())
        if not bank_dirs:
            raise CommandError(f'No bank subdirectories found in {banks_root}')

        maps = files = 0
        for bank_dir in bank_dirs:
            bank = bank_dir.name
            yml_files = sorted(p for p in bank_dir.iterdir() if p.is_file() and p.suffix == '.yml')
            if len(yml_files) != 1:
                raise CommandError(
                    f'{bank_dir} must contain exactly one root .yml budget map, '
                    f'found {len(yml_files)}'
                )
            BudgetMapDocument.objects.update_or_create(
                bank=bank,
                defaults={'yaml_text': yml_files[0].read_text(encoding='utf-8')},
            )
            maps += 1

            for account_dir in sorted(p for p in bank_dir.iterdir() if p.is_dir()):
                for csv_path in sorted(account_dir.glob('*.csv')):
                    raw = csv_path.read_bytes()
                    RawFile.objects.update_or_create(
                        bank=bank,
                        account=account_dir.name,
                        filename=csv_path.name,
                        defaults={'content': raw.decode('utf-8-sig'), 'size': len(raw)},
                    )
                    files += 1
            self.stdout.write(f'{bank}: budget map + CSVs imported')

        self.stdout.write(
            self.style.SUCCESS(
                f'Imported {maps} budget map(s) and {files} CSV file(s) from {banks_root}'
            )
        )
