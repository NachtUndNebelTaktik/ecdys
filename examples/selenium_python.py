"""ecdys WebDriver transport example.

Requires a supported Selenium 4 release and a running ecdys gateway.
This file is an integration specification example, not a gateway implementation.
It navigates to ECDYS_TARGET_URL (https://example.com by default).
The session token belongs on the control connection, never on website requests.
"""

import os
import re
import sys
import threading
import time
from urllib.parse import urlsplit

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.client_config import AuthType, ClientConfig
from selenium.webdriver.remote.remote_connection import RemoteConnection


class PacingConnection(RemoteConnection):
    """Serialize requests to fit the free tier without replaying actions."""

    def __init__(self, *args, **kwargs):
        self._pacing_lock = threading.Lock()
        self._next_allowed_at = 0.0
        super().__init__(*args, **kwargs)

    def execute(self, command, params):
        with self._pacing_lock:
            delay = self._next_allowed_at - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            try:
                return super().execute(command, params)
            finally:
                self._next_allowed_at = time.monotonic() + 0.25


def main() -> None:
    endpoint = os.environ.get("ECDYS_WEBDRIVER_URL", "http://127.0.0.1:9300")
    parsed = urlsplit(endpoint)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "::1"}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is None
        or parsed.port == 0
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Use the numeric-loopback gateway URL from ecdys.")

    token = os.environ.get("ECDYS_WEBDRIVER_TOKEN", "")
    if re.fullmatch(r"[A-Za-z0-9_-]{43,128}", token) is None:
        raise ValueError("Provide the session token in ECDYS_WEBDRIVER_TOKEN.")

    # Keep the local control connection out of an inherited HTTP proxy.
    for variable in ("NO_PROXY", "no_proxy"):
        previous = os.environ.get(variable, "")
        os.environ[variable] = ",".join(
            part for part in (previous, "127.0.0.1", "::1", "localhost") if part
        )

    config = ClientConfig(
        remote_server_addr=endpoint,
        auth_type=AuthType.BEARER,
        token=token,
        timeout=30,
    )
    connection = PacingConnection(client_config=config)
    driver = webdriver.Remote(
        command_executor=connection,
        options=webdriver.ChromeOptions(),
    )
    try:
        target = os.environ.get("ECDYS_TARGET_URL", "https://example.com")
        driver.get(target)
        print("Title:", driver.title)
        print("Heading:", driver.find_element(By.CSS_SELECTOR, "h1").text)
        driver.save_screenshot(
            os.environ.get("ECDYS_SCREENSHOT_PATH", "ecdys-example.png")
        )
    finally:
        # The gateway delegates this to the authorized Save & Close lifecycle.
        driver.quit()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            "Automation failed. Check gateway status, token, and session diagnostics.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
