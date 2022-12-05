#!/bin/bash
set -e # exit on error

boardcode=$5
markers_filename="${boardcode}_snapshot_markers.jpg"

# Wait long enough for the markers to appear on the projected
# image. Testing shows 0.5 is long enough. But it is possible
# it might need to be more at some point, for example if a high
# latency network connection across the world causes additional
# delay in the messages to the client apps.
sleep 0.5
./get_snapshot.sh $1 $2 $3 $4 > "xform/${markers_filename}"

echo "Done getting snapshot with markers for whiteboard code ${boardcode}"