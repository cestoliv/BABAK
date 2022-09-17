FROM alpine:edge

WORKDIR /babak

# Install dependencies
RUN apk add --no-cache nodejs npm rsync openssh curl
RUN apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ \
	kubectl

# Create scripts
RUN echo $'#!/bin/sh \n\
if [ -d "/root/.ssh" ]; then \n\
	chown -R $(id -u):$(id -g) /root/.ssh; chmod -R 700 /root/.ssh; chmod 600 /root/.ssh/id_rsa; chmod 644 /root/.ssh/id_rsa.pub; chmod 600 /root/.ssh/config; \n\
	echo "SSH config files are ready"; \n\
fi \
' > /babak/set_perms.sh

# Copy babak sources
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY src src
# Install npm dependencies and build
RUN npm i

CMD sh -c "sh /babak/set_perms.sh; npm start"
