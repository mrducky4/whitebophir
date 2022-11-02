const { getSnapshotMarkers, getSnapshotPlain, transformWhiteboardImage } = require("./robotimage.js")
const request = require('request-promise-native')
const log = require("./log.js").log
const robotBoardsMod = require('./robotBoards.js')
const rmsutil = require("./rmsutil.js");

// Camera preset values. Could these be different for different robots?
const tiltWhiteboard = 0.0;
const tiltStation = 0.4;
const zoomWhiteboard = 8;
const zoomStation = 3;

const delay = t => new Promise(resolve => setTimeout(resolve, t));

/**
 * POST a robot API command, via RMS proxy.
 * 
 * @param {*} rmsInfo dict including rms name, user, pw 
 * @param {string} robotapi URL path of the robot API
 * @param {*} data object to send as JSON body
 * @param {bool} logit true to log a message
 * @returns full response, or exception if error
 */
async function rmsPostRobot(rmsInfo, robotapi, data, logit) {
    if (rmsInfo) {
        return await rmsutil.rmsPost(rmsInfo, `/api/htproxy/whiteboard/${rmsInfo.robot}${robotapi}`, data, logit);
    }
}

/**
 * GET a robot API command, via RMS proxy.
 * 
 * @param {*} rmsInfo dict including rms name, user, pw 
 * @param {string} robotapi URL path of the robot API
 * @param {bool} logit true to log a message
 * @returns full response, or exception if error
 */
 async function rmsGetRobot(rmsInfo, robotapi, logit) {
    if (rmsInfo) {
        return await rmsutil.rmsGet(rmsInfo, `/api/htproxy/whiteboard/${rmsInfo.robot}${robotapi}`, logit);
    }
}

async function handleCamPreset(boardRobotInfo, mode) {
    if (mode === "home") {
        await rmsGetRobot(boardRobotInfo, "/robot/drive/resetTilt", true);
        // zoomDirectInternal caused irregular zoom out then zoom in again
        await rmsGetRobot(boardRobotInfo, "/robot/cameraPose/zoomDirect?level=0", true);
    } else {
        let tiltposition;
        let zoomlevel;
        if (mode === "whiteboard") {
            tiltposition = tiltWhiteboard;
            zoomlevel = zoomWhiteboard;
        } else {
            tiltposition = tiltStation;
            zoomlevel = zoomStation;
        }
        let zoomapi = `/robot/cameraPose/zoomDirect?level=${zoomlevel}`;
        let tiltapi = `/robot/drive/payloadPose?cameraTilt=${tiltposition}`;
        await rmsGetRobot(boardRobotInfo, tiltapi, true);
        await rmsGetRobot(boardRobotInfo, zoomapi, true);
    }
}

/**
 * Send commands to the robot API and other board clients to respond to
 * changes in collaboration mode, such as at the whiteboard or not.
 * 
 * @param {*} boardRobotInfo including robotid and RMS
 * @param {*} mode like 'home' or 'whiteboard'
 * @param {*} boardName name of the whiteboard, i.e. the 'collab code'
 * @param {*} socket websocket from socket.io
 */
async function handleProjectorMode(boardRobotInfo, mode, boardName, socket) {
    let args = {};
    let restartRobotBrowser = false;
    if (mode === "home") {
        args.tilt = "up";
        // keep power on, but show black
        socket.broadcast.to(boardName).emit("broadcast", {
            type:"robotmessage", msg:"showblack", tool:"robotTool"
        });
    } else if (mode === "whiteboard") {
        args.projector = "on";
        args.tilt = "up";
        restartRobotBrowser = true;
    } else if (mode === "station") {
        args.projector = "on";
        args.tilt = "down";
        restartRobotBrowser = true;
    }
    await rmsPostRobot(boardRobotInfo, '/robot/torso/set', args, true);
    // If we're going to project, then brute force restart the robot's
    // browser as a safeguard against it getting stuck without a connection
    // to the server.
    if (restartRobotBrowser) {
        if (boardRobotInfo) {
            let serverhost = socket.request.headers.host;
            const boardUrl = {url:`http://${serverhost}/robotboards/${boardRobotInfo.code}`};
            await rmsPostRobot(boardRobotInfo, '/robot/browser/restart', boardUrl, true);
        }
        // wait for restart, then clear the black default image
        delay(3000).then(()=>{
            socket.broadcast.to(boardName).emit("broadcast", {
                type:"robotmessage", msg:"clearoverlay", tool:"robotTool"
            });
            if (mode === "station")
                socket.broadcast.to(boardName).emit("broadcast", {
                    type:"robotmessage", msg:"showkeepout", args:{show:false}, tool:"robotTool"
                });
            // do it again in case the robot browser was slow to restart
            delay(3000).then(()=>{
                socket.broadcast.to(boardName).emit("broadcast", {
                   type:"robotmessage", msg:"clearoverlay", tool:"robotTool"
                });
                if (mode === "station")
                    socket.broadcast.to(boardName).emit("broadcast", {
                        type:"robotmessage", msg:"showkeepout", args:{show:false}, tool:"robotTool"
                    });
            });
        });
    }
}

/**
 * Orchestrate the whiteboard snapshot capture and alignment process.
 * @param {*} boardRobotInfo including robotid and RMS
 * @param {string} boardName name of the whiteboard
 * @param {*} socket the triggering message came in on, from the client
 * @param {*} io sockets.io object
 */
function getSnapshot(boardRobotInfo, boardName, socket, io) {
    // these message go to all clients of the board, except the one
    // that sent the "getwbsnapshot" message
    socket.broadcast.to(boardName).emit("broadcast", {
        type:"robotmessage", msg:"showmarkers", tool:"robotTool"
    });
    getSnapshotMarkers(boardRobotInfo) // get image with projected alignment marks
    .then((val) => {
        log(`getSnapshotMarkers: ${val}`);
        socket.broadcast.to(boardName).emit("broadcast", {
            type:"robotmessage", msg:"showblack", tool:"robotTool"
        });
        // get image without alignment marks, align the image to the app annotations
        return transformWhiteboardImage(boardRobotInfo);
    })
    .then((val) => {
        log(`transformWhiteboardImage: ${val}`);
        // these message go to all clients of the board, including the one
        // that sent the "getwbsnapshot" message
        io.in(boardName).emit("broadcast", {
            type:"robotmessage", msg:"wbcaptured",
            // filename must match the name in transform_robot_image.sh
            args:{success:true, filename:`${boardRobotInfo.code}_background_whiteboard.jpg`},
            tool:"robotTool"
        });
    })
    .catch(e => {
        log(`ERROR getwbsnapshot ${e}`);
        io.in(boardName).emit("broadcast", {
            type:"robotmessage", msg:"wbcaptured", args:{success:false}, tool:"robotTool"
        });
    })
    .finally(()=>{
        // tell the robot board to clear markers and black image
        socket.broadcast.to(boardName).emit("broadcast", {
            type:"robotmessage", msg:"clearoverlay", tool:"robotTool"
        });
    });
}

/**
 * Orchestrate the plain snapshot capture process.
 * @param {string} boardName name of the whiteboard
 * @param {*} socket the triggering message came in on, from the client
 * @param {*} io sockets.io object
 */
function getSnapshotFromCam(boardRobotInfo, boardName, socket, io) {
    getSnapshotPlain() // get image with projected alignment marks
    .then((val) => {
        log(`getSnapshotPlain: ${val}`);
        // Send event messages back to only the client that asked for the capture
        socket.emit("broadcast", {
            type:"robotmessage", msg:"plaincaptured",
            args:{success:true, filename:`${boardRobotInfo.code}__snapshot_plain.jpg`},
            tool:"robotTool"
        });
    })
    .catch(e => {
        log(`ERROR getSnapshotPlain ${e}`);
        socket.emit("broadcast", {
            type:"robotmessage", msg:"plaincaptured", args:{success:false}, tool:"robotTool"
        });
    })
    .finally(()=>{
        // tell the robot board to clear the black image
        socket.broadcast.to(boardName).emit("broadcast", {
            type:"robotmessage", msg:"clearoverlay", tool:"robotTool"
        });
    });
}

async function goToRoom(boardRobotInfo, room) {
    await rmsPostRobot(boardRobotInfo, '/robot/tel/goToRoom', {name:room}, true);
}

function handleRobotMsg(message, boardName, socket, io) {
    const boardRobotInfo = robotBoardsMod.getRobotBoards().getBoardFromCode(boardName);

    if (message.msg === "log") {
        log("clientlog", message.logobj);
    } else {
        log("robotmessage", message);
    }
    if (message.msg === "showmarkers") {
        //getSnapshotMarkers()
        //    .then(val => log(`getSnapshotMarkers: ${val}`))
        //    .catch(e => log(`ERROR from getSnapshotMarkers ${e}`));
    }
    else if (message.msg === "showblack") {
        //transformWhiteboardImage()
        //    .then(val => log(`xform ${val}`))
        //    .catch(e => log(`ERROR from xform ${e}`));
    }
    else if (message.msg === "camerapreset") {
        handleCamPreset(boardRobotInfo, message.args.mode);
    }
    else if (message.msg === "gotoroom") {
        goToRoom(boardRobotInfo, message.args.name);
    }
    else if (message.msg === "projectormode") {
        handleProjectorMode(boardRobotInfo, message.args.mode, boardName, socket);
    }
    else if (message.msg === "getwbsnapshot") {
        getSnapshot(boardRobotInfo, boardName, socket, io);
    }
    else if (message.msg === "getplainsnapshot") {
        getSnapshotFromCam(boardRobotInfo, boardName, socket, io);
    }
}

module.exports = { handleRobotMsg };
