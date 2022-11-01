const yaml = require('js-yaml');
const fs   = require('fs');
const log = require("./log.js").log;
const rmsutil = require("./rmsutil.js");

var CONFIG_FILENAME = process.env["WBO_CONFIG_FILENAME"] || '/opt/ava/config/robots.yaml';
var gRobotBoards = null;

// Delay for the given number of msec
function delay_msec(msecs) {
    return new Promise(resolve => setTimeout(resolve, msecs));
}

/**
 * Get the singleton object, creating it if necessary
 * @returns robotBoards singleton
 */
function getRobotBoards() {
    if (null == gRobotBoards) {
        gRobotBoards = new robotBoards();
    }
    return gRobotBoards;
}

/**
 * Delete the singleton, useful for unit testing
 */
 function deleteRobotBoards() {
    if (gRobotBoards){
        gRobotBoards.enablePoll = false;
    }
    gRobotBoards = null;
}

/**
 * Track teleport sessions for robots that have whiteboard capability.
 * Create a randome code to identify each board.
 */
class robotBoards {
    constructor() {
        this.boardList = []; // object for each active robot board, with robotID, code, rms, etc.
        this.rmsList = [];   // object for each RMS with user, pw
        this.robotList = []; // list of robotIDs capable of whiteboarding
        this.configFileName = CONFIG_FILENAME;
        this.pollInterval = 5000; // RMS polling interval in msec
        this.enablePoll = true;
        log('created robotBoards');
    }

    /**
     * Load configuration information from a YAML file
     */
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
        log('config loaded, rmsList', this.rmsList);
        log('config loaded, robotList', this.robotList);
    }

    /**
     * Add a new board to our list
     * @param {string} code 
     * @param {string} rms 
     * @param {string} user 
     * @param {string} pw 
     * @param {string} robot 
     */
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

    /**
     * Check one RMS one time for active teleport sessions.
     * Add or remove boards from our list, based on the active sessions.
     * @param {*} rms object, with info needed to access an RMS
     */
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
                            rmsutil.rmsPost(rms, '/api/rms/setSession', args, true);
                        }
                    }
                }
                this.removeEndedSessions(rms.rms, robotsInSession);
            }
        } catch(e) {
            log(e);
        }
    }

    /**
     * Poll one RMS in a loop.
     * @param {*} index into the list of RMS names
     */
    async pollLoopRMS(index) {
        const rms = this.rmsList[index];
        while(this.enablePoll) {
            await this.pollOnceRMS(rms);
            await delay_msec(this.pollInterval);
        }
        log(`ending pollLoop for ${rms.rms}`);
    }

    /**
     * Start a polling loop for each RMS in our list.
     * @returns Promise that resolves when all polling has ended
     */
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

    /**
     * Make a short random alphanumeric code
     * @returns the code string
     */
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