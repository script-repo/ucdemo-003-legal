"""
Lightweight REST API sidecar for PostgreSQL summary storage.

Runs alongside nginx in the legal-ai-portal pod (see
deploy/gitops/ntnx-use-cases/deployment.yaml).

Endpoints:
  GET  /api/db/summaries?use_case=uc03&limit=10  — fetch recent summaries
  POST /api/db/summaries                          — save a new summary
  DELETE /api/db/summaries[?id=...]               — delete one or all

Env vars (see deploy/gitops/ntnx-use-cases/configmap.yaml for non-secret
defaults; PG_PASSWORD must come from a Kubernetes Secret — never hardcode
it here or in Git):
  PG_HOST     (default: pg-db)
  PG_PORT     (default: 5432)
  PG_DB       (default: legal_ai)
  PG_USER     (default: legal_admin)
  PG_PASSWORD (required — no default)
  API_PORT    (default: 8081)
"""

import http.server
import json
import os
import sys

PG_HOST = os.environ.get('PG_HOST', 'pg-db')
PG_PORT = os.environ.get('PG_PORT', '5432')
PG_DB = os.environ.get('PG_DB', 'legal_ai')
PG_USER = os.environ.get('PG_USER', 'legal_admin')
PG_PASSWORD = os.environ.get('PG_PASSWORD', '')
API_PORT = int(os.environ.get('API_PORT', '8081'))

try:
    import psycopg2
    import psycopg2.extras
    HAS_PG = True
except ImportError:
    HAS_PG = False


def get_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DB,
        user=PG_USER, password=PG_PASSWORD,
        connect_timeout=5,
    )


class Handler(http.server.BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/db/summaries':
            self._get_summaries()
        elif path == '/healthz':
            self._json_response(200, {'ok': True})
        else:
            self.send_error(404)

    def do_POST(self):
        path = self.path.split('?')[0]
        if path == '/api/db/summaries':
            self._post_summary()
        else:
            self.send_error(404)

    def do_DELETE(self):
        path = self.path.split('?')[0]
        if path == '/api/db/summaries':
            self._delete_summaries()
        else:
            self.send_error(404)

    def _delete_summaries(self):
        params = self._parse_qs()
        use_case = params.get('use_case', 'uc03')
        item_id = params.get('id', '')

        if not HAS_PG:
            self._json_response(503, {'error': 'psycopg2 not installed'})
            return

        try:
            conn = get_conn()
            cur = conn.cursor()
            if item_id:
                cur.execute(
                    'DELETE FROM summaries WHERE id = %s AND use_case = %s',
                    (int(item_id), use_case),
                )
            else:
                cur.execute(
                    'DELETE FROM summaries WHERE use_case = %s',
                    (use_case,),
                )
            conn.commit()
            cur.close()
            conn.close()
            self._json_response(200, {'ok': True})
        except Exception as e:
            self._json_response(500, {'error': str(e)})

    def _get_summaries(self):
        params = self._parse_qs()
        use_case = params.get('use_case', 'uc03')
        limit = min(int(params.get('limit', '10')), 50)

        if not HAS_PG:
            self._json_response(200, [])
            return

        try:
            conn = get_conn()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                'SELECT id, use_case, title, created_at, data '
                'FROM summaries WHERE use_case = %s '
                'ORDER BY created_at DESC LIMIT %s',
                (use_case, limit),
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            result = []
            for r in rows:
                result.append({
                    'id': r['id'],
                    'use_case': r['use_case'],
                    'title': r['title'],
                    'createdAt': r['created_at'].isoformat(),
                    'data': r['data'],
                })
            self._json_response(200, result)
        except Exception as e:
            self._json_response(500, {'error': str(e)})

    def _post_summary(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        use_case = body.get('use_case', 'uc03')
        title = body.get('title', 'Untitled')
        data = body.get('data', {})

        if not HAS_PG:
            self._json_response(503, {'error': 'psycopg2 not installed'})
            return

        try:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO summaries (use_case, title, data) '
                'VALUES (%s, %s, %s) RETURNING id, created_at',
                (use_case, title, json.dumps(data)),
            )
            row = cur.fetchone()

            # Prune old entries, keep only the latest 10 per use_case
            cur.execute(
                'DELETE FROM summaries WHERE use_case = %s AND id NOT IN '
                '(SELECT id FROM summaries WHERE use_case = %s '
                'ORDER BY created_at DESC LIMIT 10)',
                (use_case, use_case),
            )
            conn.commit()
            cur.close()
            conn.close()
            self._json_response(201, {
                'id': row[0],
                'createdAt': row[1].isoformat(),
            })
        except Exception as e:
            self._json_response(500, {'error': str(e)})

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
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ''
        sys.stderr.write(f'[db-api] {args[0]} {status}\n')


if __name__ == '__main__':
    if not HAS_PG:
        print('WARNING: psycopg2 not installed. DB endpoints will return empty results.')
    if not PG_PASSWORD:
        print('WARNING: PG_PASSWORD is not set. DB connections will fail. '
              'Set it via a Kubernetes Secret (see deploy/gitops/ntnx-use-cases/deployment.yaml).')
    server = http.server.HTTPServer(('0.0.0.0', API_PORT), Handler)
    print(f'DB API sidecar listening on :{API_PORT}')
    print(f'  PostgreSQL: {PG_USER}@{PG_HOST}:{PG_PORT}/{PG_DB}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nDB API shutting down.')
        server.server_close()
