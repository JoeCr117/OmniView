import pytest
from ninja.errors import HttpError

from apps.expense_tracker.rawdata.models import RawFile
from apps.expense_tracker.rawdata.services import (
    list_accounts,
    list_csv_files,
    read_csv_rows,
    save_uploaded_csv,
)

pytestmark = pytest.mark.django_db


def _status(exc_info) -> int:
    return exc_info.value.status_code


class TestListing:
    def test_list_accounts_sorted_and_distinct(self, golden1_data):
        # A second file in an account must not duplicate the account name
        # (Meta.ordering + distinct() regression).
        first = RawFile.objects.get(account='CreditCard')
        RawFile.objects.create(
            bank='Golden1', account='CreditCard', filename='2025.csv',
            content=first.content, size=first.size,
        )
        assert list_accounts('Golden1') == ['CreditCard', 'Savings']

    def test_unknown_bank_404s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            list_accounts('NoSuchBank')
        assert _status(exc_info) == 404

    def test_unknown_account_404s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            list_csv_files('Checking', 'Golden1')
        assert _status(exc_info) == 404

    def test_list_csv_files(self, golden1_data):
        assert list_csv_files('CreditCard', 'Golden1') == ['2024.csv']
        assert list_csv_files('Savings', 'Golden1') == ['jan.csv']


class TestReadCsvRows:
    def test_reads_rows_as_dicts(self, golden1_data):
        rows = read_csv_rows('CreditCard', '2024.csv', 'Golden1')
        assert rows == [
            {'Date': '01/03/2024', 'Description': 'COFFEE SHOP', 'Amount': '-4.50'}
        ]

    def test_missing_file_404s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            read_csv_rows('CreditCard', 'nope.csv', 'Golden1')
        assert _status(exc_info) == 404

    def test_non_csv_extension_422s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            read_csv_rows('CreditCard', 'BudgetMap.yml', 'Golden1')
        assert _status(exc_info) == 422


class TestUpload:
    CONTENT = b'Date,Description,Amount\n02/01/2024,GROCERY,-20.00\n'

    def test_upload_stores_row(self, golden1_data):
        name = save_uploaded_csv('Savings', 'feb.csv', self.CONTENT, 'Golden1')
        assert name == 'feb.csv'
        row = RawFile.objects.get(bank='Golden1', account='Savings', filename='feb.csv')
        assert row.content == self.CONTENT.decode()
        assert row.size == len(self.CONTENT)

    def test_path_traversal_is_neutralized(self, golden1_data):
        # A hostile filename with directory components must be stored under
        # its basename - path separators never reach the stored name.
        save_uploaded_csv('Savings', '../../../evil.csv', self.CONTENT, 'Golden1')
        assert RawFile.objects.filter(
            bank='Golden1', account='Savings', filename='evil.csv'
        ).exists()
        assert not RawFile.objects.filter(filename__contains='/').exists()
        assert not RawFile.objects.filter(filename__contains='\\').exists()

    def test_duplicate_filename_409s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            save_uploaded_csv('CreditCard', '2024.csv', self.CONTENT, 'Golden1')
        assert _status(exc_info) == 409

    def test_upload_to_unknown_account_404s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            save_uploaded_csv('Checking', 'feb.csv', self.CONTENT, 'Golden1')
        assert _status(exc_info) == 404

    def test_non_csv_extension_422s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            save_uploaded_csv('Savings', 'malware.exe', self.CONTENT, 'Golden1')
        assert _status(exc_info) == 422

    def test_non_utf8_content_422s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            save_uploaded_csv('Savings', 'bin.csv', b'\xff\xfe\x00\x01', 'Golden1')
        assert _status(exc_info) == 422

    def test_missing_header_422s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            save_uploaded_csv('Savings', 'empty.csv', b'', 'Golden1')
        assert _status(exc_info) == 422

    def test_failed_upload_stores_nothing(self, golden1_data):
        with pytest.raises(HttpError):
            save_uploaded_csv('CreditCard', '2024.csv', self.CONTENT, 'Golden1')
        filenames = list(
            RawFile.objects.filter(bank='Golden1', account='CreditCard')
            .values_list('filename', flat=True)
        )
        assert filenames == ['2024.csv']
