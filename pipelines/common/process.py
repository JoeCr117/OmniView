"""Running shell commands, and timing what we run.

The single copy. Until the pipelines/ move these lived twice - utils/common.py
(used by main.py) and pydbt/utils.py (used by pydbt/core.py) - as near-identical
implementations that had already drifted apart in their type hints and in
whether run_command was timed. They are one function each now.
"""

__all__ = ['run_command', 'timed']

import functools
import subprocess
import time
from subprocess import CalledProcessError, CompletedProcess
from typing import Callable, ParamSpec, Tuple, TypeVar

P = ParamSpec('P')
R = TypeVar('R')


def timed(func: Callable[P, R]) -> Callable[P, R]:
    """Print the wrapped call's wall time as `#h #m #s`. Exceptions propagate."""

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start

        parts = []
        if elapsed >= 3600:
            parts.append(f'{int(elapsed // 3600)}h')
        if elapsed >= 60:
            parts.append(f'{int(elapsed % 3600 // 60)}m')
        parts.append(f'{elapsed % 60:.2f}s')

        print(f'{func.__name__} executed in ' + ' '.join(parts), end='\n\n')
        return result

    return wrapper


@timed
def run_command(command: str) -> Tuple[str, str, int]:
    """Run a shell command, echoing it and its output.

    Returns (stdout, stderr, returncode). Raises RuntimeError on a non-zero
    exit (so a failed dbt step aborts the rebuild rather than being reported as
    success) and FileNotFoundError if the executable isn't on PATH.
    """
    try:
        print(f'Running Command:\n\t{command}')
        result: CompletedProcess[str] = subprocess.run(
            command,
            shell=True,
            text=True,
            capture_output=True,
            check=True,
        )
    except CalledProcessError as err:
        print(f'Command failed with exit code {err.returncode}')
        raise RuntimeError(f'Command {err.cmd!r} failed (exit {err.returncode})') from err
    except FileNotFoundError as err:
        print(f'Command not found: {command}')
        raise FileNotFoundError(f'Executable not found: {command}') from err
    except Exception as err:
        print(f'Unexpected error running command: {err}')
        raise RuntimeError('Unexpected error in run_command') from err
    print(f'Output:\n{result.stdout}')
    return result.stdout, result.stderr, result.returncode
