FROM node:24.11.0-alpine3.22 AS builder

WORKDIR /app

#copy
COPY ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "./"]
COPY packages packages
COPY backend backend

#gimme pnpm + build
RUN npm i -g pnpm@10.28.1 && \
    pnpm i --frozen-lockfile && \
    npm run build

#deploy (install all non-dev dependencies in a single node_module folder)
RUN pnpm deploy --legacy --filter backend --prod /prod/backend

#---------------------------------

## target image
FROM node:24.11.0-alpine3.22

## get server_version from build-arg, default to UNKNOWN
ARG server_version=UNKNOWN

# COPY to target.
# INF-041: backend/redis-scripts went with Redis (INF-065) and the email
# templates went with the SMTP client (INF-053).
COPY --from=builder /prod/backend/node_modules /app/backend/node_modules
COPY --from=builder /prod/backend/dist /app/backend/dist
COPY --from=builder /prod/backend/private /app/backend/private

## to build directory
WORKDIR /app/backend/dist

## logs 
RUN mkdir -p /app/backend/dist/logs

COPY ["docker/backend/entry-point.sh", "./"]

RUN echo "${server_version}" > /app/backend/dist/server.version

# INF-042: MODE and nothing else. monkeytype's image hardcoded BYPASS_ANTICHEAT,
# BYPASS_EMAILCLIENT and BYPASS_FIREBASE; BYPASS_FIREBASE=true disables
# authentication outright, which must never ship. Verify with
#   docker inspect --format '{{json .Config.Env}}' ghcr.io/lxorb/croco-calc-api:<sha>
ENV MODE=prod

EXPOSE 5005
USER node

CMD [ "/bin/sh", "./entry-point.sh" ]
