# syntax=docker/dockerfile:1

# The frontend: built by Vite, served by nginx as static files.

# Built on the build machine's native architecture: this stage only produces
# static files, so emulating the target arch here buys nothing and breaks
# esbuild's Go runtime under qemu-user (fatal lfstack.push). The nginx stage
# below still targets the cluster architecture.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

# npm ci, not npm install: it installs exactly what the lockfile says, so an
# image built today and one built next month contain the same dependencies.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines every VITE_ variable into the bundle at build time, so these are
# build arguments rather than runtime environment. Two consequences worth
# knowing: changing one needs a rebuild, not a restart; and everything here
# reaches the browser, which is why the GitHub *client secret* is nowhere near
# this file — it belongs to the server image alone.
#
# An unset client ID is a working state, not a broken one: the app runs, the
# sign-in button explains that it is not configured, and the editor keeps saving
# to the browser as it always has.
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_GITHUB_CLIENT_ID=
ARG VITE_OAUTH_REDIRECT_URI=

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID \
    VITE_OAUTH_REDIRECT_URI=$VITE_OAUTH_REDIRECT_URI

RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget --quiet --spider http://127.0.0.1/ || exit 1
