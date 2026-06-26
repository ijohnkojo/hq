from __future__ import annotations

import requests


class HQBaseConnection:
    __slots__ = ("host", "port", "verify")

    def __init__(
        self,
        host: str,
        port: int,
        *,
        verify: bool | str | None = None,
    ) -> None:
        self.host = host
        self.port = port
        # TLS server-certificate verification, forwarded to `requests` as `verify=`:
        #   None / True  -> verify against the system CA bundle (real, public certs)
        #   "<path>"     -> verify against this CA bundle / self-signed cert (dev)
        #   False        -> disable verification entirely (INSECURE; dev only)
        self.verify: bool | str = True if verify is None else verify

    def __enter__(self):
        if not self.ping():
            raise Exception(f"Failed to connect to HQ server at {self.url}")
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_type, exc_value, traceback

    def ping(self):
        return requests.get(f"{self.url}/status", verify=self.verify).ok

    @property
    def url(self) -> str:
        return f"{self.host}:{self.port}"
