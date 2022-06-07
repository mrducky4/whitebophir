const { getSnapshotMarkers, getSnapshotPlain, transformWhiteboardImage } = require("./robotimage.js")
const request = require('request-promise-native')
const log = require("./log.js").log

// RMS and Robot configuration
// TODO support multiple robots, each could be on a different RMS,
// TODO maybe something like use the robot ID or map name as the board name,
// TODO and somehow associate RMS information with that.
var RMSNAME = process.env["WBO_RMSNAME"] || "eft.ava8.net";
var RMSUSER = process.env["WBO_RMSUSER"] || "unknown";
var RMSPW = process.env["WBO_RMSPW"] || "unknown";
var ROBOT = process.env["WBO_ROBOT"] || "SB00243";

// Camera preset values. Could these be different for different robots?
const tiltWhiteboard = 0.0;
const tiltStation = 0.4;
const zoomWhiteboard = 8;
const zoomStation = 3;

const delay = t => new Promise(resolve => setTimeout(resolve, t));

async function rmsGet(api) {
    let rv;
    try {
        let rmsUrl = `https://${RMSUSER}:${RMSPW}@${RMSNAME}/api/htproxy/whiteboard/${ROBOT}${api}`;
        let resp = await request({url:rmsUrl, json:true, timeout:5000});
        log(`rms GET ${api}`, resp);
        rv = resp;
    } catch (e) {
        log(`rms GET ERROR ${api}`, e);
        rv = e;
    }
    return rv;
}

async function rmsPost(api, data) {
    let rv;
    try {
        let rmsUrl = `https://${RMSUSER}:${RMSPW}@${RMSNAME}/api/htproxy/whiteboard/${ROBOT}${api}`;
        let resp = await request({uri:rmsUrl, method:'POST', json:true, body:data, timeout:5000});
        log(`rms POST ${api}`, resp);
        rv = resp;
    } catch (e) {
        log(`rms POST ERROR ${api}`, e);
        rv = e;
    }
    return rv;
}

async function handleCamPreset(mode) {
    if (mode === "home") {
        await rmsGet("/robot/drive/resetTilt");
        // zoomDirectInternal caused irregular zoom out then zoom in again
        await rmsGet("/robot/cameraPose/zoomDirect?level=0");
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
        await rmsGet(tiltapi);
        await rmsGet(zoomapi);
    }
}

async function handleProjectorMode(mode, boardName, socket) {
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
    await rmsPost('/robot/torso/set', args)
    // If we're going to project, then brute force restart the robot's
    // browser as a safeguard against it getting stuck without a connection
    // to the server.
    if (restartRobotBrowser) {
        await rmsPost('/robot/browser/restart', {});
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
 * @param {string} boardName name of the whiteboard
 * @param {*} socket the triggering message came in on, from the client
 * @param {*} io sockets.io object
 */
function getSnapshot(boardName, socket, io) {
    // these message go to all clients of the board, except the one
    // that sent the "getwbsnapshot" message
    socket.broadcast.to(boardName).emit("broadcast", {
        type:"robotmessage", msg:"showmarkers", tool:"robotTool"
    });
    getSnapshotMarkers() // get image with projected alignment marks
    .then((val) => {
        log(`getSnapshotMarkers: ${val}`);
        socket.broadcast.to(boardName).emit("broadcast", {
            type:"robotmessage", msg:"showblack", tool:"robotTool"
        });
        // get image without alignment marks, align the image to the app annotations
        return transformWhiteboardImage();
    })
    .then((val) => {
        log(`transformWhiteboardImage: ${val}`);
        // these message go to all clients of the board, including the one
        // that sent the "getwbsnapshot" message
        io.in(boardName).emit("broadcast", {
            type:"robotmessage", msg:"wbcaptured", args:{success:true}, tool:"robotTool"
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
function getSnapshotFromCam(boardName, socket, io) {
    getSnapshotPlain() // get image with projected alignment marks
    .then((val) => {
        log(`getSnapshotPlain: ${val}`);
        // Send event messages back to only the client that asked for the capture
        socket.emit("broadcast", {
            type:"robotmessage", msg:"plaincaptured", args:{success:true}, tool:"robotTool"
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

async function goToRoom(room) {
    await rmsPost('/robot/tel/goToRoom', {name:room});
}

function handleRobotMsg(message, boardName, socket, io) {
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
        handleCamPreset(message.args.mode);
    }
    else if (message.msg === "gotoroom") {
        goToRoom(message.args.name);
    }
    else if (message.msg === "projectormode") {
        handleProjectorMode(message.args.mode, boardName, socket);
    }
    else if (message.msg === "getwbsnapshot") {
        getSnapshot(boardName, socket, io);
    }
    else if (message.msg === "getplainsnapshot") {
        getSnapshotFromCam(boardName, socket, io);
    }
}

module.exports = { handleRobotMsg };
