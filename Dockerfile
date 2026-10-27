# Imagem de produção (Next.js standalone não é usado para manter o Prisma simples)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app ./
USER app
EXPOSE 3100
# Aplica migrações pendentes e sobe o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
