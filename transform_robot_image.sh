#!/bin/bash
set -e # exit on error

sleep 0.2
./get_snapshot.sh > xform/snapshot_whiteboard.jpg

cd xform
pipenv run python xform.py
cp background_whiteboard.jpg ../client-data/.

echo "Done transforming image for whiteboard"