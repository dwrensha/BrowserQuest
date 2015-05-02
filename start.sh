set -x

mkdir -p /var/localStorage

memcached -d


node server/js/main.js
