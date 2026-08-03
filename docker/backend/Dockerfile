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
# INF-041: the Lua script directory went with the cache removal (INF-065) and
# the email templates went with the SMTP client (INF-053).
COPY --from=builder /prod/backend/node_modules /app/backend/node_modules
COPY --from=builder /prod/backend/dist /app/backend/dist
COPY --from=builder /prod/backend/private /app/backend/private

## to build directory
WORKDIR /app/backend/dist

## logs 
RUN mkdir -p /app/backend/dist/logs

COPY ["docker/backend/entry-point.sh", "./"]

# The live server configuration. init/configuration.ts resolves it as
# `join(__dirname, "../backend-configuration.json")`, and __dirname is
# /app/backend/dist/init at runtime, so it has to land in dist/ -- which is this
# WORKDIR. Without it updateFromConfigurationFile() silently does nothing and
# the server runs on BASE_CONFIGURATION, where signUp and result saving are both
# off and the site cannot accept a single user.
COPY ["backend/backend-configuration.json", "./"]

RUN echo "${server_version}" > /app/backend/dist/server.version

# INF-042: MODE and nothing else. monkeytype's image hardcoded three BYPASS_*
# switches (anti-cheat, email client, firebase); the firebase one disables
# authentication outright, which must never ship. None of them is set here, and
# DoD-04a asserts exactly that. Verify with
#   docker inspect --format '{{json .Config.Env}}' ghcr.io/lxorb/croco-calc-api:<sha>
ENV MODE=prod

EXPOSE 5005
USER node

CMD [ "/bin/sh", "./entry-point.sh" ]
