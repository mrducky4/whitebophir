#!/bin/bash
set -e # exit on error

sleep 0.3
./get_snapshot.sh > client-data/snapshot_plain.jpg

echo "Done getting plain snapshot"