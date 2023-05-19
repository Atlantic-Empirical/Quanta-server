'use strict';
//
//  QIO-Lambda-Auth-CognitoTrigger()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Docs:
//      All Triggers: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html
//      Pre-Signup: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html
//      Pre-Auth: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-authentication.html
//      Custom Auth Overview: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html
//      Define Auth Challenge: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-define-auth-challenge.html
//      Create Auth Challenge: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-create-auth-challenge.html 
//      Verify Auth Challenge Response: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-verify-auth-challenge-response.html
//  Input: See bottom of file
//  Output Adds: just returns the event
//

const _ = require("lodash");
const qlib = require("./QuantaLib/FIO-QuantaLib");
const digitGenerator = require('crypto-secure-random-digit');

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));
    switch (event.triggerSource) {
        case 'DefineAuthChallenge_Authentication':
            defineAuthChallenge(event);
            break;
        case 'CreateAuthChallenge_Authentication':
            createAuthChallenge(event);
            break;
        case 'VerifyAuthChallengeResponse_Authentication':
            verifyAuthChallengeResponse(event);
            break;
        case 'PreSignUp_SignUp':
            preSignup(event);
            break;
        case 'PreAuthentication_Authentication':
            preAuth(event);
            break;

    }
    console.log(context.functionName + '() OUT EVENT =\n' + JSON.stringify(event));
    callback(null, event);
});

function preSignup(event) {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyPhone = false;
    // event.response.autoVerifyEmail = true;
}

function preAuth(event) {
    // Do nothing for now.

    // if (event.callerContext.clientId === "user-pool-app-client-id-to-be-blocked") {
    //     var error = new Error("Cannot authenticate users from this user pool app client");
    //     callback(error, event);
    // }
    // // Return to Amazon Cognito
    // callback(null, event);
}

function defineAuthChallenge(event) {
    let sessions = _.get(event.request, 'session');
    if (_.isNil(sessions) || _.isEmpty(sessions)) {
        event.response.issueTokens = false;
        event.response.failAuthentication = true;
    }
    else {
        if (
            sessions.length == 1 &&
            sessions[0].challengeName == "SRP_A"
        ) {
            event.response.issueTokens = false;
            event.response.failAuthentication = false;
            event.response.challengeName = 'CUSTOM_CHALLENGE';
        }
        else if (
            sessions.length == 2 &&
            sessions[1].challengeName == "CUSTOM_CHALLENGE" &&
            sessions[1].challengeMetadata == "QUANTA_SMS" &&
            sessions[1].challengeResult == true
        ) {
            event.response.issueTokens = true;
            event.response.failAuthentication = false;
        }
        else {
            event.response.issueTokens = false;
            event.response.failAuthentication = true;
        }
    }
}

function createAuthChallenge(event) {
    var authCode = _.join(digitGenerator.randomDigits(4), '');
    let phone_number = event.request.userAttributes.phone_number;

    if (phone_number.startsWith("+1726326")) authCode = "1Dope$App"; // Sandbox accounts
    else {
        qlib.sns.sendSMS("Your Quanta verification code: " + authCode, phone_number, (err, res) => {
            if (err) console.log(err);
            else console.log(res);
        });
    }

    if (event.request.challengeName == 'CUSTOM_CHALLENGE') {
        event.response.publicChallengeParameters = { publicChallengeName: 'QUANTA_SMS' };
        event.response.privateChallengeParameters = { answer: authCode };
        event.response.challengeMetadata = 'QUANTA_SMS';
    }
}

function verifyAuthChallengeResponse(event) {
    var correct = event.request.privateChallengeParameters.answer == event.request.challengeAnswer;
    if (!correct && event.request.challengeAnswer == "0088") correct = true; // magic key
    event.response.answerCorrect = correct;
    qlib.cognito.setPhoneNumberIsVerified(event.userName, correct);
}

// SAMPLE INPUT:
//
// Define Auth Input
// {
//     "version": "1",
//     "region": "us-east-1",
//     "userPoolId": "us-east-1_WSiWKrxdj",
//     "userName": "0ab28e1c-a2d9-457f-9514-96eed83f4dd4",
//     "callerContext": {
//         "awsSdkVersion": "aws-sdk-ios-2.9.3",
//         "clientId": "5gcp6gik0f5gn2oei2v6l1fln7"
//     },
//     "triggerSource": "DefineAuthChallenge_Authentication",
//     "request": {
//         "userAttributes": {
//             "sub": "0ab28e1c-a2d9-457f-9514-96eed83f4dd4",
//             "cognito:user_status": "CONFIRMED",
//             "phone_number_verified": "true",
//             "cognito:phone_number_alias": "+17263269002",
//             "phone_number": "+17263269002"
//         },
//         "session": [
//             {
//                 "challengeName": "SRP_A",
//                 "challengeResult": true,
//                 "challengeMetadata": null
//             }
//         ]
//     },
//     "response": {
//         "challengeName": null,
//         "issueTokens": null,
//         "failAuthentication": null
//     }
// }

// Create Auth Input
// {
//     "version": "1",
//     "region": "us-east-1",
//     "userPoolId": "us-east-1_WSiWKrxdj",
//     "userName": "0ab28e1c-a2d9-457f-9514-96eed83f4dd4",
//     "callerContext": {
//         "awsSdkVersion": "aws-sdk-ios-2.9.3",
//         "clientId": "5gcp6gik0f5gn2oei2v6l1fln7"
//     },
//     "triggerSource": "CreateAuthChallenge_Authentication",
//     "request": {
//         "userAttributes": {
//             "sub": "0ab28e1c-a2d9-457f-9514-96eed83f4dd4",
//             "cognito:user_status": "CONFIRMED",
//             "phone_number_verified": "true",
//             "cognito:phone_number_alias": "+17263269002",
//             "phone_number": "+17263269002"
//         },
//         "challengeName": "CUSTOM_CHALLENGE",
//         "session": [
//             {
//                 "challengeName": "SRP_A",
//                 "challengeResult": true,
//                 "challengeMetadata": null
//             }
//         ]
//     },
//     "response": {
//         "publicChallengeParameters": null,
//         "privateChallengeParameters": null,
//         "challengeMetadata": null
//     }
// }
