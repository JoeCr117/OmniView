# banks/factory.py

from .all_banks import Golden1
from .bank import Bank
from .source import BankSource


def bank_factory(source: BankSource) -> Bank:
    bank_name = source.name
    print(f'Creating Bank: {bank_name}')
    if bank_name == 'Golden1':
        return Golden1(source)
    raise ValueError(
        f'Could not create bank {bank_name}: no Bank subclass is registered '
        'for it (see banks/factory.py).'
    )
