FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

CMD ["node", "src/index.js"]
