# Legal AI Portal — nginx image (static UI + AI reverse proxy).
# db-api sidecar has its own image; see db-api/Dockerfile.
#
# No secrets are baked into this image. The Nutanix AI API key is injected
# at container start via nginx's built-in envsubst templating — see
# nginx/default.conf.template and deploy/gitops/ntnx-use-cases/deployment.yaml.
FROM nginx:alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY portal/ /usr/share/nginx/html/

EXPOSE 8080
