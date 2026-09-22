# syntax=docker/dockerfile:1

# The API server, built static and run without a shell.

FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependencies first, in their own layer: go.mod and go.sum change far less
# often than the code, so an ordinary edit reuses the download instead of
# fetching the module graph again.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 is what makes the binary runnable on a base image with no libc.
# -trimpath keeps build-machine paths out of panic traces, which would otherwise
# name whatever directory this happened to be built in.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# Optional: bake a pinned mihomo into the image so POST /api/v1/mihomo/validate
# works out of the box. Build with --build-arg MIHOMO_VERSION=v1.19.x (a tag
# from github.com/MetaCubeX/mihomo/releases); leave it unset and the image has
# no mihomo at all — the endpoints answer 503 and everything else is unaffected.
# The binary is fully static for the same CGO reason as the server above.
ARG MIHOMO_VERSION=""
FROM golang:1.25-alpine AS mihomo-build
ARG MIHOMO_VERSION
# /out is created unconditionally so the final COPY --from=mihomo-build step
# always has a source directory to glob, even when MIHOMO_VERSION is unset and
# the stage produces no binary (an empty /out glob simply copies nothing).
RUN mkdir -p /out \
  && if [ -n "$MIHOMO_VERSION" ]; then \
      for i in 1 2 3 4 5; do \
        wget -O /tmp/mihomo.gz \
          "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-amd64-${MIHOMO_VERSION}.gz" \
          && break || { echo "mihomo download try $i failed, retrying"; sleep 5; }; \
      done \
      && gzip -t /tmp/mihomo.gz \
      && gzip -d /tmp/mihomo.gz && chmod +x /tmp/mihomo && mv /tmp/mihomo /out/mihomo; \
    fi

# distroless/static: no shell, no package manager, nothing to escalate into. It
# does carry ca-certificates, which this image needs — signing in makes an
# outbound HTTPS call to GitHub, and without them every login fails on an
# unverifiable certificate.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/api /usr/local/bin/api
# Shipped alongside so the schema can be moved as its own step — a deploy job,
# or `docker compose run --rm --entrypoint /usr/local/bin/migrate server status`
# to ask which version a database is on without starting a server.
COPY --from=build /out/migrate /usr/local/bin/migrate
# Absent unless MIHOMO_VERSION was set; COPY --from with a missing source in a
# skipped stage is fine — the conditional build stage simply produced nothing.
COPY --from=mihomo-build /out/mihomo* /usr/local/bin/

# Already the image's default; stated because it is load-bearing rather than
# incidental, and a later edit that adds a writable path should have to notice
# that nothing here runs as root.
USER nonroot:nonroot

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/api"]
