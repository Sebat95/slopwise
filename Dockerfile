### Build Stage
FROM node:25-alpine AS build
WORKDIR /app
# delete legacy yarn and install new with corepack
RUN rm -rf /opt/yarn* /usr/local/bin/yarn* && \
    npm install -g corepack@latest && \
    corepack enable

# set args
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG GOOGLE_CLIENT_ID

# fail fast if any required build arg is missing
RUN test -n "$VITE_FIREBASE_API_KEY" || (echo "ERROR: VITE_FIREBASE_API_KEY is empty" && exit 1)

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
# Vite requires VITE_ prefix to expose to frontend code
ENV VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
# API endpoints are on the same origin, no separate URL needed
ENV VITE_FUNCTIONS_URL=

# copy stuff to build
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .

# build frontend
RUN yarn run build

### Serve Stage
FROM node:25-alpine AS serve
WORKDIR /app

# Install server dependencies
COPY server/package.json ./
RUN npm install --production

# Copy server code and built frontend
COPY server/index.js ./
COPY --from=build /app/dist ./public

EXPOSE 8080
CMD ["node", "index.js"]
