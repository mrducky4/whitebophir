const { exec } = require("child_process");
/**
 * just for testing how to run external process
 */
function pwd () {
	return new Promise( (resolve, reject) => {
		exec("pwd", (error, stdout, stderr) => {
			if (error) reject(error.message);
			else resolve(stdout);
		});
	});
}

async function getSnapshotMarkers(boardRobotInfo) {
	const args = `${boardRobotInfo.rms} ${boardRobotInfo.user} ${boardRobotInfo.pw} ${boardRobotInfo.robot} ${boardRobotInfo.code}`;
	return new Promise( (resolve, reject) => {
		exec(`./get_snapshot_markers.sh ${args}`, (error, stdout, stderr) => {
			if (error) reject(error.message);
			else resolve(stdout);
		});
	});
}

async function getSnapshotPlain(boardRobotInfo) {
	const args = `${boardRobotInfo.rms} ${boardRobotInfo.user} ${boardRobotInfo.pw} ${boardRobotInfo.robot} ${boardRobotInfo.code}`;
	return new Promise( (resolve, reject) => {
		exec(`./get_snapshot_plain.sh ${args}`, (error, stdout, stderr) => {
			if (error) reject(error.message);
			else resolve(stdout);
		});
	});
}

async function transformWhiteboardImage(boardRobotInfo) {
	const args = `${boardRobotInfo.rms} ${boardRobotInfo.user} ${boardRobotInfo.pw} ${boardRobotInfo.robot} ${boardRobotInfo.code}`;
	return new Promise( (resolve, reject) => {
		exec(`./transform_robot_image.sh ${args}`, (error, stdout, stderr) => {
			if (error) reject(stdout + ' ' + error.message);
			else resolve(stdout);
		});
	});
}

module.exports = { pwd, getSnapshotMarkers, getSnapshotPlain, transformWhiteboardImage };