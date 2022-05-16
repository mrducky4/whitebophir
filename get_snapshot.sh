#!/bin/bash
# Get a snapshot from the robot's main camera.
# First ask the robot to create a new snapshot image,
# then download the image.
# The downloaded image file is written on stdout.
curl --silent -o /dev/null -u $WBO_RMSUSER:$WBO_RMSPW https://$WBO_RMSNAME/api/htproxy/whiteboard/$WBO_ROBOT/robot/cameraPose/sendCommand?value=149
sleep 0.3
curl --silent -u $WBO_RMSUSER:$WBO_RMSPW https://$WBO_RMSNAME/api/htproxy/whiteboard/$WBO_ROBOT/images/snapshot.jpg