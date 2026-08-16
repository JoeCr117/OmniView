from ninja import File, Router
from ninja.files import UploadedFile

from .schemas import UploadResult
from .services import list_accounts, list_csv_files, read_csv_rows, save_uploaded_csv

router = Router()


@router.get('/accounts', response=list[str])
def accounts(request, bank: str = 'Golden1'):
    return list_accounts(bank)


@router.get('/{account}/files', response=list[str])
def files(request, account: str, bank: str = 'Golden1'):
    return list_csv_files(account, bank)


@router.get('/{account}/csv')
def csv_rows(request, account: str, filename: str, bank: str = 'Golden1'):
    return read_csv_rows(account, filename, bank)


@router.post('/{account}/upload', response=UploadResult)
def upload(request, account: str, file: UploadedFile = File(...), bank: str = 'Golden1'):
    saved_name = save_uploaded_csv(account, file.name, file.read(), bank)
    return {'status': 'ok', 'filename': saved_name}
