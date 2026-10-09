// LineNotification.gs - LINE 推播通知系統（完整版）

// ==================== 常數設定 ====================
const LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_MESSAGING_API_URL = "https://api.line.me/v2/bot/message/push";

/**
 * 發送 LINE 推播訊息
 * @param {string} userId - LINE User ID
 * @param {Object} flexMessage - Flex Message 物件
 */
function sendLineNotification_(userId, flexMessage) {
  // 管理員建立、沒有 LINE 的員工（ID 以 M 開頭）收不到 LINE 通知，直接略過
  if (typeof isLineUserId_ === 'function' && !isLineUserId_(userId)) {
    return { ok: false, error: 'NOT_A_LINE_USER' };
  }
  const payload = {
    to: userId,
    messages: [flexMessage]
  };
  
  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(LINE_MESSAGING_API_URL, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      Logger.log(` LINE 通知已發送給 ${userId}`);
      return { ok: true };
    } else {
      Logger.log(` LINE 通知發送失敗: ${result.message}`);
      return { ok: false, error: result.message };
    }
  } catch (err) {
    Logger.log(` LINE API 錯誤: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ==================== Flex Message 模板 ====================

/**
 *  忘記打卡提醒
 */
function createForgotPunchNotification(employeeName, date, punchType) {
  return {
    type: "flex",
    altText: ` ${employeeName}，您忘記${punchType}打卡了！`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 忘記打卡提醒",
            weight: "bold",
            size: "xl",
            color: "#FF6B6B",
            align: "center"
          }
        ],
        backgroundColor: "#FFF5F5",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "日期",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: date,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "狀態",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `忘記${punchType}打卡`,
                    wrap: true,
                    color: "#FF6B6B",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              }
            ]
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "text",
            text: "請盡快進行補打卡，避免影響出勤記錄！",
            size: "sm",
            color: "#666666",
            margin: "lg",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "uri",
              label: "立即補打卡",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            },
            color: "#4CAF50"
          },
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "查看打卡記錄",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            }
          }
        ],
        flex: 0
      }
    }
  };
}

/**
 *  補打卡審核通知（核准）
 */
function createPunchApprovedNotification(employeeName, date, time, punchType, reviewer) {
  return {
    type: "flex",
    altText: ` 您的補打卡申請已核准`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 審核通過",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            align: "center"
          }
        ],
        backgroundColor: "#4CAF50",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: "您的補打卡申請已通過審核",
            size: "sm",
            color: "#666666",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "日期",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: date,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "時間",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: time,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "類型",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `${punchType}打卡`,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "審核人",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reviewer,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "uri",
              label: "查看詳情",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            },
            color: "#4CAF50"
          }
        ],
        flex: 0
      }
    }
  };
}

/**
 *  補打卡審核通知（拒絕）
 */
function createPunchRejectedNotification(employeeName, date, time, punchType, reviewer, reason) {
  return {
    type: "flex",
    altText: ` 您的補打卡申請已被拒絕`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 審核未通過",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            align: "center"
          }
        ],
        backgroundColor: "#FF6B6B",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: "您的補打卡申請已被拒絕",
            size: "sm",
            color: "#666666",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "日期",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: date,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "時間",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: time,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "審核人",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reviewer,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              },
              {
                type: "separator",
                margin: "md"
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: "拒絕原因",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reason || "未提供",
                    wrap: true,
                    color: "#FF6B6B",
                    size: "sm",
                    flex: 5
                  }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "查看詳情",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            }
          }
        ],
        flex: 0
      }
    }
  };
}

/**
 *  請假審核通知（核准）
 */
function createLeaveApprovedNotification(employeeName, leaveType, startDate, endDate, days, reviewer) {
  return {
    type: "flex",
    altText: ` 您的${leaveType}申請已核准`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 請假核准通知",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            align: "center"
          }
        ],
        backgroundColor: "#2196F3",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: "您的請假申請已通過審核",
            size: "sm",
            color: "#666666",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "假別",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: leaveType,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "期間",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `${startDate} ~ ${endDate}`,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "天數",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `${days} 天`,
                    wrap: true,
                    color: "#2196F3",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "審核人",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reviewer,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              }
            ]
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "text",
            text: " 祝您有個愉快的假期！",
            size: "sm",
            color: "#2196F3",
            margin: "lg",
            align: "center",
            weight: "bold"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "uri",
              label: "查看假期餘額",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            },
            color: "#2196F3"
          }
        ],
        flex: 0
      }
    }
  };
}

/**
 *  請假審核通知（拒絕）
 */
function createLeaveRejectedNotification(employeeName, leaveType, startDate, endDate, days, reviewer, reason) {
  return {
    type: "flex",
    altText: ` 您的${leaveType}申請已被拒絕`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 請假未核准",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            align: "center"
          }
        ],
        backgroundColor: "#FF9800",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: "您的請假申請未通過審核",
            size: "sm",
            color: "#666666",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "假別",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: leaveType,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "期間",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `${startDate} ~ ${endDate}`,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "審核人",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reviewer,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              },
              {
                type: "separator",
                margin: "md"
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: "拒絕原因",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reason || "未提供",
                    wrap: true,
                    color: "#FF9800",
                    size: "sm",
                    flex: 5
                  }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "重新申請",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            }
          }
        ],
        flex: 0
      }
    }
  };
}

/**
 *  加班審核通知（核准）
 */
function createOvertimeApprovedNotification(employeeName, date, hours, reviewer) {
  return {
    type: "flex",
    altText: ` 您的加班申請已核准`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 加班核准通知",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            align: "center"
          }
        ],
        backgroundColor: "#FF9800",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: "您的加班申請已通過審核",
            size: "sm",
            color: "#666666",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "日期",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: date,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "時數",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `${hours} 小時`,
                    wrap: true,
                    color: "#FF9800",
                    size: "sm",
                    flex: 5,
                    weight: "bold"
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "審核人",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reviewer,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              }
            ]
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "text",
            text: " 辛苦了！",
            size: "sm",
            color: "#FF9800",
            margin: "lg",
            align: "center",
            weight: "bold"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "uri",
              label: "查看詳情",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            },
            color: "#FF9800"
          }
        ],
        flex: 0
      }
    }
  };
}

/**
 *  加班審核通知（拒絕）
 */
function createOvertimeRejectedNotification(employeeName, date, hours, reviewer, reason) {
  return {
    type: "flex",
    altText: ` 您的加班申請已被拒絕`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: " 加班未核准",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            align: "center"
          }
        ],
        backgroundColor: "#9E9E9E",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${employeeName}，您好！`,
            size: "lg",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: "您的加班申請未通過審核",
            size: "sm",
            color: "#666666",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "日期",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: date,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "時數",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: `${hours} 小時`,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "審核人",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reviewer,
                    wrap: true,
                    color: "#333333",
                    size: "sm",
                    flex: 5
                  }
                ]
              },
              {
                type: "separator",
                margin: "md"
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: "拒絕原因",
                    color: "#999999",
                    size: "sm",
                    flex: 2
                  },
                  {
                    type: "text",
                    text: reason || "未提供",
                    wrap: true,
                    color: "#9E9E9E",
                    size: "sm",
                    flex: 5
                  }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "重新申請",
              uri: "https://eric693.github.io/KING_LONG_check_manager/"
            }
          }
        ],
        flex: 0
      }
    }
  };
}

// ==================== 觸發通知函式 ====================

/**
 * 發送忘記打卡提醒
 */
function notifyForgotPunch(userId, employeeName, date, punchType) {
  const message = createForgotPunchNotification(employeeName, date, punchType);
  return sendLineNotification_(userId, message);
}

/**
 * 發送補打卡審核結果通知
 */
function notifyPunchReview(userId, employeeName, date, time, punchType, reviewer, isApproved, reason = "") {
  const message = isApproved 
    ? createPunchApprovedNotification(employeeName, date, time, punchType, reviewer)
    : createPunchRejectedNotification(employeeName, date, time, punchType, reviewer, reason);
  
  return sendLineNotification_(userId, message);
}

/**
 * 發送請假審核結果通知
 */
function notifyLeaveReview(userId, employeeName, leaveType, startDate, endDate, days, reviewer, isApproved, reason = "") {
  const message = isApproved
    ? createLeaveApprovedNotification(employeeName, leaveType, startDate, endDate, days, reviewer)
    : createLeaveRejectedNotification(employeeName, leaveType, startDate, endDate, days, reviewer, reason);
  
  return sendLineNotification_(userId, message);
}

/**
 * 發送加班審核結果通知
 */
function notifyOvertimeReview(userId, employeeName, date, hours, reviewer, isApproved, reason = "") {
  const message = isApproved
    ? createOvertimeApprovedNotification(employeeName, date, hours, reviewer)
    : createOvertimeRejectedNotification(employeeName, date, hours, reviewer, reason);
  
  return sendLineNotification_(userId, message);
}

// ==================== 定時檢查忘記打卡 ====================

/**
 * 檢查是否為平日（週一到週五）
 * @param {Date} date - 要檢查的日期
 * @returns {boolean} - true 表示是平日，false 表示是週末
 */
function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5; // 1=週一, 5=週五
}

// ==================== 測試函式 ====================

// ==================== 通知管理員：新申請 ====================

/**
 * 取得所有啟用中的管理員 LINE ID
 */
function getAdminUserIds_() {
  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES);
    if (!sheet) return [];

    const values = sheet.getDataRange().getValues();
    const adminIds = [];

    for (let i = 1; i < values.length; i++) {
      const userId = values[i][0];   // A欄: userId
      const dept   = values[i][5];   // F欄: 部門/角色
      const status = values[i][7];   // H欄: 狀態

      if (dept === '管理員' && status === '啟用' && userId) {
        adminIds.push(String(userId).trim());
      }
    }

    Logger.log(' 管理員清單: ' + JSON.stringify(adminIds));
    return adminIds;
  } catch (err) {
    Logger.log(' getAdminUserIds_ 錯誤: ' + err.message);
    return [];
  }
}

/**
 * 發送訊息給所有管理員
 */
function notifyAllAdmins_(message) {
  const adminIds = getAdminUserIds_();
  if (adminIds.length === 0) {
    Logger.log(' 找不到任何管理員，略過通知');
    return;
  }
  adminIds.forEach(adminId => {
    try {
      sendLineNotification_(adminId, message);
      Logger.log(' 已通知管理員: ' + adminId);
    } catch (err) {
      Logger.log(' 通知管理員失敗 (' + adminId + '): ' + err.message);
    }
  });
}

/**
 *  請假新申請通知（給管理員）
 */
function createNewLeaveRequestNotification_(employeeName, leaveType, startDateTime, endDateTime, workHours, reason) {
  return {
    type: "flex",
    altText: ` ${employeeName} 提出請假申請，請前往審核`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "text",
          text: " 新請假申請待審核",
          weight: "bold",
          size: "xl",
          color: "#FFFFFF",
          align: "center"
        }],
        backgroundColor: "#2196F3",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "有新的請假申請等待您審核", size: "sm", color: "#666666", margin: "md" },
          { type: "separator", margin: "lg" },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "申請人", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: employeeName, wrap: true, color: "#333333", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "假別", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: leaveType, wrap: true, color: "#2196F3", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "開始", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: String(startDateTime), wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "結束", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: String(endDateTime), wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "時數", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: workHours + " 小時", wrap: true, color: "#2196F3", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "原因", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: reason || "未填寫", wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]}
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          height: "sm",
          action: { type: "uri", label: "前往審核", uri: "https://eric693.github.io/KING_LONG_check_manager/" },
          color: "#2196F3"
        }]
      }
    }
  };
}

/**
 *  加班新申請通知（給管理員）
 */
function createNewOvertimeRequestNotification_(employeeName, overtimeDate, startTime, endTime, hours, reason) {
  return {
    type: "flex",
    altText: ` ${employeeName} 提出加班申請，請前往審核`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "text",
          text: " 新加班申請待審核",
          weight: "bold",
          size: "xl",
          color: "#FFFFFF",
          align: "center"
        }],
        backgroundColor: "#FF9800",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "有新的加班申請等待您審核", size: "sm", color: "#666666", margin: "md" },
          { type: "separator", margin: "lg" },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "申請人", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: employeeName, wrap: true, color: "#333333", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "日期", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: String(overtimeDate), wrap: true, color: "#333333", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "時段", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: startTime + " ~ " + endTime, wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "時數", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: hours + " 小時", wrap: true, color: "#FF9800", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "原因", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: reason || "未填寫", wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]}
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          height: "sm",
          action: { type: "uri", label: "前往審核", uri: "https://eric693.github.io/KING_LONG_check_manager/" },
          color: "#FF9800"
        }]
      }
    }
  };
}

/**
 * 對外呼叫：通知管理員有新請假申請
 */
function notifyAdminsNewLeaveRequest(employeeName, leaveType, startDateTime, endDateTime, workHours, reason) {
  const message = createNewLeaveRequestNotification_(
    employeeName, leaveType, startDateTime, endDateTime, workHours, reason
  );
  notifyAllAdmins_(message);
}

/**
 * 對外呼叫：通知管理員有新加班申請
 */
function notifyAdminsNewOvertimeRequest(employeeName, overtimeDate, startTime, endTime, hours, reason) {
  const message = createNewOvertimeRequestNotification_(
    employeeName, overtimeDate, startTime, endTime, hours, reason
  );
  notifyAllAdmins_(message);
}

/**
 * 補打卡新申請通知（給管理員）
 */
function createNewAdjustPunchRequestNotification_(employeeName, date, time, punchType, reason) {
  return {
    type: "flex",
    altText: `📋 ${employeeName} 提出補打卡申請，請前往審核`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "text",
          text: "📋 新補打卡申請待審核",
          weight: "bold",
          size: "xl",
          color: "#FFFFFF",
          align: "center"
        }],
        backgroundColor: "#9C27B0",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "有新的補打卡申請等待您審核", size: "sm", color: "#666666", margin: "md" },
          { type: "separator", margin: "lg" },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "申請人", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: employeeName, wrap: true, color: "#333333", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "日期", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: String(date), wrap: true, color: "#333333", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "時間", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: String(time), wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "類型", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: "補打" + punchType + "卡", wrap: true, color: "#9C27B0", size: "sm", flex: 5, weight: "bold" }
              ]},
              { type: "box", layout: "baseline", spacing: "sm", contents: [
                { type: "text", text: "原因", color: "#999999", size: "sm", flex: 2 },
                { type: "text", text: reason || "未填寫", wrap: true, color: "#333333", size: "sm", flex: 5 }
              ]}
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          height: "sm",
          action: { type: "uri", label: "前往審核", uri: "https://eric693.github.io/KING_LONG_check_manager/" },
          color: "#9C27B0"
        }]
      }
    }
  };
}

/**
 * 對外呼叫：通知管理員有新補打卡申請
 */
function notifyAdminsNewAdjustPunchRequest(employeeName, date, time, punchType, reason) {
  const message = createNewAdjustPunchRequestNotification_(
    employeeName, date, time, punchType, reason
  );
  notifyAllAdmins_(message);
}