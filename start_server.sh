#!/bin/sh
echo "start_server.sh running"
pwd
exec node ./server/server.js >> /var/log/ava/wbo.log 2>&1
