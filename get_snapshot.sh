#!/bin/bash
# Get a snapshot from the robot's main camera.
# First ask the robot to create a new snapshot image,
# then download the image.
# The downloaded image file is written on stdout.
WBO_RMSNAME = $1
WBO_RMSUSER = $2
WBO_RMSPW = $3
WBO_ROBOT = $4

curl --silent -o /dev/null -u $WBO_RMSUSER:$WBO_RMSPW https://$WBO_RMSNAME/api/htproxy/whiteboard/$WBO_ROBOT/robot/cameraPose/sendCommand?value=149
sleep 0.3
curl --silent -u $WBO_RMSUSER:$WBO_RMSPW https://$WBO_RMSNAME/api/htproxy/whiteboard/$WBO_ROBOT/images/snapshot.jpg