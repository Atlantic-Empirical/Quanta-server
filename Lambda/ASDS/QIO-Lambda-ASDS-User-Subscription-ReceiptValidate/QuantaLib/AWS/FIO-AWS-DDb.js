// FIO-AWS-DDb

'use strict';
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const autoscaling = new AWS.ApplicationAutoScaling();
const _ = require('lodash');
const _async = require('async');
const params = require("./FIO-AWS-DDb-ParamConstructor");
const q_log = require("../Core/FIO-Logging");

module.exports = {

    // PULLING ITEMS
    getItem: (tableName, keyNames, keyValues, callback, projections) =>
        _getItem(tableName, keyNames, keyValues, callback, projections),
    query: (tableName, attributeNames, attributeValues, callback, indexName, projections, limit, select, filterNames, filterValues) =>
        _query(tableName, attributeNames, attributeValues, callback, indexName, projections, limit, select, filterNames, filterValues),
    scanWithParams: (params, callback) => _scanDdb_recursive(params, callback),
    scan: (tableName, callback, filterNames, filterValues, indexName, projections, limit, select, attributeNames, attributeValues) =>
        _scan(tableName, attributeNames, attributeValues, callback, indexName, projections, limit, select, filterNames, filterValues),
    pullAllItemsFromTable: (tableName, callback, projections) => _pullAllItemsFromTable(tableName, callback, projections),
    batchGet: (tableName, keyObjs, hashKeyName, callback, projections, sortKeyName) =>
        _batchGet(tableName, keyObjs, hashKeyName, callback, projections, sortKeyName),

    // INSERTING & UPDATING ITEMS
    putItem: (tableName, itemObj, callback) => _putItem(tableName, itemObj, callback),
    update: (tableName, hashName, hashValue, actionName, propertyNames, propertyValues, callback, sortName, sortValue, returnValue) =>
        _update(tableName, hashName, hashValue, actionName, propertyNames, propertyValues, callback, sortName, sortValue, returnValue),
    batchWrite: (tableName, objectArray, callback) => _batchWrite(tableName, objectArray, callback),

    // DELETING ITEMS
    deleteItem: (tableName, hashName, hashValue, callback, sortName, sortValue) =>
        _deleteItem(tableName, hashName, hashValue, callback, sortName, sortValue),
    batchDelete: (tableName, objectArray, hashKeyName, sortKeyName, callback) =>
        _batchDelete(tableName, objectArray, hashKeyName, sortKeyName, callback),

    // TABLE METADATA
    describeTable: (tableName, callback) => _describeTable(tableName, callback),
    itemCountForTable: (tableName, callback) => _itemCountForTable(tableName, callback),
    tableStatus: (tableName, callback) => _tableStatus(tableName, callback),

    // TABLE ADMIN
    copyTableContents: (fromTableName, toTableName, callback) => _copyTableContents(fromTableName, toTableName, callback),
    turnOnPointInTimeRecoveryForTable: (tableName, callback) => _turnOnPointInTimeRecoveryForTable(tableName, callback),
    deleteTable: (tableName, callback) => _deleteTable(tableName, callback),
    createTable: (params, callback) => _createTable(params, callback),
    setAutoScalingForTable: (tableName, maxRead, maxWrite) => _setAutoScalingForTable(tableName, maxRead, maxWrite),

    // THROUGHPUT
    setMinimumThroughput: (tableName, applyToIndexes, RCU, WCU, callback) =>
        _comprehensiveSetTableThroughput(tableName, applyToIndexes, RCU, WCU, 'minval', callback),
    setExactThroughput: (tableName, applyToIndexes, RCU, WCU, callback) =>
        _comprehensiveSetTableThroughput(tableName, applyToIndexes, RCU, WCU, 'exact', callback),
    comprehensiveSetTableThroughput: (tableName, applyToIndexes, RCU, WCU, changeType, callback) =>
        _comprehensiveSetTableThroughput(tableName, applyToIndexes, RCU, WCU, changeType, callback),
    increaseTableWriteThroughputByFactor: (tableName, factor, callback) => _increaseTableWriteThroughputByFactor(tableName, factor, callback),

};

// PULLING ITEMS

function _getItem(tableName, keyNames, keyValues, callback, projections) {
    if (_.isNil(keyValues) || _.isEmpty(keyValues)) callback("keyValues is nil/empty");
    else {
        let p = params.constructParamsForProto({
            method: "getItem",
            tableName: tableName,
            key: {
                names: keyNames,
                values: keyValues
            },
            projections: projections
        });
        ddb.getItem(p, (err, data) => {
            if (err) callback(err);
            else if (_.isNil(data.Item)) callback();
            else callback(err, AWS.DynamoDB.Converter.unmarshall(data.Item));
        });
    }
}

function _query(tableName, attributeNames, attributeValues, callback, indexName, projections, limit, select, filterNames, filterValues) {

    let p = params.constructParamsForProto({
        method: 'query',
        tableName: tableName,
        indexName: indexName,
        key: {
            names: attributeNames,
            values: attributeValues
        },
        projections: projections,
        filters: {
            names: filterNames,
            values: filterValues
        },
        select: select,
        limit: limit
    });
    ddb.query(p, (err, data) => {
        if (err) {
            console.log("ERROR in _simpleQuery: " + err + "\n" + JSON.stringify(p, null, 2));
            callback(err);
        }
        else {
            if (select == "COUNT") callback(null, data.Count);
            else {
                let items = _.map(_.get(data, 'Items'), AWS.DynamoDB.Converter.unmarshall);
                if (limit == 1) callback(null, _.first(items));
                else callback(null, items);
            }
        }
    });
}

function _scan(tableName, attributeNames, attributeValues, callback, indexName = undefined, projections = undefined, limit = 0, select = undefined, filterNames = undefined, filterValues = undefined, accumulatorArray = []) {
    let p = params.constructParamsForProto({
        method: 'scan',
        tableName: tableName,
        indexName: indexName,
        projections: projections,
        filters: {
            names: filterNames,
            values: filterValues
        },
        select: select,
        limit: limit
    });
    _scanDdb_recursive(p, (err, res) => {
        if (err) console.log("ERROR in _scan: " + err);
        callback(err, res);
    });
}

function _scanDdb_recursive(params, callback, accumulatorArray = []) {
    ddb.scan(params, (err, res) => {
        if (err) callback(err);
        else {
            let out = _.map(res.Items, AWS.DynamoDB.Converter.unmarshall);
            accumulatorArray.push(...out);
            if (_.isUndefined(res.LastEvaluatedKey)) {
                console.log('Finished scan operation with a total of ' + accumulatorArray.length + ' records');
                callback(null, accumulatorArray);
            }
            else {
                console.log('Looping scan operation for params: ' + JSON.stringify(params));
                params.ExclusiveStartKey = res.LastEvaluatedKey;
                _scanDdb_recursive(params, callback, accumulatorArray);
            }
        }
    });
}

function _pullAllItemsFromTable(tableName, callback, projections) {
    let p = params.constructParamsForProto({
        method: "scan",
        tableName: tableName,
        projections: projections
    });
    _scanDdb_recursive(p, (err, res) => {
        if (err) console.log("ERROR in _pullAllItemsFromTable: " + err);
        callback(err, res);
    });
}

function _batchGet(tableName, keyObjs, hashKeyName, callback, projections, sortKeyName) {
    let p = params.constructParamsForProto({
        method: "batchGetItem",
        tableName: tableName,
        keys: _.map(keyObjs, o => ({
            hash: [hashKeyName, o[hashKeyName]],
            sort: [sortKeyName, o[sortKeyName]]
        }))
    });
    innerPerformBatchGet(tableName, p, (err, res) => {
        if (err) console.log("ERROR in _batchGet: " + err);
        callback(err, res);
    });
}

function innerPerformBatchGet(tableName, batchGetParams, callback, aggregator = []) {

    _async.each(batchGetParams,
        (batchParams, cb_each) => {
            // console.log('batchParams: ' + JSON.stringify(batchParams, null, 2));

            _async.retry(

                {
                    times: 15,
                    interval: (retryNumber) => 1000 * Math.pow(2, retryNumber),
                    // 500 = 1, 2, 4, 8, 16, 32, 64, 128s
                    // 1000 = 2, 4, 8, 16, 32, 64, 128, 256s

                    errorFilter: (err) => {
                        if (err == 'UnprocessedItems') return true;
                        else return false;
                    }
                },

                (cb_retry, result) => {

                    let itemsToPull = _.isUndefined(result) ? batchParams : result;
                    // console.log('itemsToWrite: ' + JSON.stringify(itemsToWrite));

                    ddb.batchGetItem(itemsToPull, (err, data) => {
                        if (err) {
                            if (err.code == "ProvisionedThroughputExceededException") {
                                console.log('ProvisionedThroughputExceededException');
                                _comprehensiveSetTableThroughput(tableName, false, 100, 0, 'minval', cb_retry); // this should probably use a factor, not an exact value
                            }
                            else {
                                console.log("ERROR in innerPerformBatchGet() ddb.batchGetItem for " + tableName + ' batchParams:\n' + JSON.stringify(batchParams, null, 2) + '\nerr:\n' + JSON.stringify(err, null, 2));
                                cb_retry(err);
                            }
                        }
                        else {
                            // console.log('ddb.batchGetItem: ' + JSON.stringify(data));
                            let out = _.map(data.Responses[tableName], AWS.DynamoDB.Converter.unmarshall);
                            aggregator.push(...out);

                            if (!_.isEmpty(data.UnprocessedItems)) {
                                console.log(data.UnprocessedItems[tableName].length + ' unprocessed items to retry.');
                                cb_retry('UnprocessedItems', data.UnprocessedItems[tableName]); // retry with backoff
                            }
                            else {
                                console.log('*** No unprocessed items in this batch.');
                                cb_retry(null, 'Done'); // we're done with this batch
                            }
                        }
                    });
                },
                (err, results) => {
                    if (err) { // This means ALL tries failed
                        console.log("ERROR in innerPerformBatchGet async.retry(): " + err);
                        cb_each(err);
                    }
                    else cb_each(); // this means ANY of the tries succeeded
                }
            );
        },
        (err) => {
            if (err) { // One of the async batches failed ALL tries
                console.log("ERROR: Ultimate failure in innerPerformBatchGet() " + err);
                callback(err);
            }
            else { // ALL async batches completed successfully
                console.log('All batches pulled successfully');
                callback(null, aggregator);
            }
        }
    );
}

// INSERTING & UPDATING ITEMS

function _putItem(tableName, itemObj, callback) {
    let p = params.constructParamsForProto({
        method: "putItem",
        tableName: tableName,
        item: itemObj
    });
    ddb.putItem(p, (err, res) => {
        if (err) console.log("ERROR in _putItem: " + err);
        else console.log("Item put success");
        if (!_.isUndefined(callback))
            callback(err, res);
    });
}

function _update(tableName, hashName, hashValue, actionName, propertyNames, propertyValues, callback, sortName, sortValue, returnValue) {
    let p = params.constructParamsForProto({
        method: "updateItem",
        tableName: tableName,
        key: {
            names: [hashName, sortName],
            values: [hashValue, sortValue]
        },
        updates: {
            action: actionName,
            names: propertyNames,
            values: propertyValues
        },
        returnValue: returnValue
    });
    ddb.updateItem(p, (err, res) => {
        if (err) console.log("ERROR in _updateSet: " + err);
        let out = (!_.isNil(returnValue) && !_.isNil(res.Attributes)) ? AWS.DynamoDB.Converter.unmarshall(res.Attributes) : undefined;
        if (callback) callback(err, out);
    });
}

function _batchWrite(tableName, objectArray, callback) {
    if (_.isNil(objectArray) || _.isEmpty(objectArray)) { callback(null, '_batchWrite objectArray is null/empty'); return; }
    let startTime = Date.now();
    let p = params.constructParamsForProto({
        method: "batchWriteItem_put",
        tableName: tableName,
        items: objectArray
    });
    innerPerformBatchWrite(tableName, p, (err, res) => {
        console.log('batchWrite (' + tableName + ') Duration = ' + (Date.now() - startTime) + 'ms');
        if (err) console.log("ERROR in _batchWrite: " + err);
        if (!_.isUndefined(callback)) callback(err, res);
    });
}

function innerPerformBatchWrite(tableName, batchWriteParams, callback) {

    // Setup the queue with concurrancy of ...
    var q = _async.queue((task, cb_q) => _innerInnerBatchWrite(tableName, task, cb_q), 1);

    // Overall success callback
    q.drain = () => {
        console.log('innerPerformBatchWrite (' + tableName + '): all items have been processed');
        callback(null, 'All batches written successfully');
    };

    // Error callback
    q.error = (err, batch) => {
        console.log("ERROR: Ultimate failure in innerPerformBatchWrite (" + tableName + ")\n" + JSON.stringify(err, null, 2));
        console.log("NAUGHTY OBJECT\n" + JSON.stringify(batch));
        callback(err);
    };

    // Add all batches to the queue
    q.push(batchWriteParams, err => {
        if (err) {
            console.log('ERROR: innerPerformBatchWrite (' + tableName + ') failed with:\n' + JSON.stringify(err, null, 2));
            q_log.significantError({ err: err, params: batchWriteParams }, "innerPerformBatchWrite");
        }
    });
}

function _innerInnerBatchWrite(tableName, batch, callback) {
    let maxRetries = 30;
    _async.retry({
            times: maxRetries,
            interval: retryNumber => {
                let i = _.round(750 * Math.pow(1.25, retryNumber)); // 1000 = 2, 4, 8, 16, 32, 64, 128, 256s
                console.log('Retrying batchWrite (' + tableName + ') after ' + i + 'ms. Retry ' + retryNumber + ' of ' + maxRetries);
                return i;
            },
            errorFilter: (err) => {
                if (err == 'UnprocessedItems') return true;
                else return false;
            }
        },
        (cb_retry, result) => {
            let itemsToWrite = _.isUndefined(result) ? batch : result;
            // console.log('itemsToWrite: ' + JSON.stringify(itemsToWrite));
            ddb.batchWriteItem(itemsToWrite, (err, data) => {
                // let response = Date.now();
                // console.log('Elapsed time = ' + (response - start) + 'ms');
                // console.log('Batch write result data: ' + JSON.stringify(data));
                if (err) {
                    if (err.code == "ProvisionedThroughputExceededException") {
                        console.log('ProvisionedThroughputExceededException');
                        console.log('Going to update table throughput for ' + tableName);
                        _comprehensiveSetTableThroughput(tableName, false, 0, 100, 'minval', cb_retry); // this should probably use a factor, not an exact value
                    }
                    else {
                        console.log("ERROR in innerPerformBatchWrite ddb.batchWriteItem: " + err.message, err);
                        cb_retry(err);
                    }
                }
                else {
                    if (!_.isEmpty(data.UnprocessedItems)) {
                        console.log(data.UnprocessedItems[tableName].length + ' unprocessed items in batch (' + tableName + '), will retry.');
                        cb_retry('UnprocessedItems', data.UnprocessedItems[tableName]); // retry with backoff
                    }
                    else {
                        // console.log('*** No unprocessed items in this batch.');
                        cb_retry(null, 'Done'); // we're done with this batch
                    }
                }
            });
        },
        (err, results) => {
            if (err) { // this means ALL tries failed
                console.log("ERROR in _innerInnerBatchWrite async.retry():\n" + JSON.stringify(err, null, 2));
                callback(err);
            }
            else callback(); // this means ANY of the tries succeeded
        }
    );
}

// DELETING ITEMS

function _deleteItem(tableName, hashName, hashValue, callback, sortName, sortValue) {
    let p = params.constructParamsForProto({
        method: "deleteItem",
        tableName: tableName,
        key: {
            names: [hashName, sortName],
            values: [hashValue, sortValue]
        }
    });
    ddb.deleteItem(p, (err, res) => {
        if (err) console.log("ERROR in _deleteItem: " + err);
        callback(err, res);
    });
}

function _batchDelete(tableName, objectArray, hashKeyName, sortKeyName, callback) {
    if (_.isNil(objectArray) || _.isEmpty(objectArray)) { callback(); return; }

    let p = params.constructParamsForProto({
        method: "batchWriteItem_delete",
        tableName: tableName,
        keys: {
            names: [hashKeyName, sortKeyName],
            values: objectArray
        }
    });
    innerPerformBatchWrite(tableName, p, (err, res) => {
        if (err) console.log("ERROR in _batchDelete: " + err);
        callback(err, res);
    });
}

// TABLE ADMIN

function _createTable(params, callback) {
    _tableStatus(params.TableName, status => {
        if (status == 'DELETING') {
            console.log('Going around again: ' + params.TableName + ' ' + status);
            wait(1000);
            _createTable(params, callback);
        }
        else {
            console.log('OK TIME TO TRY TO CREATE TABLE!! ' + params.TableName);
            tryCreateTable(params, result => {
                if (result == 'retry') {
                    wait(10000);
                    _createTable(params, callback);
                }
                else callback();
            });
        }
    });
}

function tryCreateTable(params, callback) {
    console.log('Going to create table: ' + JSON.stringify(params));
    ddb.createTable(params, (err, data) => {
        if (err) {
            console.error('Unable to create table ( ' + params.TableName + ' ). Error JSON: ' + JSON.stringify(err));
            if (err.code == 'LimitExceededException') {
                console.log('Currently at table creation limit. Will wait and try again shortly (' + params.TableName + ')');
                callback('retry');
            }
            else callback('fail');
        }
        else {
            console.log('Created table (' + params.TableName + '). Table description JSON: ' + JSON.stringify(data, null, 2));
            _turnOnPointInTimeRecoveryForTable(params.TableName);
            _setAutoScalingForTable(params.TableName);
            callback('success');
        }
    });
}

function _deleteTable(tableName, callback) {
    console.log('Going to delete table: ' + tableName);
    ddb.deleteTable({ TableName: tableName }, function(err, data) {
        if (err) {
            if (err.code == "ResourceNotFoundException") {
                console.error('TABLE NOT FOUND (' + tableName + '). Error JSON: ' + JSON.stringify(err, null, 2));
                callback(null, "Table not found");
            }
            else {
                console.error('Unable to delete table (' + tableName + '). Error JSON: ' + JSON.stringify(err, null, 2));
                callback(err, false);
            }
        }
        else {
            console.log('Deleted table (' + tableName + '). Table description JSON:' + JSON.stringify(data));
            callback(null, true);
        }
    });
}

function _turnOnPointInTimeRecoveryForTable(tableName, callback) {
    tryTurnOnPointInTimeRecovery(tableName, res => {
        if (res == 'retry') {
            wait(10000);
            _turnOnPointInTimeRecoveryForTable(tableName, callback);
        }
        else callback();
    });
}

function tryTurnOnPointInTimeRecovery(tableName, callback) {
    let params = {
        TableName: tableName,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true }
    };
    ddb.updateContinuousBackups(params, (err, data) => {
        if (err) {
            console.log('ERROR Failed to turn on point-in-time recovery: ' + err);
            if (err.code == 'TableNotFoundException') {
                console.log('retrying turnOnPointInTimeRecovery');
                callback('retry');
            }
            else callback('fail');
        }
        else {
            console.log('Turned on point-in-time recovery: ' + data);
            callback('success');
        }
    });
}

function _setAutoScalingForTable(tableName, maxRead = 400, maxWrite = 100) {
    console.log('_setAutoScalingForTable for ' + tableName);
    setAutoScalingProperty(tableName, 'read', maxRead);
    setAutoScalingProperty(tableName, 'write', maxWrite);
}

function setAutoScalingProperty(tableName, readOrWrite, maxCapacity) {
    let dimension = readOrWrite == 'read' ? "dynamodb:table:ReadCapacityUnits" : "dynamodb:table:WriteCapacityUnits";
    let predefinedMetricType = readOrWrite == 'read' ? "DynamoDBReadCapacityUtilization" : "DynamoDBWriteCapacityUtilization";
    let autoscalingParams = {
        MaxCapacity: maxCapacity,
        MinCapacity: 5,
        ResourceId: "table/" + tableName,
        RoleARN: "arn:aws:iam::475512417340:role/aws-service-role/dynamodb.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_DynamoDBTable",
        ScalableDimension: dimension,
        ServiceNamespace: "dynamodb"
    };
    autoscaling.registerScalableTarget(autoscalingParams, (err, data) => {
        if (err) console.log("ERROR in registerScalableTarget: " + JSON.stringify(err, null, 2));
        else {
            let scalingPolicy = {
                ServiceNamespace: "dynamodb",
                ResourceId: "table/" + tableName,
                ScalableDimension: dimension,
                PolicyName: tableName + "-scaling-policy",
                PolicyType: "TargetTrackingScaling",
                TargetTrackingScalingPolicyConfiguration: {
                    PredefinedMetricSpecification: {
                        PredefinedMetricType: predefinedMetricType
                    },
                    ScaleOutCooldown: 60,
                    ScaleInCooldown: 60,
                    TargetValue: 70.0
                }
            };
            autoscaling.putScalingPolicy(scalingPolicy, (err, data) => {
                if (err) console.log("ERROR in putScalingPolicy: " + JSON.stringify(err, null, 2));
                else console.log('success! ' + JSON.stringify(data, null, 2));
            });
        }
    });
}

function _copyTableContents(fromTableName, toTableName, callback) {
    module.exports.scanWithParams({ TableName: fromTableName }, (err, data) => {
        if (err) callback(err);
        else {
            module.exports.batchWrite(toTableName, data, callback);
        }
    });
}

function wait(ms) {
    var start = new Date().getTime();
    var end = start;
    while (end < start + ms) {
        end = new Date().getTime();
    }
}

// THROUGHPUT

function _increaseTableWriteThroughputByFactor(tableName, factor, callback) {
    _async.auto({
        wait: cb => waitForTableAndIndexesToFinishUpdating(tableName, cb),
        describe_table: ['wait', (results, cb) => _describeTable(tableName, cb)],
        set_write_throughput: ['describe_table', (results, cb) => {
            _comprehensiveSetTableThroughput(tableName, true, 0, results.describe_table.tableStatusSummary.wcu * factor, 'minval', cb);
        }],
    }, callback);
}

function _comprehensiveSetTableThroughput(tableName, applyToIndexes, RCU, WCU, changeType, callback) {
    console.log('comprehensiveSetTableThroughput()\n ' + tableName + '\n RCU = ' + RCU + '\n WCU = ' + WCU);
    _async.auto({
        wait_for_ready: (cb) => {
            console.log('in wait_for_ready');
            console.time('wait_for_ready');
            waitForTableAndIndexesToFinishUpdating(tableName, (err, res) => {
                console.timeEnd('wait_for_ready');
                if (err) cb(err);
                else cb(null, res.tableStatusSummary);
            });
        },
        inspect_existing_throughput: ['wait_for_ready', (results, cb) => {
            console.log('in inspect_existing_throughput');
            console.time('inspect_existing_throughput');
            let summary = results.wait_for_ready;
            var tableRcuIsAcceptable, tableWcuIsAcceptable;
            switch (changeType.toLowerCase()) {
                case 'minval':
                    tableRcuIsAcceptable = summary.rcu >= RCU;
                    tableWcuIsAcceptable = summary.wcu >= WCU;
                    break;
                case 'exact':
                    tableRcuIsAcceptable = summary.rcu == RCU;
                    tableWcuIsAcceptable = summary.wcu == WCU;
                    break;
                default:
                    cb('Invalid changeType: ' + changeType);
                    return;
            }
            let paramSets = [];
            if (!tableRcuIsAcceptable || !tableWcuIsAcceptable) {
                var targetRcu;
                if (!tableRcuIsAcceptable) {
                    targetRcu = RCU;
                    console.log("Need to change RCU on " + tableName);
                    console.log("Current = " + summary.rcu + ' Target = ' + targetRcu);
                }
                else targetRcu = summary.rcu;
                var targetWcu;
                if (!tableWcuIsAcceptable) {
                    targetWcu = WCU;
                    console.log("Need to change WCU on " + tableName);
                    console.log("Current = " + summary.wcu + ' Target = ' + targetWcu);
                }
                else targetWcu = summary.wcu;
                let tableUpdateParams = {
                    TableName: tableName,
                    ProvisionedThroughput: {
                        ReadCapacityUnits: targetRcu,
                        WriteCapacityUnits: targetWcu
                    }
                };
                paramSets.push(tableUpdateParams);
            }
            else console.log('Throughput on table is already acceptable. ' + tableName);

            if (applyToIndexes) {
                _.each(summary.indexes, index => {
                    var indexRcuIsAcceptable, indexWcuIsAcceptable;
                    switch (changeType) {
                        case 'minval':
                            indexRcuIsAcceptable = index.rcu >= RCU;
                            indexWcuIsAcceptable = index.wcu >= WCU;
                            break;
                        case 'exact':
                            indexRcuIsAcceptable = index.rcu == RCU;
                            indexWcuIsAcceptable = index.wcu == WCU;
                            break;
                        default:
                            cb('Invalid changeType: ' + changeType);
                            return;
                    }
                    if (!indexRcuIsAcceptable || !indexWcuIsAcceptable) {
                        var targetRcu = index.rcu;
                        if (!indexRcuIsAcceptable) {
                            targetRcu = RCU;
                            console.log("Need to change RCU on " + tableName + " " + index.name);
                            console.log("Current = " + index.rcu + ' Target = ' + targetRcu);
                        }
                        var targetWcu = index.wcu;
                        if (!indexWcuIsAcceptable) {
                            targetWcu = WCU;
                            console.log("Need to change WCU on " + tableName + " " + index.name);
                            console.log("Current = " + index.wcu + ' Target = ' + targetWcu);
                        }
                        let indexUpdateParams = {
                            TableName: tableName,
                            GlobalSecondaryIndexUpdates: [{
                                Update: {
                                    IndexName: index.name,
                                    ProvisionedThroughput: {
                                        ReadCapacityUnits: targetRcu,
                                        WriteCapacityUnits: targetWcu
                                    }
                                }
                            }]
                        };
                        paramSets.push(indexUpdateParams);
                    }
                    else console.log("Index throughput is already acceptable. " + index.name);
                });
            }

            // console.log('PARAM SET =\n' + JSON.stringify(paramSets, null, 2));
            console.timeEnd('inspect_existing_throughput');
            cb(null, paramSets);
        }],
        kick_off_updates: ['inspect_existing_throughput', (results, cb) => {
            console.log('in kick_off_updates');
            console.time('kick_off_updates');
            _async.each(results.inspect_existing_throughput, (params, cb_each) =>
                ddb.updateTable(params, (err, data) => {
                    if (err) {
                        if (err.code == "ValidationException" && err.message.startsWith("The provisioned throughput for the table will not change.")) {
                            console.log('Throughput on table is already set to the right values. Params =\n' + JSON.stringify(params, null, 2));
                            cb_each();
                        }
                        else if (err.code == "ValidationException" && err.message.startsWith("The provisioned throughput for the index")) {
                            console.log('Throughput on index is already set to the right values. Params =\n' + JSON.stringify(params, null, 2));
                            cb_each();
                        }
                        else if (err.code == "LimitExceededException" && err.message.startsWith("Subscriber limit exceeded: Provisioned throughput")) {
                            console.log('Too many throughput decreases in past hour. Params =\n' + JSON.stringify(params, null, 2));
                            cb_each();
                        }
                        else if (err.code == "ResourceInUseException") {
                            _comprehensiveSetTableThroughput(tableName, applyToIndexes, RCU, WCU, changeType, cb_each); // recurse-wait
                        }
                        else {
                            console.log("FAILED: " + err.message);
                            console.log('Params =\n' + JSON.stringify(params, null, 2));
                            cb_each(err);
                        }
                    }
                    else {
                        console.log('update succeeded for params:\n' + JSON.stringify(params) + '\n\nwith:\n' + JSON.stringify(data));
                        cb_each();
                    }
                }),
                err => {
                    console.timeEnd('kick_off_updates');
                    if (err) console.log("ERROR in one loop of kick_off_updates: " + err.message);
                    else console.log("All of the param updates were submitted successfully.");
                    cb(err);
                }
            );
        }],
        wait_for_ready_final: ['kick_off_updates', (results, cb) => {
            console.log('in wait_for_ready_final');
            console.time('wait_for_ready_final');
            waitForTableAndIndexesToFinishUpdating(tableName, (err, res) => {
                console.timeEnd('wait_for_ready_final');
                cb(err, res);
            });
        }]
    }, callback);
}

function waitForTableAndIndexesToFinishUpdating(tableName, callback) {

    let tryCount = 58;
    let intervalMS = 5000;
    let tryNumber = 0;

    _async.retry({
            times: tryCount,
            interval: intervalMS,
            errorFilter: err => {
                if (err) {} // Don't need to do anything here.
                tryNumber++;
                if (tryNumber < tryCount) return true; // Try again
                else {
                    callback(tableName + " DIDN'T FINISH UPDATING BEFORE TIMEOUT");
                    return false;
                }
            }
        },
        cb_retry => {
            _describeTable(tableName, (err, res) => {
                if (err) callback(err); // Bubble it up, bail out;
                else {
                    let allIndexesAreActive = _.every(res.GlobalSecondaryIndexes, ['IndexStatus', "ACTIVE"]);
                    if (res.TableStatus == 'UPDATING' || !allIndexesAreActive) {
                        console.log('Table and/or indexes are NOT active in ' + tableName + '\n Going to wait and ask again in ' + intervalMS / 1000 + 's.');
                        cb_retry(res.TableStatus);
                    }
                    else {
                        console.log('Table and all indexes are active in ' + tableName);
                        console.log('Table description: \n' + JSON.stringify(res, null, 2));
                        cb_retry(null, res);
                    }
                }
            });
        }, callback
    );
}

// TABLE METADATA

function _tableStatus(tableName, callback) {
    // The current state of the table:
    // CREATING - The table is being created.
    // UPDATING - The table is being updated.
    // DELETING - The table is being deleted.
    // ACTIVE - The table is ready for use.

    module.exports.describeTable(tableName, (err, data) => {
        if (err) {
            if (err.code == "ResourceNotFoundException") {
                console.error('TABLE NOT FOUND (' + tableName + ').');
                callback('DOESNT EXIST');
            }
            else callback(err);
        }
        else callback(data.Table.TableStatus);
    });
}

function _describeTable(tableName, callback) {

    ddb.describeTable({ TableName: tableName }, function(err, data) {
        if (err) {
            console.log("ERROR in describeTable(): " + err, err.stack);
            callback(err);
        }
        else {
            // console.log(data.Table);

            var res = data.Table;

            res.tableStatusSummary = {
                name: tableName,
                status: res.TableStatus,
                rcu: res.ProvisionedThroughput.ReadCapacityUnits,
                wcu: res.ProvisionedThroughput.WriteCapacityUnits,
                indexes: _.map(res.GlobalSecondaryIndexes, function(index) {
                    return {
                        name: index.IndexName,
                        status: index.IndexStatus,
                        rcu: index.ProvisionedThroughput.ReadCapacityUnits,
                        wcu: index.ProvisionedThroughput.WriteCapacityUnits
                    };
                })
            };

            // console.log("TABLE STATUS SUMMARY\n" + JSON.stringify(res.tableStatusSummary, null, 2));

            callback(null, res);
        }
    });
}

function _itemCountForTable(tableName, callback) {
    ddb.describeTable({ TableName: tableName }, (err, data) => {
        if (err) callback(err);
        else callback(null, data.Table.ItemCount);
    });
}
