#!/bin/bash
set -e # exit on error

boardcode=$5
filename="${boardcode}_snapshot_plain.jpg"

sleep 0.3
./get_snapshot.sh $1 $2 $3 $4 > "client-data/${filename}"

echo "Done getting plain snapshot"