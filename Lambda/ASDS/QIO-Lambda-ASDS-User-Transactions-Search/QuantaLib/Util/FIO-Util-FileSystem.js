// FIO-Util-FileSystem

'use strict';
const fs = require('fs');

module.exports = {

    recursiveReadDir: path => _readDir(path, true),
    readDir: path => _readDir(path, false)

};

function _readDir(path, recurisve) {

    fs.readdir(path, (err, files) => {
        if (err) {
            console.log(err);
            return;
        }
        else {
            files.forEach(file => {
                let newPath = path + '/' + file;
                console.log(newPath);
                if (recurisve)
                    if (fs.existsSync(newPath) && fs.lstatSync(newPath).isDirectory())
                        return _readDir(newPath, recurisve);
                    else
                        return;
            });
        }
    });
}
