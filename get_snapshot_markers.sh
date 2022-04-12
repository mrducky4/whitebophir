#!/bin/bash
set -e # exit on error

sleep 0.2
./get_snapshot.sh > xform/snapshot_markers.jpg

echo "Done getting snapshot with markers"