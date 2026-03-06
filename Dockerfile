### Build Stage
FROM node:25-slim AS build
WORKDIR /app
RUN npm install -g corepack && corepack enable
RUN corepack prepare yarn@stable --activate
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable
COPY . .
RUN yarn run build

### Serve Stage
FROM nginx:1.29.5-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]