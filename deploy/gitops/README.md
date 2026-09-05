# GitOps deployment

GitHub → GitHub Actions → GHCR → Flux → NKP. Same pattern as the
[Casino AI Portal](https://github.com/script-repo/ucdemo-001-casino); see
that repo's `docs/gitops-nkp-pipeline.md` for the fully-generalized
replication checklist. This file covers the legal-portal-specific details.

The deployable application is two container images, published from one
GitHub repo:

```text
ghcr.io/script-repo/ucdemo-003-legal/portal    # nginx: static UI + AI reverse proxy
ghcr.io/script-repo/ucdemo-003-legal/db-api    # Python sidecar: Postgres summaries API
```

They run as two containers in **one pod** (`legal-ai-portal`), because nginx
proxies `/api/db/*` to the sidecar over `localhost` — they must stay
co-located.

## Flow

1. A change to `portal/**`, `nginx/**`, `db-api/**`, or the Dockerfiles on
   `main` triggers `.github/workflows/publish-images.yml`.
2. GitHub Actions builds `linux/amd64` for **both** images, publishes `main`
   and immutable `sha-<full-commit>` tags to GHCR, and attests each image.
3. The workflow updates both `newTag:` entries in this overlay's
   `kustomization.yaml` to the immutable SHA tag and commits that desired
   state to `main`.
4. Flux polls the public repository and reconciles
   `deploy/gitops/ntnx-use-cases/` into the `ntnx-use-cases` namespace.

The `main` tag is a convenience tag. Flux deploys the immutable SHA tag
written to `kustomization.yaml`.

## Bootstrap

Flux must already be installed on the NKP cluster. Bootstrap this repo once:

```bash
kubectl apply -f deploy/flux/ntnx-use-cases-sync.yaml
```

After bootstrap, do not apply this overlay manually. Change Git, let GitHub
Actions publish the images and update their tags, then let Flux reconcile.

## Secrets — created out of band, never committed

Git holds **no** credentials. Before the first deploy, create the Secret
this overlay's Deployments reference:

```bash
kubectl create secret generic legal-ai-secrets \
  --namespace ntnx-use-cases \
  --from-literal=NAI_API_KEY='<your Nutanix AI API key>' \
  --from-literal=PG_PASSWORD='<a strong password>'
```

- `NAI_API_KEY` is injected into the nginx container's server block at
  container start via envsubst (see `nginx/default.conf.template`) — it is
  never baked into the image or written to a ConfigMap.
- `PG_PASSWORD` is shared by the `db-api` sidecar and the `legal-ai-pg`
  Postgres Deployment, both in this overlay.

Rotate the key by updating the Secret and rolling the Deployment; nothing in
Git needs to change.

## Frontend

- 3 replicas, NodePort `30088`
- No PVC on the portal itself: static files and nginx config are baked into
  the image; writable scratch (`/var/cache/nginx`, `/tmp`, rendered
  `/etc/nginx/conf.d`) uses `emptyDir`
- Non-secret environment metadata comes from `legal-ai-config`

## Databases

- `legal-ai-pg` (PostgreSQL 16) — persists document-summary history. Has a
  PVC (`legal-ai-pg-data`, 20Gi, `nutanix-volume`). Keep replicas at `1`;
  `ReadWriteOnce` does not support scaling this out.
- `legal-ai-chroma` (ChromaDB) — provisioned for future RAG use cases, not
  yet called by any live use case. Also has a PVC and stays at `1` replica
  for the same reason.

## Package visibility

Both GHCR packages must be public for an unauthenticated NKP pull. If kept
private, create an `imagePullSecret` out of band and reference it from the
Deployment; never commit registry credentials.
