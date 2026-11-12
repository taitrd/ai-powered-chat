"""AI keys load from SSM in production, without overriding keys already in the environment."""

from app.core.secrets import load_ssm_secrets


class FakeSsm:
    def __init__(self, values):
        self.values = values
        self.requested = None

    def get_parameters(self, Names, WithDecryption):  # noqa: N803  boto3 argument names
        assert WithDecryption is True
        self.requested = Names
        found = [{"Name": n, "Value": self.values[n]} for n in Names if n in self.values]
        return {
            "Parameters": found,
            "InvalidParameters": [n for n in Names if n not in self.values],
        }


def test_loads_missing_keys_from_ssm(monkeypatch):
    monkeypatch.setenv("SECRETS_SSM_PATH", "/chat-app/prod/")
    # setenv first so pytest restores these after the test, even though the code sets them.
    for name in ("GEMINI_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.setenv(name, "")
        monkeypatch.delenv(name)
    ssm = FakeSsm({"/chat-app/prod/GEMINI_API_KEY": "from-ssm"})

    assert load_ssm_secrets(ssm) == ["GEMINI_API_KEY"]
    assert ssm.requested == ["/chat-app/prod/GEMINI_API_KEY", "/chat-app/prod/OPENAI_API_KEY"]
    import os

    assert os.environ["GEMINI_API_KEY"] == "from-ssm"
    assert "OPENAI_API_KEY" not in os.environ


def test_environment_key_wins_over_ssm(monkeypatch):
    monkeypatch.setenv("SECRETS_SSM_PATH", "/chat-app/prod")
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    monkeypatch.setenv("OPENAI_API_KEY", "from-env-too")
    ssm = FakeSsm({"/chat-app/prod/GEMINI_API_KEY": "from-ssm"})

    assert load_ssm_secrets(ssm) == []
    assert ssm.requested is None  # Nothing missing: SSM isn't called at all.


def test_does_nothing_without_ssm_path(monkeypatch):
    monkeypatch.delenv("SECRETS_SSM_PATH", raising=False)
    assert load_ssm_secrets(FakeSsm({})) == []


def test_ssm_errors_leave_the_app_running(monkeypatch):
    class Broken:
        def get_parameters(self, **_):
            raise RuntimeError("access denied")

    monkeypatch.setenv("SECRETS_SSM_PATH", "/chat-app/prod/")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert load_ssm_secrets(Broken()) == []
