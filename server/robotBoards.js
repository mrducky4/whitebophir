const yaml = require('js-yaml');
const fs   = require('fs');
const log = require("./log.js").log;
const rmsutil = require("./rmsutil.js");

var gRobotBoards = null;

// Delay for the given number of msec
function delay_msec(msecs) {
    return new Promise(resolve => setTimeout(resolve, msecs));
}

function getRobotBoards() {
    if (null == gRobotBoards) {
        gRobotBoards = new robotBoards();
    }
    return gRobotBoards;
}

/**
 * Delete the singleton, useful for unit testing
 * @returns 
 */
function deleteRobotBoards() {
    gRobotBoards = null;
}

class robotBoards {
    constructor() {
        this.boardList = []; // object for each active robot board, with robotID, code, rms, etc.
        this.rmsList = [];   // object for each RMS with user, pw
        this.robotList = []; // list of robotIDs capable of whiteboarding
        this.configFileName = '/opt/ava/config/robots.yaml';
        this.pollInterval = 15000; // RMS polling interval in msec
        this.enablePoll = true;
        log('created robotBoards');
    }

    loadConfig() {
        try {
            this.robotList = [];
            this.rmsList = [];
            yaml.loadAll(fs.readFileSync(this.configFileName, 'utf8'), doc => {
                this.robotList.push(doc.robot);
                // add to RMS list if the RMS isn't already there
                const rmshost = doc.rms + '.ava8.net';
                if (!this.rmsList.find(element => element['rms'] == rmshost)) {
                    const rms = {
                        rms: rmshost,
                        user: doc.username,
                        pw: doc.password
                    };
                    this.rmsList.push(rms);
                }
            });
            
        } catch (e) {
            log(e);
        }
    }

    addBoard(code, rms, user, pw, robot) {
        const board = {
            code: code,
            rms: rms,
            user: user,
            pw: pw,
            robot: robot,
        }
        log(`adding board for ${robot} on ${rms} with code ${code}`);
        this.boardList.push(board);
    }

    /**
     * Remove boards that were for a robot on the given RMS
     * if that robot is no longer in an active session.
     * @param {*} rms 
     * @param {*} robotsInSession 
     */
    removeEndedSessions(rms, robotsInSession) {
        // Remove boards for the given RMS if the robot is not in session
        this.boardList = this.boardList.filter(board => {
            let keep = board.rms != rms || robotsInSession.includes(board.robot);
            if (!keep) log(`Removing board for ${board.robot} on ${rms} with code ${board.code}`);
            return keep;
        });
    }

    async pollOnceRMS(rms) {
        try{
            log(`query RMS ${rms.rms} for sessions`);
            const args = {
                startTime: Date.now(),
                endTime: Date.now() + 10000
            }
            let response = await rmsutil.rmsPost(rms, '/api/rms/sessions', args, false);
            if ("sessions" in response) {
                let robotsInSession = [];
                const sessions = response["sessions"];
                for (let i = 0; i<sessions.length; i++) {
                    const session = sessions[i];
                    log(`session state ${session.state} for ${session.robot} on ${rms.rms}`);
                    // For robots in session, add a new board if they don't
                    // already have a board, and the robot supports whiteboarding.
                    if (session.state.includes("EMBODIED") && this.robotList.includes(session.robot)) {
                        robotsInSession.push(session.robot);
                        if (!this.getBoardFromRobot(session.robot)){
                            const newCode = this.makeRandomCode();
                            this.addBoard(newCode, rms.rms, rms.user, rms.pw, session.robot);
                            const args = {
                                id: session.id,
                                collaborationCode: newCode,
                            }
                            rmsutil.rmsPost(rms, '/rms/setSession', args, true);
                        }
                    }
                }
                this.removeEndedSessions(rms.rms, robotsInSession);
            }
        } catch(e) {
            log(e);
        }
    }

    async pollLoopRMS(index) {
        const rms = this.rmsList[index];
        while(this.enablePoll) {
            await this.pollOnceRMS(rms);
            await delay_msec(this.pollInterval);
        }
        log(`ending pollLoop for ${rms.rms}`);
    }

    startPollingAllRMS() {
        let promises = []
        for (let i=0; i<this.rmsList.length; i++) {
            promises.push(this.pollLoopRMS(i));
        }
        return Promise.allSettled(promises);
    }

    getBoardFromCode(code) {
        let board = this.boardList.find(element => element['code'] == code);
        return board;
    }

    getBoardFromRobot(robot) {
        let board = this.boardList.find(element => element['robot'] == robot);
        return board;
    }

    makeRandomCode() {
        const codechars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = "";
        for (let i=0; i<6; i++) {
            code = code + codechars[Math.floor(Math.random() * (codechars.length))];
        }
        return code;
    }
}

module.exports = { getRobotBoards, deleteRobotBoards };