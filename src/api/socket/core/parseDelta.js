"use strict";
const { formatDeltaEvent, formatMessage, _formatAttachment, formatDeltaMessage, formatDeltaReadReceipt, formatID, getType, decodeClientPayload } = require("../../../utils/format");
module.exports = function createParseDelta(deps) {
  const { markDelivery, parseAndCheckLogin } = deps;
  return function parseDelta(defaultFuncs, api, ctx, globalCallback, { delta }) {
    if (delta.class === "NewMessage") {
      const resolveAttachmentUrl = i => {
        if (!delta.attachments || i === delta.attachments.length || getType(delta.attachments) !== "Array") {
          let fmtMsg;
          try {
            fmtMsg = formatDeltaMessage(delta);
          } catch (err) {
            return;
          }
          if (fmtMsg) {
            if (ctx.globalOptions.autoMarkDelivery) {
              markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
            }
            if (!ctx.globalOptions.selfListen && fmtMsg.senderID === ctx.userID) return;
            globalCallback(null, fmtMsg);
          }
        } else {
          const attachment = delta.attachments[i];
          if (attachment.mercury.attach_type === "photo") {
            api.resolvePhotoUrl(attachment.fbid, (err, url) => {
              if (!err) attachment.mercury.metadata.url = url;
              resolveAttachmentUrl(i + 1);
            });
          } else {
            resolveAttachmentUrl(i + 1);
          }
        }
      };
      resolveAttachmentUrl(0);
    } else if (delta.class === "ClientPayload") {
      const clientPayload = decodeClientPayload(delta.payload);
      if (clientPayload && clientPayload.deltas) {
        for (const d of clientPayload.deltas) {
          if (d.deltaMessageReaction && !!ctx.globalOptions.listenEvents) {
            const messageReaction = {
              type: "message_reaction",
              threadID: (d.deltaMessageReaction.threadKey.threadFbId ? d.deltaMessageReaction.threadKey.threadFbId : d.deltaMessageReaction.threadKey.otherUserFbId).toString(),
              messageID: d.deltaMessageReaction.messageId,
              reaction: d.deltaMessageReaction.reaction,
              senderID: d.deltaMessageReaction.senderId.toString(),
              userID: d.deltaMessageReaction.userId.toString()
            };
            globalCallback(null, messageReaction);
          } else if (d.deltaRecallMessageData && !!ctx.globalOptions.listenEvents) {
            const messageUnsend = {
              type: "message_unsend",
              threadID: (d.deltaRecallMessageData.threadKey.threadFbId ? d.deltaRecallMessageData.threadKey.threadFbId : d.deltaRecallMessageData.threadKey.otherUserFbId).toString(),
              messageID: d.deltaRecallMessageData.messageID,
              senderID: d.deltaRecallMessageData.senderID.toString(),
              deletionTimestamp: d.deltaRecallMessageData.deletionTimestamp,
              timestamp: d.deltaRecallMessageData.timestamp
            };
            globalCallback(null, messageUnsend);
          } else if (d.deltaMessageReply) {
            const mdata = d.deltaMessageReply.message === undefined ? [] : d.deltaMessageReply.message.data === undefined ? [] : d.deltaMessageReply.message.data.prng === undefined ? [] : JSON.parse(d.deltaMessageReply.message.data.prng);
            const m_id = mdata.map(u => u.i);
            const m_offset = mdata.map(u => u.o);
            const m_length = mdata.map(u => u.l);
            const mentions = {};
            for (let i = 0; i < m_id.length; i++) {
              mentions[m_id[i]] = (d.deltaMessageReply.message.body || "").substring(m_offset[i], m_offset[i] + m_length[i]);
            }
            const callbackToReturn = {
              type: "message_reply",
              threadID: (d.deltaMessageReply.message.messageMetadata.threadKey.threadFbId ? d.deltaMessageReply.message.messageMetadata.threadKey.threadFbId : d.deltaMessageReply.message.messageMetadata.threadKey.otherUserFbId).toString(),
              messageID: d.deltaMessageReply.message.messageMetadata.messageId,
              senderID: d.deltaMessageReply.message.messageMetadata.actorFbId.toString(),
              attachments: (d.deltaMessageReply.message.attachments || []).map(att => {
                const mercury = JSON.parse(att.mercuryJSON);
                Object.assign(att, mercury);
                return att;
              }).map(att => {
                let x;
                try {
                  x = _formatAttachment(att);
                } catch (ex) {
                  x = att;
                  x.error = ex;
                  x.type = "unknown";
                }
                return x;
              }),
              args: (d.deltaMessageReply.message.body || "").trim().split(/\s+/),
              body: d.deltaMessageReply.message.body || "",
              isGroup: !!d.deltaMessageReply.message.messageMetadata.threadKey.threadFbId,
              mentions,
              timestamp: parseInt(d.deltaMessageReply.message.messageMetadata.timestamp),
              participantIDs: (d.deltaMessageReply.message.participants || []).map(e => e.toString())
            };
            if (d.deltaMessageReply.repliedToMessage) {
              const mdata2 = d.deltaMessageReply.repliedToMessage === undefined ? [] : d.deltaMessageReply.repliedToMessage.data === undefined ? [] : d.deltaMessageReply.repliedToMessage.data.prng === undefined ? [] : JSON.parse(d.deltaMessageReply.repliedToMessage.data.prng);
              const m_id2 = mdata2.map(u => u.i);
              const m_offset2 = mdata2.map(u => u.o);
              const m_length2 = mdata2.map(u => u.l);
              const rmentions = {};
              for (let i = 0; i < m_id2.length; i++) {
                rmentions[m_id2[i]] = (d.deltaMessageReply.repliedToMessage.body || "").substring(m_offset2[i], m_offset2[i] + m_length2[i]);
              }
              callbackToReturn.messageReply = {
                threadID: (d.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId ? d.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId : d.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.otherUserFbId).toString(),
                messageID: d.deltaMessageReply.repliedToMessage.messageMetadata.messageId,
                senderID: d.deltaMessageReply.repliedToMessage.messageMetadata.actorFbId.toString(),
                attachments: d.deltaMessageReply.repliedToMessage.attachments.map(att => {
                  let mercury;
                  try {
                    mercury = JSON.parse(att.mercuryJSON);
                    Object.assign(att, mercury);
                  } catch (ex) {
                    mercury = {};
                  }
                  return att;
                }).map(att => {
                  let x;
                  try {
                    x = _formatAttachment(att);
                  } catch (ex) {
                    x = att;
                    x.error = ex;
                    x.type = "unknown";
                  }
                  return x;
                }),
                args: (d.deltaMessageReply.repliedToMessage.body || "").trim().split(/\s+/),
                body: d.deltaMessageReply.repliedToMessage.body || "",
                isGroup: !!d.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId,
                mentions: rmentions,
                timestamp: parseInt(d.deltaMessageReply.repliedToMessage.messageMetadata.timestamp),
                participantIDs: (d.deltaMessageReply.repliedToMessage.participants || []).map(e => e.toString())
              };
            } else if (d.deltaMessageReply.replyToMessageId) {
              return defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, {
                av: ctx.globalOptions.pageID,
                queries: JSON.stringify({
                  o0: {
                    doc_id: "2848441488556444",
                    query_params: {
                      thread_and_message_id: {
                        thread_id: callbackToReturn.threadID,
                        message_id: d.deltaMessageReply.replyToMessageId.id
                      }
                    }
                  }
                })
              }).then(parseAndCheckLogin(ctx, defaultFuncs)).then(resData => {
                if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                if (resData[resData.length - 1].successful_results === 0) throw { error: "forcedFetch: there was no successful_results", res: resData };
                const fetchData = resData[0].o0.data.message;
                const mobj = {};
                for (const n in fetchData.message.ranges) {
                  mobj[fetchData.message.ranges[n].entity.id] = (fetchData.message.text || "").substr(fetchData.message.ranges[n].offset, fetchData.message.ranges[n].length);
                }
                callbackToReturn.messageReply = {
                  type: "Message",
                  threadID: callbackToReturn.threadID,
                  messageID: fetchData.message_id,
                  senderID: fetchData.message_sender.id.toString(),
                  attachments: fetchData.message.blob_attachment.map(att => _formatAttachment({ blob_attachment: att })),
                  args: (fetchData.message.text || "").trim().split(/\s+/) || [],
                  body: fetchData.message.text || "",
                  isGroup: callbackToReturn.isGroup,
                  mentions: mobj,
                  timestamp: parseInt(fetchData.timestamp_precise)
                };
              }).catch(err => {}).finally(() => {
                if (ctx.globalOptions.autoMarkDelivery) {
                  markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                }
                if (!ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID) return;
                globalCallback(null, callbackToReturn);
              });
            } else {
              callbackToReturn.delta = d;
            }
            if (ctx.globalOptions.autoMarkDelivery) {
              markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
            }
            if (!ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID) return;
            globalCallback(null, callbackToReturn);
          }
        }
        return;
      }
    }
    switch (delta.class) {
      case "ReadReceipt": {
        let fmtMsg;
        try {
          fmtMsg = formatDeltaReadReceipt(delta);
        } catch (err) {
          return;
        }
        globalCallback(null, fmtMsg);
        break;
      }
      case "AdminTextMessage": {
        switch (delta.type) {
          case "instant_game_dynamic_custom_update":
          case "accept_pending_thread":
          case "confirm_friend_request":
          case "shared_album_delete":
          case "shared_album_addition":
          case "pin_messages_v2":
          case "unpin_messages_v2":
          case "change_thread_theme":
          case "change_thread_nickname":
          case "change_thread_icon":
          case "change_thread_quick_reaction":
          case "change_thread_admins":
          case "group_poll":
          case "joinable_group_link_mode_change":
          case "magic_words":
          case "change_thread_approval_mode":
          case "messenger_call_log":
          case "participant_joined_group_call":
          case "rtc_call_log":
          case "update_vote": {
            let fmtMsg;
            try {
              fmtMsg = formatDeltaEvent(delta);
            } catch (err) {
              return;
            }
            globalCallback(null, fmtMsg);
            break;
          }
        }
        break;
      }
      case "ForcedFetch": {
        if (!delta.threadKey) return;
        const mid = delta.messageId;
        const tid = delta.threadKey.threadFbId;
        if (mid && tid) {
          const form = {
            av: ctx.globalOptions.pageID,
            queries: JSON.stringify({
              o0: {
                doc_id: "2848441488556444",
                query_params: {
                  thread_and_message_id: {
                    thread_id: tid.toString(),
                    message_id: mid
                  }
                }
              }
            })
          };
          defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form).then(parseAndCheckLogin(ctx, defaultFuncs)).then(resData => {
            if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
            if (resData[resData.length - 1].successful_results === 0) throw { error: "forcedFetch: there was no successful_results", res: resData };
            const fetchData = resData[0].o0.data.message;
            if (getType(fetchData) === "Object") {
              switch (fetchData.__typename) {
                case "ThreadImageMessage":
                  if ((!ctx.globalOptions.selfListen && fetchData.message_sender.id.toString() === ctx.userID) || !ctx.loggedIn) {} else {
                    globalCallback(null, {
                      type: "event",
                      threadID: formatID(tid.toString()),
                      logMessageType: "log:thread-image",
                      logMessageData: {
                        image: {
                          attachmentID: fetchData.image_with_metadata && fetchData.image_with_metadata.legacy_attachment_id,
                          width: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.x,
                          height: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.y,
                          url: fetchData.image_with_metadata && fetchData.image_with_metadata.preview.uri
                        }
                      },
                      logMessageBody: fetchData.snippet,
                      timestamp: fetchData.timestamp_precise,
                      author: fetchData.message_sender.id
                    });
                  }
                  break;
                case "UserMessage": {
                  const event = {
                    type: "message",
                    senderID: formatID(fetchData.message_sender.id),
                    body: fetchData.message.text || "",
                    threadID: formatID(tid.toString()),
                    messageID: fetchData.message_id,
                    attachments: [
                      {
                        type: "share",
                        ID: fetchData.extensible_attachment.legacy_attachment_id,
                        url: fetchData.extensible_attachment.story_attachment.url,
                        title: fetchData.extensible_attachment.story_attachment.title_with_entities.text,
                        description: fetchData.extensible_attachment.story_attachment.description.text,
                        source: fetchData.extensible_attachment.story_attachment.source,
                        image: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).uri,
                        width: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).width,
                        height: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).height,
                        playable: ((fetchData.extensible_attachment.story_attachment.media || {}).is_playable || false),
                        duration: ((fetchData.extensible_attachment.story_attachment.media || {}).playable_duration_in_ms || 0),
                        subattachments: fetchData.extensible_attachment.subattachments,
                        properties: fetchData.extensible_attachment.story_attachment.properties
                      }
                    ],
                    mentions: {},
                    timestamp: parseInt(fetchData.timestamp_precise),
                    isGroup: fetchData.message_sender.id !== tid.toString()
                  };
                  globalCallback(null, event);
                  break;
                }
                default:
                  break;
              }
            } else {
              return;
            }
          }).catch(err => {});
        }
        break;
      }
      case "ThreadName":
      case "ParticipantsAddedToGroupThread":
      case "ParticipantLeftGroupThread": {
        let formattedEvent;
        try {
          formattedEvent = formatDeltaEvent(delta);
        } catch (err) {
          return;
        }
        if (!ctx.globalOptions.selfListen && formattedEvent.author.toString() === ctx.userID) return;
        if (!ctx.loggedIn) return;
        globalCallback(null, formattedEvent);
        break;
      }
      case "NewMessage": {
        const hasLiveLocation = d => {
          const attachment = d.attachments && d.attachments[0] && d.attachments[0].mercury && d.attachments[0].mercury.extensible_attachment;
          const storyAttachment = attachment && attachment.story_attachment;
          return storyAttachment && storyAttachment.style_list && storyAttachment.style_list.includes("message_live_location");
        };
        if (delta.attachments && delta.attachments.length === 1 && hasLiveLocation(delta)) {
          delta.class = "UserLocation";
          try {
            const fmtMsg = formatDeltaEvent(delta);
            globalCallback(null, fmtMsg);
          } catch (err) {}
        }
        break;
      }
    }
  };
};
