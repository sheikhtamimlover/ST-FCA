/**
 * ===========================================================
 * 💫 META THEME GENERATOR MODULE 💫
 * ===========================================================
 * 🧑‍💻 Author: Sheikh Tamim (ST | Sheikh Tamim)
 * 🔰 Owner & Developer
 * 🌐 GitHub: https://github.com/sheikhtamimlover
 * 📸 Instagram: https://instagram.com/sheikh.tamim_lover
 * 🧠 Description:
 *   This module generates beautiful Messenger AI themes 
 *   using Meta's hidden GraphQL endpoints. It allows you to 
 *   create unique chat themes based on your custom prompt 
 *   or optional image inspiration.
 * -----------------------------------------------------------
 * ⚙️ Features:
 *   • Generate AI-based Messenger chat themes.
 *   • Custom prompt & optional image URL input.
 *   • Returns structured theme data with full color mapping.
 * -----------------------------------------------------------
 * 🕊️ Respect the creator & give proper credits if reused.
 * ===========================================================
 */

"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
      /** Developed by Sheikh Tamim | GitHub: sheikhtamimlover | Instagram: @sheikh.tamim_lover */
    return function suggestFriend(count, cursor, callback) {
        var resolveFunc = function () { };
        var rejectFunc = function () { };
        var returnPromise = new Promise(function (resolve, reject) {
            resolveFunc = resolve;
            rejectFunc = reject;
        });

        if (!callback) {
            callback = function (err, data) {
                if (err) return rejectFunc(err);
                resolveFunc(data);
            };
        }

        if (typeof count === 'function') {
            callback = count;
            count = 30;
            cursor = null;
        }

        if (typeof cursor === 'function') {
            callback = cursor;
            cursor = null;
        }

        count = count || 30;

        var form = {
            av: ctx.userID,
            __aaid: 0,
            __user: ctx.userID,
            __a: 1,
            __req: utils.getSignatureID(),
            __hs: "20405.HYP:comet_pkg.2.1...0",
            dpr: 1,
            __ccg: "EXCELLENT",
            __rev: "1029835515",
            __s: utils.getSignatureID(),
            __hsi: Date.now(),
            __comet_req: 15,
            fb_dtsg: ctx.fb_dtsg,
            jazoest: ctx.ttstamp,
            lsd: ctx.fb_dtsg,
            __spin_r: "1029835515",
            __spin_b: "trunk",
            __spin_t: Date.now(),
            __crn: "comet.fbweb.CometPYMKSuggestionsRoute",
            fb_api_caller_class: "RelayModern",
            fb_api_req_friendly_name: "FriendingCometPYMKPanelPaginationQuery",
            server_timestamps: true,
            variables: JSON.stringify({
                count: count,
                cursor: cursor,
                location: "FRIENDS_HOME_MAIN",
                scale: 3
            }),
            doc_id: "9917809191634193"
        };

        defaultFuncs
            .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
            .then(function (resData) {
                if (resData.error) {
                    throw resData;
                }

                if (resData.data && resData.data.viewer && resData.data.viewer.people_you_may_know) {
                    var pymkData = resData.data.viewer.people_you_may_know;
                    var suggestions = pymkData.edges.map(function (edge) {
                        var node = edge.node;
                        return {
                            id: node.id,
                            name: node.name,
                            url: node.url,
                            friendshipStatus: node.friendship_status,
                            profilePicture: node.profile_picture ? node.profile_picture.uri : null,
                            mutualFriends: node.social_context ? node.social_context.text : "",
                            topMutualFriends: node.social_context_top_mutual_friends || []
                        };
                    });

                    var result = {
                        suggestions: suggestions,
                        hasNextPage: pymkData.page_info.has_next_page,
                        endCursor: pymkData.page_info.end_cursor
                    };

                    return callback(null, result);
                } else {
                    return callback({ error: "Invalid response format" });
                }
            })
            .catch(function (err) {
                log.error("suggestFriend", err);
                return callback(err);
            });

        return returnPromise;
    };
};
/** Developed by Sheikh Tamim | GitHub: sheikhtamimlover | Please give credits if reused. */