ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Node.js and npm
RUN apk add --no-cache nodejs npm

# Copy package files and install dependencies
COPY package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

# Install tsx globally for running TypeScript directly
RUN npm install -g tsx

# Copy source
COPY tsconfig.json /app/
COPY src/ /app/src/

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
