// FIO-AWS-S3

'use strict';
const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const _ = require('lodash');

module.exports = {

    putObject: (obj, bucketName, objectKey, callback, ACL) => _putObject(obj, bucketName, objectKey, callback, ACL),
    getObject: (bucketName, objectKey, callback) => S3.getObject({ Bucket: bucketName, Key: objectKey }, callback),
    deleteObject: (bucketName, objectKey, callback) => S3.deleteObject({ Bucket: bucketName, Key: objectKey, }, callback),
    createBucket: (bucketName, callback) => S3.createBucket({ Bucket: bucketName }, callback),

};

function _putObject(thing, bucketName, objectKey, callback, ACL) {

    let params = {
        Body: thing,
        Bucket: bucketName,
        Key: objectKey,
        ServerSideEncryption: "AES256"
    };
    if (!_.isUndefined(ACL)) params.ACL = ACL;

    S3.putObject(params, (err, res) => {
        if (err) {
            console.log("ERROR in _putObject (S3).\nPARAMS:\n" + JSON.stringify(params) + "\nERR:\n" + JSON.stringify(err, null, 2));
            if (err.code == "NoSuchBucket") {
                console.log('Bucket doesnt exist. Will attempt to create it.');
                module.exports.createBucket(bucketName, (err, res) => {
                    if (err) callback(err);
                    else {
                        console.log('Bucket created. Now attempting to store item again.');
                        _putObject(thing, bucketName, objectKey, callback, ACL);
                    }
                });
            }
            else callback(err);
        }
        else callback(null, res);
    });
}
