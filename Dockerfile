# The site as a container image: kiln builds dist/ from the sources, then Caddy
# serves it on port 80. The box server's proxy terminates TLS in front of it.
#
# kiln and the site build run on the build machine's own platform (the output is
# plain HTML); only the final Caddy stage is per target platform.
FROM --platform=$BUILDPLATFORM rust:1-bookworm AS build
# The kiln commit that builds the site. Bump it to pick up kiln changes.
ARG KILN_REV=ab06a4b215d22f3e4a55ae86c5df9ea80093e246
RUN cargo install --locked --git https://github.com/alfredr/kiln --rev "$KILN_REV" kiln
WORKDIR /site
COPY . .
RUN kiln build

FROM caddy:2-alpine
LABEL org.opencontainers.image.source=https://github.com/alfredr/blog
COPY deploy/serve.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /site/dist /srv
