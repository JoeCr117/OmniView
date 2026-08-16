from .golden1 import Golden1

#: Re-export, not an unused import: `factory.py` resolves bank classes from this
#: package, so adding a bank means adding it here. Declared explicitly so a lint
#: pass cannot mistake the registration for dead code and delete it.
__all__ = ['Golden1']
