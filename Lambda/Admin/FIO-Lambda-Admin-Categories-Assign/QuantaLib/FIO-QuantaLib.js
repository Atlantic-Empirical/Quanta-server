//
//  FIO-QuantaLib
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//

'use strict';
require('./Helper/cycle.js');

module.exports = {

    // Core
    persist: require('./Core/FIO-Persist'),
    log: require('./Core/FIO-Logging'),
    notifs: require("./Core/FIO-Notify"),
    tx: require('./Core/FIO-Transactions'),

    // AWS
    ddb: require('./AWS/FIO-AWS-DDb'),
    ddbparams: require('./AWS/FIO-AWS-DDb-ParamConstructor'),
    lambda: require('./AWS/FIO-AWS-Lambda'),
    stepFunctions: require('./AWS/FIO-AWS-StepFunctions'),
    cognito: require('./AWS/FIO-AWS-Cognito'),
    sns: require('./AWS/FIO-AWS-SNS'),
    step: require('./AWS/FIO-AWS-StepFunctions'),
    sqs: require('./AWS/FIO-AWS-SQS'),
    cs: require("./AWS/FIO-AWS-CloudSearch"),
    cw: require("./AWS/FIO-AWS-CloudWatch"),
    s3: require("./AWS/FIO-AWS-S3"),

    // Util
    date: require('./Util/FIO-Util-Date'),
    obj: require('./Util/FIO-Util-ObjectStuff'),
    math: require('./Util/FIO-Util-Math'),
    files: require('./Util/FIO-Util-FileSystem'),
    csv: require('./Util/QIO-Util-CSV'),

    // Helpers
    FIOError: require('./Helper/FIO-Error'),

};
