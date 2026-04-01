# Apify's Playwright + Chrome image — has browsers pre-installed
FROM apify/actor-node-playwright-chrome:20

# Skip downloading browser binaries — Chrome is already in this image
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy package files and install deps
COPY --chown=myuser package*.json ./
RUN npm --quiet set progress=false && npm install --only=prod && echo "Dependencies installed."

# Copy the rest of the source
COPY --chown=myuser . ./

CMD npm start --silent
