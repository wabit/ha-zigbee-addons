ARG BUILD_FROM=ghcr.io/hassio-addons/base-nodejs:0.2.4
FROM ${BUILD_FROM}

# Copy package files and install dependencies
COPY package.json tsconfig.json /app/
WORKDIR /app
RUN npm install --omit=dev && npm install -g tsx

# Copy source
COPY src/ /app/src/

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
