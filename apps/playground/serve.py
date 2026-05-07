#!/usr/bin/env python3
"""Dev server with COOP/COEP headers for onnxruntime-web."""
import http.server, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy",   "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

print(f"Serving on http://localhost:{PORT}")
http.server.test(HandlerClass=Handler, port=PORT, bind="localhost")
