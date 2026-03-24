### FE/MAIN-APP: Build Stage
FROM node:25-alpine AS build
WORKDIR /app

# delete legacy yarn and install new with corepack
RUN rm -rf /opt/yarn* /usr/local/bin/yarn* && \
    npm install -g corepack@latest && \
    corepack enable && \
    corepack prepare yarn@4.12.0 --activate

# set args
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_GOOGLE_CLIENT_ID

# fail fast if any required build arg is missing
RUN test -n "$VITE_FIREBASE_API_KEY" && \
    test -n "$VITE_FIREBASE_AUTH_DOMAIN" && \
    test -n "$VITE_FIREBASE_PROJECT_ID" && \
    test -n "$VITE_FIREBASE_STORAGE_BUCKET" && \
    test -n "$VITE_FIREBASE_MESSAGING_SENDER_ID" && \
    test -n "$VITE_FIREBASE_APP_ID" && \
    test -n "$VITE_GOOGLE_CLIENT_ID"

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# copy stuff to build
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY . .

# build frontend
RUN yarn build

### FE/MAIN-APP: Serve Stage
FROM node:25-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# run as non-root in final image
RUN addgroup -S slopwise && adduser -S slopwise -G slopwise

### BE/AUTH-SERVER
# Install server dependencies reproducibly
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy server code and built frontend
COPY server/index.js ./
COPY --from=build /app/dist ./public

USER slopwise
EXPOSE 8080
CMD ["npm", "run", "start"]
