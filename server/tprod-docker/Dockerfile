FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY bundle/server.js bundle/emailWorker.js ./

RUN mkdir -p /app/data/audios /app/data/images/profiles \
    && chown -R node:node /app

USER node
EXPOSE 4000

CMD ["node", "server.js"]
