// FIO-AWS-CloudWatch

'use strict';
const AWS = require('aws-sdk');
const cwl = new AWS.CloudWatchLogs();
const _ = require('lodash');
const _async = require('async');

const retentionDays = 30;

module.exports = {

    listLogGroups: callback => _listLogGroups(callback),
    logStreamsForGroup: (groupName, callback) => _logStreamsForGroup(groupName, callback),
    deleteLogGroup: (groupName, callback) => cwl.deleteLogGroup({ logGroupName: groupName }, callback),
    updateRetentionPeriodOnLogGroup: (logGroupName, retentionPeriodDays, callback) =>
        cwl.putRetentionPolicy({ logGroupName: logGroupName, retentionInDays: retentionPeriodDays }, callback),

    // ADMIN
    cloudWatchLogTidy: (callback) => _cloudWatchLogTidy(callback),

};

function _listLogGroups(callback, nextToken = undefined, accumulator = []) {
    let params = _.isUndefined(nextToken) ? null : { nextToken: nextToken };
    cwl.describeLogGroups(params, (err, data) => {
        if (err) {
            console.log("ERROR in _listLogGroups():\n" + JSON.stringify(err, null, 2));
            callback(err);
        }
        else {
            accumulator.push(...data.logGroups);
            if (_.isUndefined(data.nextToken)) callback(null, accumulator); // We're done.
            else _listLogGroups(callback, data.nextToken, accumulator);
        }
    });
}

function _logStreamsForGroup(groupName, callback, nextToken = undefined, accumulator = []) {
    var params = { logGroupName: groupName };
    if (!_.isUndefined(nextToken)) params.nextToken = nextToken;
    _async.retry({
            times: 20,
            interval: (retryNumber) => 1000,
            errorFilter: (err) => {
                if (err.code == 'ThrottlingException') {
                    console.log('Throttling in _logStreamsForGroup() for ' + groupName);
                    return true;
                }
                else return false;
            }
        },
        (cb_retry, result) => {
            cwl.describeLogStreams(params, (err, data) => {
                if (err) cb_retry(err);
                else {
                    accumulator.push(...data.logStreams);
                    if (_.isUndefined(data.nextToken)) cb_retry(null, accumulator);
                    else _logStreamsForGroup(groupName, cb_retry, data.nextToken, accumulator);
                }
            });
        },
        (err, results) => {
            if (err) // This means ALL tries failed
                console.log("ERROR in _logStreamsForGroup():\n" + JSON.stringify(err, null, 2));
            callback(err, results);
        }
    );
}

// ADMIN

function _cloudWatchLogTidy(callback) {
    module.exports.listLogGroups((err, logGroups) => {
        if (err) callback(err);
        else {
            console.log('pulled ' + logGroups.length + ' groups');
            _async.each(logGroups, (logGroup, cb_each) => {
                    // console.log('Processing group ' + logGroup.logGroupName);
                    module.exports.logStreamsForGroup(logGroup.logGroupName, (err, res) => {
                        if (err) cb_each(err);
                        else {
                            // console.log(res.length + ' streams for ' + logGroup.logGroupName);
                            if (res.length == 0) { // Delete the log group if it is empty.
                                // this happens as streams expire and are cleaned up at the end of the retention period
                                console.log('Group is empty. Deleting. ' + logGroup.logGroupName);
                                module.exports.deleteLogGroup(logGroup.logGroupName, (err, res) => {
                                    if (err) console.log(err);
                                    cb_each();
                                });
                            }
                            else {
                                // Set Retention Policy if needed
                                if (logGroup.retentionInDays != retentionDays) {
                                    console.log('Updating retention policy for ' + logGroup.logGroupName);
                                    module.exports.updateRetentionPeriodOnLogGroup(logGroup.logGroupName, retentionDays, cb_each);
                                }
                                else cb_each();
                            }
                        }
                    });
                },
                err => {
                    if (err) console.log(err);
                    else console.log('SUCCESSFULLY processed ' + logGroups.length + ' log groups');
                    callback(err, 'Done.');
                }
            );
        }
    });
}
