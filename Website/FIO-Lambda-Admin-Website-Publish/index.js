// FIO-Lambda-Admin-Website-Publish()
//  Reference
//      https://www.npmjs.com/package/s3-node-client

'use strict';
const AWS = require('aws-sdk');
const s3 = require('s3-node-client');
const http = require('http');
const https = require('https');
const s3Client = s3.createClient({
    maxAsyncS3: 20, // this is the default
    s3RetryCount: 3, // this is the default
    s3RetryDelay: 1000, // this is the default
    multipartUploadThreshold: 20971520, // this is the default (20 MB)
    multipartUploadSize: 15728640, // this is the default (15 MB)
    s3Options: {
        accessKeyId: "AKIAJHTXKG3JLNL7BODQ",
        secretAccessKey: "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",
        region: "us-east-1",
        // Any other options are passed to new AWS.S3()
        //  See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
    }
});

exports.handler = (event, context, callback) => {
    http.globalAgent.maxSockets = https.globalAgent.maxSockets = 20;

    let params = {
        localDir: "./src",
        deleteRemoved: true, // default false, whether to remove s3 objects that have no corresponding local file.
        s3Params: {
            Bucket: "flow.app",
            ACL: "public-read",
            // Other options supported by putObject, except Body and ContentLength.
            //  See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
        }
    };

    var uploader = s3Client.uploadDir(params);
    uploader.on('progress', () => console.log("progress", uploader.progressAmount, uploader.progressTotal));
    uploader.on('error', err => callback(err));
    uploader.on('end', () => callback(null, "done uploading"));
};
