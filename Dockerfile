FROM node:23.11.0-bookworm-slim
#node:22.6.0-bookworm-slim 

RUN apt-get update && apt-get -y dist-upgrade && apt-get -y install vim git tzdata locales procps python3-pip wget curl unzip && apt-get clean && rm -rf /var/lib/apt/lists/* && ln -fs /usr/share/zoneinfo/Europe/Prague /etc/localtime && dpkg-reconfigure --frontend noninteractive tzdata && sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen

RUN curl -fsSL https://bun.sh/install | bash && mv /root/.bun /opt/bun
ENV BUN_INSTALL=/opt/bun
ENV PATH=$BUN_INSTALL/bin:$PATH

RUN npm install -g pnpm 

WORKDIR /opt/fumadocs

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml source.config.ts ./
COPY ./patches ./patches
COPY ./packages ./packages
RUN pnpm install --no-frozen-lockfile --ignore-scripts

RUN cd packages/core && pnpm build

COPY --chown=1000:1000 . .
RUN find /opt/fumadocs -not -path '/opt/fumadocs/node_modules/*' -exec chown 1000:1000 {} + && \
    chmod +x /opt/fumadocs/start.sh
USER 1000
RUN pnpm i --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1

ENTRYPOINT [ "/opt/fumadocs/start.sh" ]
