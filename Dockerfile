FROM node:24-alpine

# pg_dump for daily database backups (client v17 works against Supabase PG 15/17)
RUN apk add --no-cache postgresql17-client

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080
CMD ["node", "src/index.ts"]
