"""
run_pipeline logs start/finish/contention under omniview.pipeline. The
subprocess is monkeypatched - a real rebuild runs the full pipeline against
the deployment's Postgres database.
"""

import logging
from types import SimpleNamespace

import pytest

from shell import pipeline

MODULE = 'pipelines.expense_tracker.main'


@pytest.fixture
def fake_run(monkeypatch):
    def install(returncode):
        monkeypatch.setattr(
            pipeline.subprocess,
            'run',
            lambda *args, **kwargs: SimpleNamespace(
                returncode=returncode, stdout='out', stderr='err'
            ),
        )

    monkeypatch.setattr(pipeline.connections, 'close_all', lambda: None)
    return install


def _messages(caplog):
    return [r for r in caplog.records if r.name == 'omniview.pipeline']


def test_success_logs_start_and_ok_finish(fake_run, caplog):
    fake_run(0)
    with caplog.at_level(logging.INFO, logger='omniview.pipeline'):
        result = pipeline.run_pipeline(MODULE, 'unused-root')
    assert result['status'] == 'ok'
    records = _messages(caplog)
    assert 'Pipeline rebuild started' in records[0].getMessage()
    assert records[-1].levelno == logging.INFO
    assert 'status=ok returncode=0' in records[-1].getMessage()


def test_failure_logs_finish_at_error(fake_run, caplog):
    fake_run(3)
    with caplog.at_level(logging.INFO, logger='omniview.pipeline'):
        result = pipeline.run_pipeline(MODULE, 'unused-root')
    assert result['status'] == 'failed'
    finish = _messages(caplog)[-1]
    assert finish.levelno == logging.ERROR
    assert 'status=failed returncode=3' in finish.getMessage()


def test_contention_logs_warning(caplog):
    assert pipeline._rebuild_lock.acquire(blocking=False)
    try:
        with caplog.at_level(logging.INFO, logger='omniview.pipeline'):
            result = pipeline.run_pipeline(MODULE, 'unused-root')
    finally:
        pipeline._rebuild_lock.release()
    assert result['status'] == 'already_running'
    record = _messages(caplog)[-1]
    assert record.levelno == logging.WARNING


def test_runs_the_pipeline_as_a_module(monkeypatch):
    """`-m` (rather than a script path) is what puts the pipeline root on
    sys.path, so the pipeline's own `from pipelines...` imports resolve."""
    captured = {}

    def fake_run(cmd, **kwargs):
        captured['cmd'] = cmd
        captured['cwd'] = kwargs['cwd']
        return SimpleNamespace(returncode=0, stdout='', stderr='')

    monkeypatch.setattr(pipeline.subprocess, 'run', fake_run)
    monkeypatch.setattr(pipeline.connections, 'close_all', lambda: None)

    pipeline.run_pipeline(MODULE, '/repo')

    assert captured['cmd'][1:] == ['-m', MODULE]
    assert captured['cwd'] == '/repo'
