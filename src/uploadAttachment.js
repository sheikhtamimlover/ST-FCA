"use strict";

const log = require("npmlog");
const path = require("path");
const mime = require("mime");
const { parseAndCheckLogin, isReadableStream, getType } = require("../utils");

const UPLOAD_URL = "https://www.facebook.com/ajax/mercury/upload.php";

function _filenameFromStream(stream, fallback) {
    try {
        if (stream && typeof stream.path === "string" && stream.path.length) {
            return path.basename(stream.path);
        }
        if (stream && stream.path && typeof stream.path.toString === "function") {
            return path.basename(stream.path.toString());
        }
    } catch (_) { }
    return fallback || "upload.bin";
}

function _contentTypeFor(filename, stream) {
    try {
        if (stream && typeof stream._contentType === "string" && stream._contentType.length) {
            return stream._contentType;
        }
        if (stream && stream.headers && typeof stream.headers["content-type"] === "string") {
            return stream.headers["content-type"];
        }
    } catch (_) { }
    const t = mime.getType(filename);
    return t || "application/octet-stream";
}

module.exports = function (defaultFuncs, api, ctx) {
    function uploadOne(stream) {
        if (!isReadableStream(stream)) {
            return Promise.reject({
                error: "Attachment should be a readable stream and not " + getType(stream) + "."
            });
        }

        const filename = _filenameFromStream(stream);
        const contentType = _contentTypeFor(filename, stream);

        const form = {
            farr: {
                value: stream,
                options: {
                    filename: filename,
                    contentType: contentType
                }
            }
        };

        return defaultFuncs
            .postFormData(UPLOAD_URL, ctx.jar, form, {})
            .then(parseAndCheckLogin(ctx, defaultFuncs))
            .then(function (resData) {
                if (resData.error) throw resData;
                if (!resData.payload || !resData.payload.metadata) {
                    throw { error: "Mercury upload returned no metadata", res: resData };
                }
                const md = resData.payload.metadata[0] || resData.payload.metadata["0"];
                if (!md) {
                    throw { error: "Mercury upload metadata[0] missing", res: resData };
                }
                return md;
            });
    }

    function upload(attachments, callback) {
        callback = callback || function () { };
        Promise.all(attachments.map(uploadOne))
            .then(function (resData) { callback(null, resData); })
            .catch(function (err) {
                log.error("uploadAttachment", err);
                return callback(err);
            });
    }

    return function uploadAttachment(attachments, callback) {
        if (
            !attachments &&
            !isReadableStream(attachments) &&
            !getType(attachments) === "Array" &&
            getType(attachments) === "Array" && !attachments.length
        ) {
            throw { error: "Please pass an attachment or an array of attachments." };
        }

        let resolveFunc = function () { };
        let rejectFunc = function () { };
        const returnPromise = new Promise(function (resolve, reject) {
            resolveFunc = resolve;
            rejectFunc = reject;
        });

        if (!callback) {
            callback = function (err, info) {
                if (err) return rejectFunc(err);
                resolveFunc(info);
            };
        }

        if (getType(attachments) !== "Array") attachments = [attachments];

        upload(attachments, (err, info) => {
            if (err) return callback(err);
            callback(null, info);
        });

        return returnPromise;
    };
};
