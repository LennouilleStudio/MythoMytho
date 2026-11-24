# MythoMytho : un seul conteneur sert l'application web (/, /local…) ET le serveur de parties (WebSocket) sur le même port.
# Construction :  docker build -t mythomytho .      Lancement :  docker run -p 8080:8080 -v mythomytho-data:/data mythomytho

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Application web (dist/) puis moteur de salle compilé pour le serveur (server/dist/engine.mjs).
RUN npx expo export -p web && node server/build.mjs

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY --from=build /app/dist ./dist
# Le serveur (server.mjs et ses modules) et le moteur compilé (server/dist/engine.mjs).
COPY --from=build /app/server ./server
# Salles sauvegardées dans /data : montez-y un volume pour qu'elles survivent aux redéploiements.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.mjs"]
