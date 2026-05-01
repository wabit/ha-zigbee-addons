ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

COPY package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

RUN npm install -g tsx

COPY tsconfig.json /app/
COPY src/ /app/src/

COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
