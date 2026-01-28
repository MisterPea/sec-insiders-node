FROM node:22.12.0-slim

WORKDIR /app

# Native build deps for node-gyp
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  chromium \
  ca-certificates \
  fonts-liberation \
  libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 libcups2 libdrm2 \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/python3 /usr/bin/python

# Tell puppeteer NOT to download its own browser
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Where chromium is
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# helps some builds that look for `python` not `python3`
RUN ln -sf /usr/bin/python3 /usr/bin/python

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY schemas ./schemas

RUN npm run build

CMD ["node", "dist/index.js"]