#!/usr/bin/env python3
"""Server lokal untuk mencoba app dan untuk tes Playwright: menayangkan ROOT repo (app di /docs/).

Sama seperti `python3 -m http.server`, tetapi antrean koneksi (listen backlog) lebih besar.
Bawaan http.server hanya 5: saat service worker meng-cache ~55 file sekaligus (apalagi di beberapa
worker tes paralel), koneksi baru ditolak diam-diam dan baru dicoba lagi 1 detik kemudian, sehingga
halaman tampak macet dan tes gagal acak.

    python3 tools/serve.py [port]      # default 4173
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Server(ThreadingHTTPServer):
    request_queue_size = 256

    def handle_error(self, request, client_address):
        # Browser menutup koneksi saat pindah halaman: bukan error, jangan cetak traceback.
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # log akses terlalu ramai
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    with Server(("", port), partial(QuietHandler, directory=str(ROOT))) as httpd:
        print(f"http://localhost:{port}/docs/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
