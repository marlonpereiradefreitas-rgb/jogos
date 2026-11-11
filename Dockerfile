FROM node:20-alpine
WORKDIR /app
COPY index.html game.js style.css theme-v19.css sw.js manifest.webmanifest server.js package.json ./
COPY assets ./assets
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
