# Building the API image

There is only one image. The frontend is a static bundle served by Cloudflare
Workers (INF-014 … INF-020), so it has no Dockerfile — `docker/frontend/` was
deleted along with monkeytype's nginx image.

Build it from the **repository root**, not from `docker/`; the build context is
the whole workspace because the backend is a pnpm workspace package:

```bash
docker buildx build \
  --progress=plain \
  -t ghcr.io/lxorb/croco-calc-api:latest \
  -f ./docker/backend/Dockerfile \
  .
```

`ghcr.io/lxorb/croco-calc-api` is the published name (INF-039 — no Azure
Container Registry is provisioned). CI builds and pushes the same Dockerfile
with `docker/build-push-action` in `.github/workflows/deploy-backend.yml` and
tags it `:${{ github.sha }}` as well as `:latest`; the Container App is always
rolled forward to the immutable SHA tag (INF-043).

To reproduce the CI build exactly, pass the same build argument CI passes
(`server_version`, lowercase — see `docker/backend/Dockerfile` line 24). It ends
up in `/app/backend/dist/server.version` and is what `/` reports (INF-044):

```bash
docker buildx build \
  --progress=plain \
  --build-arg server_version="$(git rev-parse HEAD)" \
  -t ghcr.io/lxorb/croco-calc-api:latest \
  -f ./docker/backend/Dockerfile \
  .
```

## Running the stack locally

`docker/docker-compose.yml` brings up the API and MongoDB 8.0. It pulls the
published `:latest` image rather than building — run the `buildx build` above
first if you want your working tree instead.

Copy `docker/example.env` to `docker/.env` and fill it in first. Compose reads
`.env` from the directory holding the compose file, and the example carries
placeholder values only, never a credential (INF-087):

```bash
cp docker/example.env docker/.env
docker compose -f docker/docker-compose.yml up
```
