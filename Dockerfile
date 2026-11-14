FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 SCAVENGE_DATA=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.js"]
