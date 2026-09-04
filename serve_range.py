"""Static file server with HTTP Range support (required by PMTiles).

Python's SimpleHTTPRequestHandler ignores the Range header and always answers
200 with the full file. pmtiles.js treats that as a fatal error ("Server
returned no content-length header or content-length exceeding request") with
no fallback that slices the body itself - so a plain `python -m http.server`
cannot serve data/neue-luebecker.pmtiles at all. This server adds real Range
support (206 / 416) plus a couple of Windows-specific MIME fixes.

Usage:  python serve_range.py [port]   (default port 8000)
"""
import functools
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__)))
RANGE_RE = re.compile(r'^bytes=(\d*)-(\d*)$')


class _Limited:
    """Wraps a file object so shutil.copyfileobj stops after `remaining` bytes."""

    def __init__(self, f, remaining):
        self.f = f
        self.remaining = remaining

    def read(self, n=-1):
        if self.remaining <= 0:
            return b''
        if n is None or n < 0 or n > self.remaining:
            n = self.remaining
        chunk = self.f.read(n)
        self.remaining -= len(chunk)
        return chunk

    def close(self):
        self.f.close()


class RangeHandler(SimpleHTTPRequestHandler):
    # Windows reads .js MIME type from the registry, where it is frequently
    # text/plain - that makes browsers refuse <script type="module">.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.pbf': 'application/x-protobuf',
        '.pmtiles': 'application/octet-stream',
    }

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()

        m = RANGE_RE.match(rng.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        first, last = m.group(1), m.group(2)
        if first == '':                        # suffix form: bytes=-N
            n = int(last or 0)
            start, end = max(0, size - n), size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1

        if start >= size:                      # pmtiles.js probes past EOF on
            self.send_response(416)            # purpose to learn the file size
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None

        end = min(end, size - 1)
        length = end - start + 1
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(length))
        self.end_headers()
        return _Limited(f, length)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(RangeHandler, directory=ROOT)
    print('Serving %s  ->  http://localhost:%d/' % (ROOT, port))
    ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
