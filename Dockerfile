### FE/MAIN-APP: Build Stage
FROM node:25-alpine AS build
WORKDIR /app

# delete legacy yarn and install new with corepack
RUN rm -rf /opt/yarn* /usr/local/bin/yarn* && \
    npm install -g corepack@latest && \
    corepack enable && \
    corepack prepare yarn@4.12.0 --activate

# set args
ARG VITE_FIREBASE_CONFIG
ARG VITE_GOOGLE_CLIENT_ID

# fail fast if any required build arg is missing
RUN test -n "$VITE_FIREBASE_CONFIG" && \
    test -n "$VITE_GOOGLE_CLIENT_ID"

# copy stuff to build
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY . .

# build frontend (inline env: JSON in ARG breaks Dockerfile ENV parsing)
ARG VITE_FIREBASE_CONFIG
ARG VITE_GOOGLE_CLIENT_ID
RUN VITE_FIREBASE_CONFIG="$VITE_FIREBASE_CONFIG" \
    VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
    yarn build

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
