#!/bin/bash
set -e # exit on error

boardcode=$5
markers_filename="${boardcode}_snapshot_markers.jpg"

sleep 0.3
./get_snapshot.sh $1 $2 $3 $4 > "xform/${markers_filename}"

echo "Done getting snapshot with markers for whiteboard code ${boardcode}"