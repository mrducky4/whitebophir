var robotBoards = require('../server/robotBoards.js');
const rmsutil = require('../server/rmsutil.js');
var assert = require('chai').assert;
var sinon = require('sinon');

describe("robotBoards", function() {

    afterEach(() => {
        // Restore the default sandbox here
        sinon.restore();
        robotBoards.deleteRobotBoards();
    });

    it("has a list of boards", function() {
        const boards = robotBoards.getRobotBoards();
        boards.addBoard('aBc675', 'rmsname', 'username', 'pw', 'SB00123');
        let board = boards.getBoardFromCode('123');
        assert.equal(board, null, "board is null for code 123");
        board = boards.getBoardFromCode('aBc675');
        let boardExpected = {
            code: 'aBc675',
            rms: 'rmsname',
            user: 'username',
            pw: 'pw',
            robot: 'SB00123',
        }
        assert.deepEqual(board, boardExpected, "retrieved board matchs added board");
    });

    it("parses config file", function() {
        const boards = robotBoards.getRobotBoards();
        boards.configFileName = "./tests_mocha/test_config.yml";
        boards.loadConfig();
        assert.equal(boards.robotList.length, 3, "3 robots in config");
        assert.equal(boards.rmsList.length, 2, "2 rms in config");
    });

    it("makes random code", function() {
        const boards = robotBoards.getRobotBoards();
        for  (let i=0;i<1000;i++){
            let code = boards.makeRandomCode();
            //console.log(code);
            assert.equal(code.length, 6, "code has 6 characters");
        }
    });

    // Use this for testing with a real RMS, it does not automatically
    // verify anything. This is meant for the developer to edit the config
    // file to setup real RMS, and watch log messages
    // to see what's happening.
    it.skip("polls real RMS in config files", async function() {
        const boards = robotBoards.getRobotBoards();
        boards.configFileName = "./tests_mocha/test_config.yml";
        boards.loadConfig();
        boards.pollInterval = 2000;
        setTimeout(()=>boards.enablePoll=false, 60000);
        await boards.startPollingAllRMS();
    });

    it("Creates/deletes board for a session", async function() {
        const boards = robotBoards.getRobotBoards();
        boards.configFileName = "./tests_mocha/test_config.yml";
        boards.loadConfig();
        boards.pollInterval = 100;
        //const numPollsWanted = 3;

        const robotWithSession = 'SB00003'; // must match yaml config file
        const wbSessionId = 123;
        let sessionResponse = {
            sessions: [
                {
                    id: wbSessionId,
                    robot: robotWithSession,
                    state: 'ARRIVED_AND_EMBODIED'
                },
                {
                    id: 3,
                    robot: 'SB_no_wb',  // a robot that does not have whiteboarding should be ignored
                    state: 'ARRIVED_AND_EMBODIED'
                }
            ]
        };
        let sessioncallcount = 0;
        const rmsWithSession = 'rms1.ava8.net'; // must match yaml config file
        let newCollabCode;
        let setSessionId;
        function myfakepost(rms, api, data, logit) {
            let rv = {sessions:[]};
            //console.log(`fake request to ${rms.rms} ${api}`);
            // Respond with a session only for one RMS.
            // Start with a session for 2 iterations, then remove the session.
            if (api == '/api/rms/sessions' && rms.rms == rmsWithSession){
                sessioncallcount++;
                if (sessioncallcount <= 2) {
                    rv = sessionResponse;
                }
            } else if (api == '/api/rms/setSession') {
                newCollabCode = data.collaborationCode;
                setSessionId = data.id;
            }
            return Promise.resolve(rv);
        }
        let fakepost = sinon.fake(myfakepost);
        sinon.replace(rmsutil, "rmsPost", fakepost);

        let clock = sinon.useFakeTimers();
        let pollPromise = boards.startPollingAllRMS();
        assert.equal(boards.boardList.length, 0, "empty boardlist to start");

        // poll 1 session started
        //console.log('tick 10');
        await clock.tickAsync(10);
        assert.equal(boards.boardList.length, 1, "one active board for a session");
        let board = boards.getBoardFromRobot(robotWithSession);
        assert.deepInclude(board, {robot:robotWithSession,rms:rmsWithSession});
        assert.equal(newCollabCode, board.code, "setSession to RMS has correct new code");
        assert.equal(setSessionId, wbSessionId, "setSession to RMS has correct sessionId");

        // poll 2 session still there
        //console.log('tick 100');
        await clock.tickAsync(100);
        assert.equal(boards.boardList.length, 1, "still one active board for a session");
        board = boards.getBoardFromRobot(robotWithSession);
        assert.deepInclude(board, {robot:robotWithSession,rms:rmsWithSession});

        // poll 3 session ended
        //console.log('tick 100');
        await clock.tickAsync(100);
        assert.equal(boards.boardList.length, 0, "empty boardlist after session");

        //console.log('stop poll');
        boards.enablePoll=false;
        await clock.runAllAsync()
        await pollPromise;
        clock.restore();
        //console.log('DONE poll test');
    });
});
