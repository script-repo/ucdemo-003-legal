"""
Local dev server for the Legal AI Portal.

Serves static files from portal/ and proxies /api/ai/* requests to the
Nutanix AI endpoint. Provides /api/db/* endpoints backed by local SQLite
(mirrors the PostgreSQL API used in production K8s).

Set NAI_API_KEY before running (or put it in a gitignored .env file next to
this script — see .env.example). Never hardcode a real key here; this file
is published to a public GitHub repo.

Usage:  python server.py [port]       (default port: 8080)
"""

import http.server
import json
import os
import sqlite3
import ssl
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


def load_dotenv(path):
    """Minimal .env loader — no external dependency needed for local dev."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_dotenv(Path(__file__).resolve().parent / '.env')

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
PORTAL_DIR = Path(__file__).resolve().parent / 'portal'
DB_PATH = Path(__file__).resolve().parent / 'local_summaries.db'

# Set these via environment variables (or a gitignored .env file) — do not
# hardcode real credentials here.
AI_BASE = os.environ.get('NAI_BASE', 'https://nai.hpoc.nutanix.com:443/api/v1')
AI_KEY = os.environ.get('NAI_API_KEY', '')

PROXY_PREFIX = '/api/ai/'
DB_PREFIX = '/api/db/'


def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute('''CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        use_case TEXT NOT NULL DEFAULT 'uc03',
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
    )''')
    conn.execute('''CREATE INDEX IF NOT EXISTS idx_uc_created
        ON summaries (use_case, created_at DESC)''')
    conn.commit()
    conn.close()

MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
}

# Skip TLS verification for the Nutanix endpoint (self-signed / enterprise cert)
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


class Handler(http.server.BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith(DB_PREFIX):
            self._handle_db_get()
        else:
            self._serve_static()

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_ai()
        elif self.path.startswith(DB_PREFIX):
            self._handle_db_post()
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith(DB_PREFIX):
            self._handle_db_delete()
        else:
            self.send_error(404)

    # ------------------------------------------------------------------ proxy

    def _proxy_ai(self):
        """Forward POST to the Nutanix AI endpoint."""
        downstream_path = self.path[len(PROXY_PREFIX):]
        url = f'{AI_BASE}/{downstream_path}'

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b''

        req = urllib.request.Request(
            url,
            data=body,
            method='POST',
            headers={
                'Authorization': f'Bearer {AI_KEY}',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        )

        try:
            with urllib.request.urlopen(req, context=ssl_ctx) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self._cors_headers()
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            body_err = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body_err)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    # ----------------------------------------------------------- db endpoints

    def _handle_db_get(self):
        path = self.path.split('?')[0]
        if path == '/api/db/summaries':
            params = self._parse_qs()
            use_case = params.get('use_case', 'uc03')
            limit = min(int(params.get('limit', '10')), 50)
            try:
                conn = sqlite3.connect(str(DB_PATH))
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    'SELECT id, use_case, title, created_at, data '
                    'FROM summaries WHERE use_case = ? '
                    'ORDER BY created_at DESC LIMIT ?',
                    (use_case, limit),
                ).fetchall()
                conn.close()
                result = [{
                    'id': r['id'],
                    'use_case': r['use_case'],
                    'title': r['title'],
                    'createdAt': r['created_at'],
                    'data': json.loads(r['data']),
                } for r in rows]
                self._json_response(200, result)
            except Exception as e:
                self._json_response(500, {'error': str(e)})
        else:
            self.send_error(404)

    def _handle_db_post(self):
        path = self.path.split('?')[0]
        if path == '/api/db/summaries':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            use_case = body.get('use_case', 'uc03')
            title = body.get('title', 'Untitled')
            data = body.get('data', {})
            now = datetime.now(timezone.utc).isoformat()
            try:
                conn = sqlite3.connect(str(DB_PATH))
                cur = conn.execute(
                    'INSERT INTO summaries (use_case, title, created_at, data) '
                    'VALUES (?, ?, ?, ?)',
                    (use_case, title, now, json.dumps(data)),
                )
                row_id = cur.lastrowid
                conn.execute(
                    'DELETE FROM summaries WHERE use_case = ? AND id NOT IN '
                    '(SELECT id FROM summaries WHERE use_case = ? '
                    'ORDER BY created_at DESC LIMIT 10)',
                    (use_case, use_case),
                )
                conn.commit()
                conn.close()
                self._json_response(201, {'id': row_id, 'createdAt': now})
            except Exception as e:
                self._json_response(500, {'error': str(e)})
        else:
            self.send_error(404)

    def _handle_db_delete(self):
        path = self.path.split('?')[0]
        if path == '/api/db/summaries':
            params = self._parse_qs()
            use_case = params.get('use_case', 'uc03')
            item_id = params.get('id', '')
            try:
                conn = sqlite3.connect(str(DB_PATH))
                if item_id:
                    conn.execute(
                        'DELETE FROM summaries WHERE id = ? AND use_case = ?',
                        (int(item_id), use_case),
                    )
                else:
                    conn.execute(
                        'DELETE FROM summaries WHERE use_case = ?',
                        (use_case,),
                    )
                conn.commit()
                conn.close()
                self._json_response(200, {'ok': True})
            except Exception as e:
                self._json_response(500, {'error': str(e)})
        else:
            self.send_error(404)

    def _parse_qs(self):
        qs = self.path.split('?', 1)[1] if '?' in self.path else ''
        params = {}
        for pair in qs.split('&'):
            if '=' in pair:
                k, v = pair.split('=', 1)
                params[k] = v
        return params

    def _json_response(self, code, data):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self._cors_headers()
        self.end_headers()
        self.wfile.write(payload)

    # --------------------------------------------------------------- static

    def _serve_static(self):
        """Serve files from the portal/ directory."""
        path = self.path.split('?')[0].split('#')[0]
        if path == '/':
            path = '/index.html'

        file_path = (PORTAL_DIR / path.lstrip('/')).resolve()

        # Security: stay inside portal/
        if not str(file_path).startswith(str(PORTAL_DIR)):
            self.send_error(403)
            return

        if file_path.is_dir():
            file_path = file_path / 'index.html'

        if not file_path.is_file():
            self.send_error(404)
            return

        ext = file_path.suffix.lower()
        mime = MIME_TYPES.get(ext, 'application/octet-stream')

        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-cache')
        self._cors_headers()
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    # --------------------------------------------------------------- helpers

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ''
        color = '\033[32m' if str(status).startswith('2') else '\033[33m' if str(status).startswith('3') else '\033[31m'
        reset = '\033[0m'
        sys.stderr.write(f'{color}{args[0]}{reset} {status}\n')


if __name__ == '__main__':
    if not AI_KEY:
        print('WARNING: NAI_API_KEY is not set. AI proxy calls will fail. '
              'Copy .env.example to .env and fill in a real key, or export '
              'NAI_API_KEY before running.')
    init_db()
    server = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Legal AI Portal running at  http://localhost:{PORT}')
    print(f'AI proxy active at          http://localhost:{PORT}{PROXY_PREFIX}*')
    print(f'DB API active at            http://localhost:{PORT}{DB_PREFIX}*')
    print(f'SQLite database at          {DB_PATH}')
    print(f'Serving files from          {PORTAL_DIR}')
    print('Press Ctrl+C to stop.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
        server.server_close()
