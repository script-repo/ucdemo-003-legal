# Legal AI Portal — db-api sidecar image (Postgres summaries API).
# Runs in the same pod as the portal/nginx container; see
# deploy/gitops/ntnx-use-cases/deployment.yaml.
#
# psycopg2 is baked in at build time (no more runtime `pip install` on
# every pod start/restart).
FROM python:3.12-slim

RUN pip install --no-cache-dir "psycopg2-binary~=2.9" \
    && useradd --create-home --uid 1001 --shell /usr/sbin/nologin dbapi

WORKDIR /app
COPY db-api.py .

USER dbapi
EXPOSE 8081
CMD ["python", "db-api.py"]
