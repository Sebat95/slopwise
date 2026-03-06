### Build Stage
FROM node:25-alpine AS build
WORKDIR /app
# delete legacy yarn and install new with corepack
RUN rm -rf /opt/yarn* /usr/local/bin/yarn* && \
    npm install -g corepack@latest && \
    corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
#COPY .yarn ./.yarn
RUN yarn install --immutable
COPY . .
# args like the env.example
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN yarn run build

### Serve Stage
FROM nginx:1.29.5-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]