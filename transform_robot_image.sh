#!/bin/bash
set -e # exit on error

boardcode=$5
markers_filename="${boardcode}_snapshot_markers.jpg"
wb_filename="${boardcode}_snapshot_whiteboard.jpg"
out_filename="${boardcode}_background_whiteboard.jpg"

rm -f client-data/${out_filename}
sleep 0.3
./get_snapshot.sh $1 $2 $3 $4 > "xform/${wb_filename}"

cd xform
pipenv run python xform.py ${markers_filename} ${wb_filename} ${out_filename}
mv ${out_filename} ../client-data/.

echo "Done transforming image for whiteboard code ${boardcode}"