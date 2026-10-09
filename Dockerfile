# The site as a container image: kiln's dist/, served by Caddy on port 80. The
# box server's proxy terminates TLS in front of it. kiln runs on the host, so
# build dist/ first; deploy/publish.sh does both.
FROM caddy:2-alpine
COPY deploy/serve.Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
