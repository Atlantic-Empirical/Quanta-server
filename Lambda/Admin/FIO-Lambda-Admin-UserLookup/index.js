// FIO-Lambda-Admin-UserLookup
// Input: .subs[] OR .userIds[] OR .attributeName & .attributeValue

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
const _async = require("async");
const qlib = require("./QuantaLib/FIO-QuantaLib");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.time(context.functionName);

    if (event.exportData == true) exportUserData(event.userId, callback);
    else {
        if (!_.isUndefined(event.subs))
            _async.each(event.subs, (sub, cb_each) => {
                renderDataForSub(sub, cb_each);
            }, err => callback(err));
        else if (event.userIds)
            _async.each(event.userIds, (userId, cb_each) => {
                renderDataForUserId(userId, cb_each);
            }, err => callback(err));
        else if (event.attributeName == 'userId')
            renderDataForUserId(event.attributeValue, callback);
        else
            renderDataForAttribute(event.attributeName, event.attributeValue, callback);
    }
});

function renderDataForSub(sub, callback) {
    qlib.cognito.listCognitoUsers("sub", sub, (err, res) => {
        if (err) callback(err);
        else if (_.isEmpty(res)) callback(null, 'User not found for sub: ' + sub);
        else {
            qlib.persist.pullUserIdForSub(sub, (err, userId) => {
                if (err) callback(err);
                else if (_.isUndefined(userId) || _.isEmpty(userId)) callback(null, "User not found in fedId for sub.");
                else {
                    var user = _.first(res);
                    user.userId = userId;
                    console.log(JSON.stringify(user, null, 2));
                    callback();
                }
            });
        }
    });
}

function renderDataForAttribute(attributeName, attributeValue, callback) {
    qlib.cognito.listCognitoUsers(attributeName, attributeValue, (err, users) => {
        if (err) callback(err);
        else if (_.isEmpty(users)) callback(null, 'user not found in cognito');
        else {
            let u = _.first(users);
            console.log("sub = " + u.username);
            qlib.persist.pullUserIdForSub(u.attributes.sub, (err, res) => {
                if (err) callback(err);
                else if (_.isUndefined(res)) callback(null, 'no match in mapping table');
                else {
                    u.userId = res;
                    console.log(JSON.stringify(u, null, 2));
                    callback();
                }
            });
        }
    });
}

function renderDataForUserId(userId, callback) {
    qlib.persist.pullUserSub(userId, (err, sub) => {
        if (err) callback(err);
        else if (_.isUndefined(sub)) callback(null, 'No sub for userId in the mapping table.');
        else {
            qlib.cognito.listCognitoUsers('sub', sub, (err, users) => {
                if (err) callback(err);
                else if (_.isEmpty(users)) callback(null, 'User not found in cognito');
                else {
                    let u = _.first(users);
                    u.userId = userId;
                    console.log(JSON.stringify(u, null, 2));
                    // console.log(u.attributes.phone_number);
                    callback();
                }
            });
        }
    });
}

function exportUserData(userId, callback) {
    _async.parallel([
            cb => qlib.persist.pullUserDetailObjects(userId, cb) // User Details
        ],
        (err, res) => {
            if (err) console.log(JSON.stringify(err));
            console.log("\n" + JSON.stringify(res));
            callback(null, 'done');
        }
    );
}
