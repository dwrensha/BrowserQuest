set -x

mkdir -p /var/localStorage

ls /var/localStorage

memcached -d

node server/js/main.js
