# ===================================
# Build Stage
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Recebe a URL da API em tempo de build
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar codigo fonte
COPY . .

# Build da aplicacao
RUN npm run build

# ===================================
# Production Stage
# ===================================
FROM nginx:alpine AS runner

# Copiar build
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuracao nginx para SPA (React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Usar usuario nao-root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
