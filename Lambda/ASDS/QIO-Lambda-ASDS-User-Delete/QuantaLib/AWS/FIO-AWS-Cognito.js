// FIO-AWS-Cognito

'use strict';
const AWS = require('aws-sdk');
const cogId = new AWS.CognitoIdentity();
const cognitoISP = new AWS.CognitoIdentityServiceProvider();
const _ = require('lodash');

const userPoolId = 'us-east-1_qEX0vG1or';
const federatedIdentityPoolId = "us-east-1:5fbd6d53-7e11-4af2-842f-dc06db2885cd";

module.exports = {

    deleteFederatedIdentityForUser: (userId, callback) =>
        cogId.deleteIdentities({ IdentityIdsToDelete: [userId] }, callback),
    deleteCognitoIdentityForUserSub: (sub, callback) => _deleteCognitoIdentityForUserSub(sub, callback),
    listCognitoUsers: (attributeName, attributeValue, callback) =>
        _listCognitoUsers(attributeName, attributeValue, callback),
    listFederatedIdentities: callback => _listFederatedIdentities(callback),
    deleteFederatedIdentities: (ids, callback) => _deleteFederatedIdentities(ids, callback),
    setUserAttribute: (userName, attributeName, attributeValue, callback) =>
        _setUserAttribute(userName, attributeName, attributeValue, callback),
    setPhoneNumberIsVerified: (username, isVerified, callback) => _setPhoneNumberIsVerified(username, isVerified, callback),

};

function _deleteFederatedIdentities(ids, callback) {

    let res = _
        .chain(ids)
        .chunk(60)
        .map(chunk => {
            cogId.deleteIdentities({ IdentityIdsToDelete: chunk }, (err, res) => _.merge(err, res));
        })
        .value();

    callback(null, res);
}

function _listFederatedIdentities(callback, nextToken = "", aggregator = []) {
    var params = {
        IdentityPoolId: federatedIdentityPoolId,
        MaxResults: 60,
        HideDisabled: false,
    };
    if (!_.isNil(nextToken) && !_.isEmpty(nextToken)) params.NextToken = nextToken;
    cogId.listIdentities(params, (err, data) => {
        if (err) callback(err);
        else {
            aggregator.push(...data.Identities);
            if (!_.isNil(data.NextToken)) _listFederatedIdentities(callback, data.NextToken, aggregator);
            else callback(null, aggregator);
        }
    });
}

function _deleteCognitoIdentityForUserSub(sub, callback) {
    if (_.isUndefined(sub)) callback(null, 'No sub passed in.');
    else {
        cognitoISP.adminDeleteUser({
                UserPoolId: userPoolId,
                Username: sub
            },
            (err, data) => {
                if (err) {
                    if (err.code == "UserNotFoundException") console.log('User not found in Cognito. Continuing.');
                    else console.log('ERROR in _deleteCognitoIdentityForUserSub: ' + err);
                    callback(err);
                }
                else callback(null, data);
            }
        );
    }
}

function _listCognitoUsers(attributeName, attributeValue, callback) {
    cognitoISP.listUsers({
            UserPoolId: userPoolId,
            Filter: attributeName + ' ^= \"' + attributeValue + '\"'
        },
        (err, data) => {
            if (err) callback(err);
            else {
                // Makes everything lowercase, but not remembering why...
                let out = _.map(data.Users, U => {
                    var user = {
                        username: U.Username,
                        createDate: U.UserCreateDate,
                        lastModifiedDate: U.UserLastModifiedDate,
                        enabled: U.Enabled,
                        userStatus: U.UserStatus,
                        attributes: {}
                    };
                    _.each(U.Attributes, A => user.attributes[A.Name] = A.Value);
                    return user;
                });

                callback(null, out);
            }
        }
    );
}

function _setUserAttribute(userName, attributeName, attributeValue, callback) {
    let params = {
        UserAttributes: [{
            Name: attributeName,
            Value: attributeValue
        }],
        UserPoolId: userPoolId,
        Username: userName
    };
    cognitoISP.adminUpdateUserAttributes(params, (err, res) => {
        if (err) console.log("ERROR in _setUserAttribute(): " + err);
        else if (callback) callback(err, res);
    });
}

function _setPhoneNumberIsVerified(username, isVerified, callback) {
    if (!_.isString(isVerified)) isVerified = isVerified.toString();
    _setUserAttribute(username, 'phone_number_verified', isVerified, callback);
}
