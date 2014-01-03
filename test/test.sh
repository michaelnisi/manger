#!/bin/bash

export NODE_TEST=1
node test/static/stserver.js > /dev/null & echo $! > .pid
tap --tap test/*.js
kill `< .pid`
