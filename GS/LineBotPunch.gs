
// LineBotPunch.gs - LINE Bot 打卡完整實作

// ========== 修改 handleLineMessage ==========
function handleLineMessage(event) {
  try {
    const userId = event.source.userId;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;
    
    Logger.log(' 收到 LINE 訊息');
    Logger.log('   userId: ' + userId);
    Logger.log('   text: ' + text);
    
    const employee = findEmployeeByLineUserId_(userId);
    
    if (!employee.ok) {
      replyMessage(replyToken, ' 您尚未註冊為系統員工\n\n請先到網頁版登入以完成註冊\n https://eric693.github.io/KING_LONG_check_manager/');
      return;
    }
    
    Logger.log(' 員工已註冊: ' + employee.name);
    
    if (text === '上班打卡' || text === '下班打卡') {
      const punchType = text === '上班打卡' ? '上班' : '下班';
      // 先檢查順序：不能打就直接說明，不要給一個點了才失敗的連結（規則見 PunchRules.gs）
      const sequence = checkPunchSequence_(userId, punchType);
      if (!sequence.ok) {
        replyMessage(replyToken, ' ' + sequence.msg);
      } else {
        sendLinePunchLink(replyToken, userId, employee.name, punchType);
      }
    }
    else if (text === '取消打卡') {
      clearPunchIntent_(userId);
      replyMessage(replyToken, ' 已取消打卡');
    }
    else if (text === '查詢' || text === '我的打卡') {
      // sendTodayPunchRecords(replyToken, userId, employee.name);
      sendQueryMenu(replyToken, userId, employee.name);
    }
    else if (text === '今日查詢') {
      sendTodayPunchRecords(replyToken, userId, employee.name);
    }
    // ⭐⭐⭐ 新增以下程式碼 ⭐⭐⭐
    else if (text === '月份查詢' || text === '查詢月份' || text === '歷史記錄') {
      sendMonthSelector(replyToken, userId, employee.name);
    }
    // ⭐ 處理月份選擇 (格式: "查詢:2024-12")
    else if (text.startsWith('查詢:')) {
      const yearMonth = text.replace('查詢:', '');
      sendMonthlyRecords(replyToken, userId, employee.name, yearMonth);
    }
    else if (text === '補打卡') {
      sendAdjustPunchGuide(replyToken);
    }
    else if (text === '說明' || text === '幫助' || text === '指令') {
      sendHelpMessage(replyToken);
    }
    else if (text === '加班申請') {
      sendOvertimeApplicationGuide(replyToken, userId, employee.name);
    }
    else if (text === '加班紀錄' || text === '我的加班') {
      sendMyOvertimeRecords(replyToken, userId, employee.name);
    }
    // ==================== ⭐ 排班查詢（新增）====================
    else if (text === '查詢排班' || text === '我的排班' || text === '排班查詢') {
      sendShiftQueryMenu(replyToken, userId, employee.name);
    }
    else if (text === '今日排班') {
      sendTodayShift(replyToken, userId, employee.name);
    }
    else if (text === '本週排班') {
      sendWeeklyShifts(replyToken, userId, employee.name);
    }
    else if (text === '本月排班') {
      sendMonthlyShifts(replyToken, userId, employee.name);
    }
    else if (text === '請假申請' || text === '我要請假' || text === '申請請假') {
      sendLeaveApplicationMenu(replyToken, userId, employee.name);
    }
    else if (text === '請假記錄' || text === '我的請假') {
      sendMyLeaveRecords(replyToken, userId, employee.name);
    }
    else if (text === '假期餘額' || text === '查詢假期') {
      sendLeaveBalance(replyToken, userId, employee.name);
    }
    else if (text === '審核請假' && employee.dept === '管理員') {
      sendPendingLeaveRequests(replyToken, userId, employee.name);
    }
    else {
      replyMessage(replyToken, ' 我不太明白您的意思\n\n請輸入：\n• 上班打卡\n• 下班打卡\n• 查詢\n• 說明');
    }
    
  } catch (error) {
    Logger.log(' handleLineMessage 錯誤: ' + error);
  }
}

/**
 *  發送月份選擇器 (Flex Message)
 * 
 * 功能:
 * - 顯示最近 6 個月的快速選擇按鈕
 * - 包含「當前月份」的特別標示
 * - 美觀的卡片式設計
 */
function sendMonthSelector(replyToken, userId, employeeName) {
  try {
    Logger.log(' 發送月份選擇器');
    Logger.log('   userId: ' + userId);
    Logger.log('   employeeName: ' + employeeName);
    
    // 生成最近 6 個月的選項
    const months = generateRecentMonths(6);
    
    // 建立月份按鈕
    const monthButtons = months.map(month => ({
      type: 'button',
      style: month.isCurrent ? 'primary' : 'link',
      height: 'sm',
      action: {
        type: 'message',
        label: month.label + (month.isCurrent ? ' (本月)' : ''),
        text: '查詢:' + month.value
      },
      color: month.isCurrent ? '#4CAF50' : '#2196F3'
    }));
    
    const message = {
      type: 'flex',
      altText: '選擇要查詢的月份',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 月份查詢',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            }
          ],
          backgroundColor: '#2196F3',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${employeeName}，請選擇要查詢的月份`,
              size: 'md',
              wrap: true,
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: monthButtons
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 點擊月份即可查看該月的打卡記錄',
              size: 'xs',
              color: '#999999',
              wrap: true,
              align: 'center'
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 月份選擇器已發送');
    
  } catch (error) {
    Logger.log(' sendMonthSelector 錯誤: ' + error);
    replyMessage(replyToken, ' 系統錯誤，請稍後再試');
  }
}

/**
 *  生成最近 N 個月的選項
 * 
 * @param {number} count - 要生成幾個月
 * @returns {Array} 月份選項陣列
 */
function generateRecentMonths(count) {
  const months = [];
  const now = new Date();
  const currentYearMonth = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM');
  
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM');
    const label = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy年MM月');
    
    months.push({
      value: yearMonth,
      label: label,
      isCurrent: yearMonth === currentYearMonth
    });
  }
  
  return months;
}

/**
 *  發送指定月份的打卡記錄
 * 
 * 功能:
 * - 顯示該月份所有的上下班打卡記錄
 * - 按日期分組顯示
 * - 包含統計資訊（總天數、總工時）
 * - 使用 Flex Message Carousel 分頁顯示（如果記錄太多）
 */
function sendMonthlyRecords(replyToken, userId, employeeName, yearMonth) {
  try {
    Logger.log(' 發送月份打卡記錄');
    Logger.log('   userId: ' + userId);
    Logger.log('   yearMonth: ' + yearMonth);
    
    // 驗證月份格式
    if (!yearMonth.match(/^\d{4}-\d{2}$/)) {
      replyMessage(replyToken, ' 月份格式錯誤\n\n請重新選擇月份');
      return;
    }
    
    // 從資料庫取得該月份的打卡記錄
    const records = getMonthlyPunchRecords(userId, yearMonth);
    
    if (records.length === 0) {
      const monthLabel = yearMonth.replace('-', '年') + '月';
      replyMessage(replyToken, ` ${monthLabel}\n\n${employeeName}，您這個月還沒有打卡記錄`);
      return;
    }
    
    // 按日期分組
    const groupedRecords = groupRecordsByDate(records);
    
    // 計算統計資訊
    const stats = calculateMonthlyStats(groupedRecords, userId, yearMonth);
    
    // 建立 Flex Message
    // 如果記錄太多（超過 10 天），使用 Carousel 分頁顯示
    if (Object.keys(groupedRecords).length > 10) {
      sendMonthlyRecordsCarousel(replyToken, employeeName, yearMonth, groupedRecords, stats);
    } else {
      sendMonthlyRecordsSingle(replyToken, employeeName, yearMonth, groupedRecords, stats);
    }
    
    Logger.log(' 月份打卡記錄已發送');
    
  } catch (error) {
    Logger.log(' sendMonthlyRecords 錯誤: ' + error);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

function getMonthlyPunchRecords(userId, yearMonth) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTENDANCE);
    const values = sheet.getDataRange().getValues();
    
    Logger.log(' 開始查詢打卡記錄');
    Logger.log('   userId: ' + userId);
    Logger.log('   yearMonth: ' + yearMonth);
    Logger.log('   總行數: ' + values.length);
    
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      const recordUserId = values[i][1];
      
      // 先檢查 userId 是否匹配
      if (recordUserId !== userId) continue;
      
      // ⭐⭐⭐ 關鍵修正：更寬容的日期處理
      let recordDate;
      const rawDate = values[i][0];
      
      // 處理各種日期格式
      if (rawDate instanceof Date) {
        recordDate = rawDate;
      } else if (typeof rawDate === 'string') {
        recordDate = new Date(rawDate);
      } else {
        Logger.log(` 第 ${i + 1} 行：無法解析日期 ${rawDate}`);
        continue;
      }
      
      // 檢查日期是否有效
      if (isNaN(recordDate.getTime())) {
        Logger.log(` 第 ${i + 1} 行：日期無效 ${rawDate}`);
        continue;
      }
      
      // ⭐⭐⭐ 修正：使用更穩定的年月比對方式
      const year = recordDate.getFullYear();
      const month = recordDate.getMonth() + 1; // 0-11 轉換為 1-12
      // const recordYearMonth = year + '-' + String(month).padStart(2, '0');
      const recordYearMonth = Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM');
      
      Logger.log(`   第 ${i + 1} 行: ${recordYearMonth} vs ${yearMonth}`);
      
      if (recordYearMonth === yearMonth) {
        records.push({
          timestamp: recordDate,
          date: Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM-dd'),
          time: Utilities.formatDate(recordDate, 'Asia/Taipei', 'HH:mm:ss'),
          type: values[i][4],      // 上班/下班
          location: values[i][6],  // 地點
          note: values[i][7] || '',
          audit: values[i][8] || ''
        });
        
        Logger.log(`    找到記錄！`);
      }
    }
    
    // 按時間排序
    records.sort((a, b) => a.timestamp - b.timestamp);
    
    Logger.log(` 共找到 ${records.length} 筆打卡記錄`);
    return records;
    
  } catch (error) {
    Logger.log(' getMonthlyPunchRecords 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    return [];
  }
}


/**
 *  按日期分組打卡記錄
 */
function groupRecordsByDate(records) {
  const grouped = {};
  
  records.forEach(record => {
    if (!grouped[record.date]) {
      grouped[record.date] = [];
    }
    grouped[record.date].push(record);
  });
  
  return grouped;
}


/**
 *  計算月份統計資訊
 */
function calculateMonthlyStats(groupedRecords, userId, yearMonth) {
  // 工時跟薪資同一套規則：扣當天排班的休息分鐘（見 ShiftTemplates.gs）
  const shiftMap = (userId && yearMonth && typeof getEmployeeShiftMapForMonth === 'function')
    ? getEmployeeShiftMapForMonth(userId, yearMonth)
    : {};

  const dates = Object.keys(groupedRecords);
  let totalWorkHours = 0;
  let completeDays = 0;
  
  dates.forEach(date => {
    // 一天可能有兩組上下班（休息前打卡）：配成工作段再算，規則見 PunchRules.gs
    const punches = groupedRecords[date]
      .filter(r => (r.type === '上班' || r.type === '下班') && (r.note !== '補打卡' || r.audit === 'v'))
      .map(r => ({ type: r.type, time: r.timestamp instanceof Date ? r.timestamp : new Date(`${date} ${r.time}`) }))
      .filter(p => !isNaN(p.time.getTime()))
      .sort((a, b) => a.time - b.time);

    try {
      const work = computeDayWorkFromPunches_(punches, shiftMap[date] || null);
      if (work.segments.length && work.unpaired === 0) completeDays++;
      totalWorkHours += work.netMinutes / 60;
    } catch (e) {
      // 忽略計算錯誤
    }
  });
  
  return {
    totalDays: dates.length,
    completeDays: completeDays,
    totalWorkHours: totalWorkHours.toFixed(1)
  };
}

/**
 *  發送單一 Bubble 的月份記錄（記錄不多時）
 */
function sendMonthlyRecordsSingle(replyToken, employeeName, yearMonth, groupedRecords, stats) {
  const monthLabel = yearMonth.replace('-', '年') + '月';
  
  // 建立每日記錄的內容
  const dailyContents = [];
  
  Object.keys(groupedRecords).sort().reverse().forEach(date => {
    const dayRecords = groupedRecords[date];
    
    // 日期標題
    const dateLabel = formatDateLabel(date);
    dailyContents.push({
      type: 'text',
      text: dateLabel,
      weight: 'bold',
      size: 'md',
      color: '#2196F3',
      margin: 'lg'
    });
    
    // 該日的打卡記錄
    dayRecords.forEach(record => {
      const isNormal = record.note !== '補打卡' || record.audit === 'v';
      const noteText = record.note === '補打卡' 
        ? (record.audit === 'v' ? '(補打卡-已核准)' : '(補打卡-待審核)')
        : '';
      
      dailyContents.push({
        type: 'box',
        layout: 'baseline',
        spacing: 'sm',
        margin: 'sm',
        contents: [
          {
            type: 'text',
            text: record.type,
            color: record.type === '上班' ? '#4CAF50' : '#FF9800',
            size: 'sm',
            flex: 2,
            weight: 'bold'
          },
          {
            type: 'text',
            text: record.time,
            size: 'sm',
            flex: 3,
            color: '#333333'
          },
          {
            type: 'text',
            text: noteText,
            size: 'xs',
            flex: 3,
            color: '#999999'
          }
        ]
      });
      
      // 地點資訊
      if (record.location) {
        dailyContents.push({
          type: 'text',
          text: ` ${record.location}`,
          size: 'xs',
          color: '#666666',
          margin: 'xs'
        });
      }
    });
    
    // 分隔線
    dailyContents.push({
      type: 'separator',
      margin: 'lg'
    });
  });
  
  // 移除最後一條分隔線
  if (dailyContents.length > 0 && dailyContents[dailyContents.length - 1].type === 'separator') {
    dailyContents.pop();
  }
  
  const message = {
    type: 'flex',
    altText: `${monthLabel}打卡記錄`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: ` ${monthLabel}`,
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF'
          },
          {
            type: 'text',
            text: employeeName,
            size: 'sm',
            color: '#FFFFFF',
            margin: 'xs'
          }
        ],
        backgroundColor: '#2196F3',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          // 統計資訊
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: ' 本月統計',
                weight: 'bold',
                size: 'md',
                color: '#333333'
              },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'sm',
                spacing: 'md',
                contents: [
                  {
                    type: 'text',
                    text: `打卡天數\n${stats.totalDays} 天`,
                    size: 'xs',
                    color: '#666666',
                    flex: 1,
                    align: 'center'
                  },
                  {
                    type: 'text',
                    text: `完整天數\n${stats.completeDays} 天`,
                    size: 'xs',
                    color: '#666666',
                    flex: 1,
                    align: 'center'
                  },
                  {
                    type: 'text',
                    text: `總工時\n${stats.totalWorkHours} 小時`,
                    size: 'xs',
                    color: '#666666',
                    flex: 1,
                    align: 'center'
                  }
                ]
              }
            ],
            backgroundColor: '#F5F5F5',
            paddingAll: '12px',
            cornerRadius: '8px'
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          // 每日記錄
          ...dailyContents
        ]
      }
    }
  };
  
  sendLineReply_(replyToken, [message]);
}

/**
 *  發送 Carousel 的月份記錄（記錄很多時）
 */
function sendMonthlyRecordsCarousel(replyToken, employeeName, yearMonth, groupedRecords, stats) {
  const monthLabel = yearMonth.replace('-', '年') + '月';
  const dates = Object.keys(groupedRecords).sort().reverse();
  
  // 每個 Bubble 最多顯示 5 天
  const bubbles = [];
  const datesPerBubble = 5;
  
  for (let i = 0; i < dates.length; i += datesPerBubble) {
    const bubbleDates = dates.slice(i, i + datesPerBubble);
    
    // 建立該 Bubble 的內容
    const dailyContents = [];
    
    bubbleDates.forEach(date => {
      const dayRecords = groupedRecords[date];
      
      // 日期標題
      const dateLabel = formatDateLabel(date);
      dailyContents.push({
        type: 'text',
        text: dateLabel,
        weight: 'bold',
        size: 'sm',
        color: '#2196F3',
        margin: 'md'
      });
      
      // 該日的打卡記錄
      dayRecords.forEach(record => {
        const noteText = record.note === '補打卡' 
          ? (record.audit === 'v' ? '(補)' : '(待審)')
          : '';
        
        dailyContents.push({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          margin: 'xs',
          contents: [
            {
              type: 'text',
              text: record.type,
              color: record.type === '上班' ? '#4CAF50' : '#FF9800',
              size: 'xs',
              flex: 2,
              weight: 'bold'
            },
            {
              type: 'text',
              text: record.time.substring(0, 5),  // 只顯示 HH:mm
              size: 'xs',
              flex: 3,
              color: '#333333'
            },
            {
              type: 'text',
              text: noteText,
              size: 'xxs',
              flex: 2,
              color: '#999999'
            }
          ]
        });
      });
      
      // 分隔線
      dailyContents.push({
        type: 'separator',
        margin: 'sm'
      });
    });
    
    // 移除最後一條分隔線
    if (dailyContents.length > 0 && dailyContents[dailyContents.length - 1].type === 'separator') {
      dailyContents.pop();
    }
    
    const pageNum = Math.floor(i / datesPerBubble) + 1;
    const totalPages = Math.ceil(dates.length / datesPerBubble);
    
    bubbles.push({
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${monthLabel} (${pageNum}/${totalPages})`,
            weight: 'bold',
            size: 'md',
            color: '#FFFFFF'
          }
        ],
        backgroundColor: '#2196F3',
        paddingAll: '12px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: dailyContents,
        paddingAll: '12px'
      }
    });
  }
  
  // 加入統計資訊 Bubble
  bubbles.unshift({
    type: 'bubble',
    size: 'micro',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: ' 本月統計',
          weight: 'bold',
          size: 'md',
          color: '#FFFFFF'
        }
      ],
      backgroundColor: '#4CAF50',
      paddingAll: '12px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: employeeName,
          size: 'sm',
          weight: 'bold',
          align: 'center'
        },
        {
          type: 'separator',
          margin: 'md'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: `打卡天數: ${stats.totalDays} 天`,
              size: 'xs',
              color: '#666666'
            },
            {
              type: 'text',
              text: `完整天數: ${stats.completeDays} 天`,
              size: 'xs',
              color: '#666666'
            },
            {
              type: 'text',
              text: `總工時: ${stats.totalWorkHours} 小時`,
              size: 'xs',
              color: '#666666'
            }
          ]
        }
      ],
      paddingAll: '12px'
    }
  });
  
  const message = {
    type: 'flex',
    altText: `${monthLabel}打卡記錄`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
  
  sendLineReply_(replyToken, [message]);
}

/**
 *  格式化日期標籤
 */
function formatDateLabel(dateStr) {
  const date = new Date(dateStr);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[date.getDay()];
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  return `${month}/${day} (${weekday})`;
}
/**
 * 產生一次性 LINE 打卡 Token（5 分鐘有效）
 */
function generateLinePunchToken_(userId, punchType) {
  const token = 'LPT' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  const data = JSON.stringify({
    userId: userId,
    punchType: punchType,
    expiry: new Date().getTime() + 5 * 60 * 1000
  });
  PropertiesService.getScriptProperties().setProperty('LPT_' + token, data);
  // 偶爾清一次沒被點開、早就過期的連結，指令碼屬性有總量上限
  if (Math.random() < 0.1 && typeof cleanupLinePunchTokens_ === 'function') cleanupLinePunchTokens_();
  Logger.log('LINE 打卡 Token 已生成: ' + token + ' (' + punchType + ')');
  return token;
}

/**
 * 發送網頁打卡連結（取代舊的 LINE 位置 Quick Reply）
 */
function sendLinePunchLink(replyToken, userId, employeeName, punchType) {
  const token = generateLinePunchToken_(userId, punchType);
  const url = 'https://eric693.github.io/KING_LONG_check_manager/?linePunchToken=' + token;
  const color = punchType === '上班' ? '#4CAF50' : '#FF9800';
  const emoji = punchType === '上班' ? '🟢' : '🟠';

  const message = {
    type: 'flex',
    altText: employeeName + '，請點擊連結進行' + punchType + '打卡',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: emoji + ' ' + punchType + '打卡',
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF',
          align: 'center'
        }],
        backgroundColor: color,
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: employeeName + '，請點擊下方按鈕打卡',
            size: 'md',
            weight: 'bold',
            align: 'center',
            margin: 'md'
          },
          {
            type: 'text',
            text: '系統將透過網頁取得您的真實 GPS 位置',
            size: 'sm',
            color: '#888888',
            align: 'center',
            margin: 'sm',
            wrap: true
          },
          {
            type: 'text',
            text: '⏳ 連結 5 分鐘內有效',
            size: 'sm',
            color: '#FF5722',
            align: 'center',
            margin: 'sm'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: color,
          action: {
            type: 'uri',
            label: '📍 點此' + punchType + '打卡',
            uri: url
          }
        }]
      }
    }
  };

  sendLineReply_(replyToken, [message]);
}

/**
 * @deprecated 已改用 sendLinePunchLink（網頁 GPS）
 */
function sendQuickReplyLocationRequest(replyToken, employeeName, punchType) {
  const message = {
    type: 'text',
    text: `${employeeName}，準備${punchType}打卡`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'location',
            label: ' 傳送位置打卡'
          }
        }
      ]
    }
  };

  sendLineReply_(replyToken, [message]);
}

/**
 * 發送打卡位置請求（含確認對話框）
 */
function sendPunchLocationRequestWithConfirm(replyToken, employeeName, punchType) {
  const message = {
    type: 'flex',
    altText: `請傳送您的位置以完成${punchType}打卡`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: ` ${punchType}打卡`,
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF'
          }
        ],
        backgroundColor: punchType === '上班' ? '#4CAF50' : '#FF9800',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${employeeName}，您好！`,
            size: 'lg',
            weight: 'bold',
            margin: 'md'
          },
          {
            type: 'text',
            text: `準備進行【${punchType}】打卡`,
            size: 'md',
            color: punchType === '上班' ? '#4CAF50' : '#FF9800',
            margin: 'md',
            weight: 'bold'
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: ' 重要提醒',
                weight: 'bold',
                size: 'md',
                color: '#FF6B6B'
              },
              {
                type: 'text',
                text: '• 請確保您在公司打卡範圍內',
                size: 'sm',
                color: '#666666',
                margin: 'md'
              },
              {
                type: 'text',
                text: '• 請允許 LINE 存取您的位置',
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: ' 如何傳送位置？',
                weight: 'bold',
                size: 'md',
                color: '#2196F3'
              },
              {
                type: 'text',
                text: '1. 點擊下方「傳送位置」按鈕',
                size: 'sm',
                color: '#666666',
                margin: 'md'
              },
              {
                type: 'text',
                text: '2. 允許 LINE 存取位置',
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              },
              {
                type: 'text',
                text: '3. 確認並傳送',
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: ' 傳送位置',
              uri: 'line://nv/location'  //  正確！會直接跳出系統對話框
            },
            color: punchType === '上班' ? '#4CAF50' : '#FF9800'
          }
        ],
        flex: 0
      }
    }
  };
  
  sendLineReply_(replyToken, [message]);
}

// ========== 新增：暫存打卡意圖 ==========
/**
 * 暫存用戶的打卡意圖
 * @param {string} userId - LINE userId
 * @param {string} punchType - 打卡類型（上班/下班）
 */
function savePunchIntent_(userId, punchType) {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'PUNCH_INTENT_' + userId;
    
    // 暫存 5 分鐘
    const intent = {
      type: punchType,
      timestamp: new Date().getTime()
    };
    
    props.setProperty(key, JSON.stringify(intent));
    Logger.log(' 已暫存打卡意圖: ' + punchType);
    
  } catch (error) {
    Logger.log(' savePunchIntent_ 錯誤: ' + error);
  }
}

/**
 * 取得用戶的打卡意圖
 * @param {string} userId - LINE userId
 * @returns {string|null} - 打卡類型或 null
 */
function getPunchIntent_(userId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'PUNCH_INTENT_' + userId;
    const intentStr = props.getProperty(key);
    
    if (!intentStr) {
      return null;
    }
    
    const intent = JSON.parse(intentStr);
    const now = new Date().getTime();
    
    // 檢查是否過期（5 分鐘 = 300000 毫秒）
    if (now - intent.timestamp > 300000) {
      props.deleteProperty(key);
      Logger.log(' 打卡意圖已過期');
      return null;
    }
    
    Logger.log(' 取得打卡意圖: ' + intent.type);
    return intent.type;
    
  } catch (error) {
    Logger.log(' getPunchIntent_ 錯誤: ' + error);
    return null;
  }
}

/**
 * 清除打卡意圖
 * @param {string} userId - LINE userId
 */
function clearPunchIntent_(userId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'PUNCH_INTENT_' + userId;
    props.deleteProperty(key);
    Logger.log(' 已清除打卡意圖');
  } catch (error) {
    Logger.log(' clearPunchIntent_ 錯誤: ' + error);
  }
}

/**
 * 檢查是否為重複打卡（1分鐘內相同類型）
 */
function isDuplicatePunch_(userId, punchType) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_ATTENDANCE);
    const values = sheet.getDataRange().getValues();
    const now = new Date().getTime();
    
    // 檢查最近 1 分鐘內的記錄
    for (let i = values.length - 1; i >= 1; i--) {
      const recordTime = new Date(values[i][0]).getTime();
      const recordUserId = values[i][1];
      const recordType = values[i][4];
      
      // 如果是同一個人、同一種類型、時間在 1 分鐘內
      if (recordUserId === userId && 
          recordType === punchType && 
          (now - recordTime) < 60000) {  // 60000ms = 1分鐘
        Logger.log(' 偵測到重複打卡，已忽略');
        return true;
      }
      
      // 只檢查最近 10 筆記錄即可
      if (values.length - i > 10) break;
    }
    
    return false;
    
  } catch (error) {
    Logger.log(' isDuplicatePunch_ 錯誤: ' + error);
    return false;
  }
}

/**
 * 檢查事件是否已處理過（防止 LINE Webhook 重複觸發）
 */
function isEventProcessed_(eventId) {
  try {
    const cache = CacheService.getScriptCache();
    const key = 'EVENT_' + eventId;
    
    // 檢查快取中是否存在
    if (cache.get(key)) {
      Logger.log(' 事件已處理過: ' + eventId);
      return true;
    }
    
    // 標記為已處理（快取 10 分鐘）
    cache.put(key, 'processed', 600);
    Logger.log(' 標記事件為已處理: ' + eventId);
    return false;
    
  } catch (error) {
    Logger.log(' isEventProcessed_ 錯誤: ' + error);
    return false;  // 發生錯誤時允許處理，避免卡住
  }
}
/**
 * 處理 LINE 位置訊息（執行打卡）
 */
function handleLineLocation(event) {
  try {
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    Logger.log(' 收到位置訊息（已改用網頁打卡，拒絕 LINE 位置）');

    const employee = findEmployeeByLineUserId_(userId);
    if (!employee.ok) {
      replyMessage(replyToken, '您尚未註冊為系統員工');
      return;
    }

    // 判斷應該打哪種卡，產生新連結
    const punchType = getPunchIntent_(userId) || determinePunchType(userId);
    clearPunchIntent_(userId);
    sendLinePunchLink(replyToken, userId, employee.name, punchType);

  } catch (error) {
    Logger.log(' handleLineLocation 錯誤: ' + error);
    replyMessage(event.replyToken, '系統錯誤，請稍後再試');
  }
}

/**
 * 判斷打卡類型（上班/下班）
 */
function determinePunchType(userId) {
  try {
    // 一天可以有兩組上下班：上一次打上班就打下班，否則打上班（見 PunchRules.gs）
    return nextPunchType_(userId);
  } catch (error) {
    Logger.log(' determinePunchType 錯誤: ' + error);
    return '上班';
  }
}

/**
 * 執行打卡
 */
function executePunch(userId, punchType, lat, lng, locationName) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_ATTENDANCE);
    const employee = findEmployeeByLineUserId_(userId);
    
    if (!employee.ok) {
      return {
        success: false,
        message: '找不到員工資料'
      };
    }
    
    const now = new Date();
    const time = Utilities.formatDate(now, 'Asia/Taipei', 'HH:mm:ss');
    
    const row = [
      now,                                      // A: 打卡時間
      userId,                                   // B: userId
      employee.dept,                            // C: 部門
      employee.name,                            // D: 打卡人員
      punchType,                                // E: 打卡類別
      `(${lat},${lng})`,                        // F: GPS
      locationName,                             // G: 地點
      'LINE Bot',                               // H: 備註
      '',                                       // I: 管理員審核
      'LINE Official Account'                   // J: 裝置資訊
    ];
    
    sheet.appendRow(row);
    
    Logger.log(' 打卡成功');
    Logger.log('   員工: ' + employee.name);
    Logger.log('   類型: ' + punchType);
    Logger.log('   地點: ' + locationName);
    
    return {
      success: true,
      time: time,
      message: '打卡成功'
    };
    
  } catch (error) {
    Logger.log(' executePunch 錯誤: ' + error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 發送打卡位置請求
 */
function sendPunchLocationRequest(replyToken, employeeName, punchType) {
  const message = {
    type: 'flex',
    altText: '請傳送您的位置以完成打卡',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: ' 請傳送位置',
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF'
          }
        ],
        backgroundColor: '#2196F3',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${employeeName}，您好！`,
            size: 'lg',
            weight: 'bold',
            margin: 'md'
          },
          {
            type: 'text',
            //  修正：明確顯示打卡類型
            text: `準備進行【${punchType}】打卡`,
            size: 'md',
            color: punchType === '上班' ? '#4CAF50' : '#FF9800',
            margin: 'md',
            weight: 'bold'
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: ' 如何傳送位置？',
                weight: 'bold',
                size: 'md',
                color: '#2196F3'
              },
              {
                type: 'text',
                text: '1. 點擊下方「＋」按鈕',
                size: 'sm',
                color: '#666666',
                margin: 'md'
              },
              {
                type: 'text',
                text: '2. 選擇「位置資訊」',
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              },
              {
                type: 'text',
                text: '3. 傳送您的目前位置',
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'text',
            text: ' 請確保您在公司打卡範圍內',
            size: 'xs',
            color: '#FF9800',
            margin: 'lg',
            wrap: true
          }
        ]
      }
    }
  };
  
  sendLineReply_(replyToken, [message]);
}

/**
 * 建立打卡成功訊息
 */
function createPunchSuccessMessage(employeeName, punchType, time, location) {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: ' 打卡成功',
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF'
        }
      ],
      backgroundColor: '#4CAF50',
      paddingAll: '20px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `${employeeName}，打卡成功！`,
          size: 'lg',
          weight: 'bold',
          margin: 'md'
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '類型',
                  color: '#999999',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: punchType,
                  wrap: true,
                  color: '#4CAF50',
                  size: 'md',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '時間',
                  color: '#999999',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: time,
                  wrap: true,
                  color: '#333333',
                  size: 'sm',
                  flex: 5,
                  weight: 'bold'
                }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '地點',
                  color: '#999999',
                  size: 'sm',
                  flex: 2
                },
                {
                  type: 'text',
                  text: location,
                  wrap: true,
                  color: '#333333',
                  size: 'sm',
                  flex: 5
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'text',
          text: punchType === '上班' ? ' 祝您今天工作順利！' : ' 辛苦了，下班愉快！',
          size: 'sm',
          color: '#4CAF50',
          margin: 'lg',
          align: 'center',
          weight: 'bold'
        }
      ]
    }
  };
}

/**
 * 建立打卡失敗訊息
 */
function createPunchFailedMessage(reason, nearestLocation) {
  const contents = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: ' 打卡失敗',
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF'
        }
      ],
      backgroundColor: '#FF6B6B',
      paddingAll: '20px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: reason,
          size: 'md',
          color: '#FF6B6B',
          weight: 'bold',
          margin: 'md',
          wrap: true
        }
      ]
    }
  };
  
  // 如果有最近的地點資訊，加入提示
  if (nearestLocation) {
    contents.body.contents.push(
      {
        type: 'separator',
        margin: 'lg'
      },
      {
        type: 'text',
        text: ' 最近的打卡地點',
        size: 'sm',
        color: '#999999',
        margin: 'lg'
      },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'sm',
        contents: [
          {
            type: 'text',
            text: nearestLocation.name,
            size: 'md',
            weight: 'bold'
          },
          {
            type: 'text',
            text: `距離：${nearestLocation.distance} 公尺`,
            size: 'sm',
            color: '#666666',
            margin: 'xs'
          }
        ]
      }
    );
  }
  
  return contents;
}

/**
 * 發送今日打卡記錄
 */
function sendTodayPunchRecords(replyToken, userId, employeeName) {
  try {
    const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTENDANCE);
    const values = sheet.getDataRange().getValues();
    
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      const recordDate = Utilities.formatDate(new Date(values[i][0]), 'Asia/Taipei', 'yyyy-MM-dd');
      const recordUserId = values[i][1];
      
      if (recordUserId === userId && recordDate === today) {
        records.push({
          time: Utilities.formatDate(new Date(values[i][0]), 'Asia/Taipei', 'HH:mm:ss'),
          type: values[i][4],
          location: values[i][6]
        });
      }
    }
    
    if (records.length === 0) {
      replyMessage(replyToken, `${employeeName}，您今天還沒有打卡記錄\n\n請傳送「打卡」開始打卡`);
      return;
    }
    
    // 建立記錄訊息
    const recordContents = records.map(r => ({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: r.type,
              color: r.type === '上班' ? '#4CAF50' : '#FF9800',
              size: 'md',
              flex: 2,
              weight: 'bold'
            },
            {
              type: 'text',
              text: r.time,
              wrap: true,
              color: '#333333',
              size: 'sm',
              flex: 5
            }
          ]
        },
        {
          type: 'text',
          text: ` ${r.location}`,
          size: 'xs',
          color: '#666666',
          margin: 'xs'
        }
      ]
    }));
    
    const message = {
      type: 'flex',
      altText: '今日打卡記錄',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 今日打卡記錄',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            }
          ],
          backgroundColor: '#2196F3',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${employeeName}`,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: today,
              size: 'sm',
              color: '#666666',
              margin: 'xs'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            ...recordContents
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    
  } catch (error) {
    Logger.log(' sendTodayPunchRecords 錯誤: ' + error);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

/**
 * 發送補打卡指引
 */
function sendAdjustPunchGuide(replyToken) {
  const message = {
    type: 'flex',
    altText: '補打卡指引',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: ' 補打卡指引',
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF'
          }
        ],
        backgroundColor: '#FF9800',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '補打卡功能目前需要到網頁版操作',
            size: 'md',
            wrap: true,
            margin: 'md'
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'text',
            text: '請按照以下步驟：',
            size: 'sm',
            color: '#666666',
            margin: 'lg'
          },
          {
            type: 'text',
            text: '1. 開啟打卡系統網頁',
            size: 'sm',
            margin: 'md'
          },
          {
            type: 'text',
            text: '2. 登入帳號',
            size: 'sm',
            margin: 'sm'
          },
          {
            type: 'text',
            text: '3. 點選「補打卡」功能',
            size: 'sm',
            margin: 'sm'
          },
          {
            type: 'text',
            text: '4. 填寫補打卡資訊並提交',
            size: 'sm',
            margin: 'sm'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: '開啟網頁版',
              uri: 'https://eric693.github.io/KING_LONG_check_manager/'
            },
            color: '#FF9800'
          }
        ],
        flex: 0
      }
    }
  };
  
  sendLineReply_(replyToken, [message]);
}

/**
 * 發送幫助訊息（已更新：加入請假指令）
 */
function sendHelpMessage(replyToken) {
  const message = {
    type: 'flex',
    altText: '使用指令說明',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: ' 使用指令',
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF'
          }
        ],
        backgroundColor: '#673AB7',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '可用指令列表',
            size: 'lg',
            weight: 'bold',
            margin: 'md'
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'md',
            contents: [
              // ========== 打卡相關 ==========
              {
                type: 'text',
                text: '打卡功能',
                weight: 'bold',
                size: 'sm',
                color: '#673AB7',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「上班打卡」',
                        size: 'md',
                        weight: 'bold',
                        color: '#4CAF50'
                      },
                      {
                        type: 'text',
                        text: '→ 開始上班打卡流程',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「下班打卡」',
                        size: 'md',
                        weight: 'bold',
                        color: '#FF9800'
                      },
                      {
                        type: 'text',
                        text: '→ 開始下班打卡流程',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「補打卡」',
                        size: 'md',
                        weight: 'bold',
                        color: '#FF9800'
                      },
                      {
                        type: 'text',
                        text: '→ 補打卡說明（需到網頁版）',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  }
                ]
              },

              {
                type: 'separator',
                margin: 'md'
              },

              // ========== 查詢相關 ==========
              {
                type: 'text',
                text: '查詢功能',
                weight: 'bold',
                size: 'sm',
                color: '#673AB7',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「查詢」或「我的打卡」',
                        size: 'md',
                        weight: 'bold',
                        color: '#2196F3'
                      },
                      {
                        type: 'text',
                        text: '→ 進入查詢選單（今日/月份）',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「月份查詢」',
                        size: 'md',
                        weight: 'bold',
                        color: '#2196F3'
                      },
                      {
                        type: 'text',
                        text: '→ 查看指定月份打卡記錄',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「查詢排班」或「我的排班」',
                        size: 'md',
                        weight: 'bold',
                        color: '#9C27B0'
                      },
                      {
                        type: 'text',
                        text: '→ 查看今日/本週/本月排班',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  }
                ]
              },

              {
                type: 'separator',
                margin: 'md'
              },

              // ========== 加班相關 ==========
              {
                type: 'text',
                text: '加班功能',
                weight: 'bold',
                size: 'sm',
                color: '#673AB7',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「加班申請」',
                        size: 'md',
                        weight: 'bold',
                        color: '#FF9800'
                      },
                      {
                        type: 'text',
                        text: '→ 查看加班申請流程與說明',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「加班紀錄」或「我的加班」',
                        size: 'md',
                        weight: 'bold',
                        color: '#FF9800'
                      },
                      {
                        type: 'text',
                        text: '→ 查看加班申請狀態與統計',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  }
                ]
              },

              {
                type: 'separator',
                margin: 'md'
              },

              // ========== 請假相關 ==========
              {
                type: 'text',
                text: '請假功能',
                weight: 'bold',
                size: 'sm',
                color: '#673AB7',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「請假申請」或「我要請假」',
                        size: 'md',
                        weight: 'bold',
                        color: '#E91E63'
                      },
                      {
                        type: 'text',
                        text: '→ 查看請假申請流程與說明',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「請假記錄」或「我的請假」',
                        size: 'md',
                        weight: 'bold',
                        color: '#E91E63'
                      },
                      {
                        type: 'text',
                        text: '→ 查看請假申請狀態與統計',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「假期餘額」或「查詢假期」',
                        size: 'md',
                        weight: 'bold',
                        color: '#E91E63'
                      },
                      {
                        type: 'text',
                        text: '→ 查看各類假期剩餘時數',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: '「審核請假」（僅管理員）',
                        size: 'md',
                        weight: 'bold',
                        color: '#9C27B0'
                      },
                      {
                        type: 'text',
                        text: '→ 查看並審核待審請假申請',
                        size: 'xs',
                        color: '#666666',
                        margin: 'xs'
                      }
                    ]
                  }
                ]
              },

              {
                type: 'separator',
                margin: 'md'
              },

              // ========== 其他 ==========
              {
                type: 'box',
                layout: 'vertical',
                margin: 'md',
                contents: [
                  {
                    type: 'text',
                    text: '「說明」或「幫助」或「指令」',
                    size: 'md',
                    weight: 'bold',
                    color: '#673AB7'
                  },
                  {
                    type: 'text',
                    text: '→ 顯示本說明',
                    size: 'xs',
                    color: '#666666',
                    margin: 'xs'
                  }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
              type: 'uri',
              label: '開啟網頁版',
              uri: 'https://eric693.github.io/KING_LONG_check_manager/'
            }
          }
        ],
        flex: 0
      }
    }
  };

  sendLineReply_(replyToken, [message]);
}

function sendQueryMenu(replyToken, userId, employeeName) {
  const message = {
    type: 'text',
    text: `${employeeName}，請選擇查詢方式：`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: ' 今日查詢', text: '今日查詢' }
        },
        {
          type: 'action',
          action: { type: 'message', label: ' 月份查詢', text: '月份查詢' }
        }
      ]
    }
  };
  sendLineReply_(replyToken, [message]);
}

/**
 * 發送 LINE 回覆
 */
function sendLineReply_(replyToken, messages) {
  try {
    const url = 'https://api.line.me/v2/bot/message/reply';
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    const payload = {
      replyToken: replyToken,
      messages: messages
    };
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      Logger.log(' LINE 回覆已發送');
    } else {
      Logger.log(' LINE 回覆失敗: ' + result.message);
    }
    
  } catch (error) {
    Logger.log(' sendLineReply_ 錯誤: ' + error);
  }
}

/**
 * 發送簡單文字回覆
 */
function replyMessage(replyToken, text) {
  const message = {
    type: 'text',
    text: text
  };
  
  sendLineReply_(replyToken, [message]);
}

// ==================== 圖文選單管理 ====================

/**
 *  建立打卡圖文選單
 * 
 * 執行步驟：
 * 1. 在 Apps Script 中執行此函數
 * 2. 複製 Logger 中的 richMenuId
 * 3. 執行 uploadRichMenuImage(richMenuId)
 * 4. 執行 setDefaultRichMenu(richMenuId)
 */
function createPunchRichMenu() {
  try {
    Logger.log(' 開始建立圖文選單');
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    // 定義圖文選單結構
    const richMenu = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: true,
      name: "打卡選單",
      chatBarText: "快速打卡",
      areas: [
        // 左上：上班打卡
        {
          bounds: {
            x: 0,
            y: 0,
            width: 1250,
            height: 843
          },
          action: {
            type: "message",
            text: "上班打卡"
          }
        },
        // 右上：下班打卡
        {
          bounds: {
            x: 1250,
            y: 0,
            width: 1250,
            height: 843
          },
          action: {
            type: "message",
            text: "下班打卡"
          }
        },
        // 左下：查詢打卡
        {
          bounds: {
            x: 0,
            y: 843,
            width: 1250,
            height: 843
          },
          action: {
            type: "message",
            text: "查詢"
          }
        },
        // 右下：使用說明
        {
          bounds: {
            x: 1250,
            y: 843,
            width: 1250,
            height: 843
          },
          action: {
            type: "message",
            text: "說明"
          }
        }
      ]
    };
    
    // 建立圖文選單
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      payload: JSON.stringify(richMenu),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 圖文選單建立成功！');
      Logger.log(' Rich Menu ID: ' + result.richMenuId);
      Logger.log('');
      Logger.log(' 請複製上方的 richMenuId，然後執行以下步驟：');
      Logger.log('');
      Logger.log('步驟 1: 上傳圖片');
      Logger.log('   執行: uploadRichMenuImage("' + result.richMenuId + '")');
      Logger.log('');
      Logger.log('步驟 2: 設為預設選單');
      Logger.log('   執行: setDefaultRichMenu("' + result.richMenuId + '")');
      
      // 儲存到 Script Properties 方便後續使用
      PropertiesService.getScriptProperties().setProperty('RICH_MENU_ID', result.richMenuId);
      
      return result.richMenuId;
    } else {
      Logger.log(' 建立失敗');
      Logger.log('錯誤訊息: ' + result.message);
      return null;
    }
    
  } catch (error) {
    Logger.log(' createPunchRichMenu 錯誤: ' + error);
    return null;
  }
}

/**
 *  上傳圖文選單圖片
 * 
 * @param {string} richMenuId - 圖文選單 ID
 * 
 * 注意：您需要先準備一張 2500x1686 的圖片
 * 圖片規格：
 * - 尺寸：2500x1686 像素
 * - 格式：JPEG 或 PNG
 * - 大小：不超過 1MB
 * 
 * 使用方式：
 * 1. 將圖片上傳到 Google Drive
 * 2. 取得圖片的 File ID
 * 3. 修改下方的 imageFileId
 */
function uploadRichMenuImage(richMenuId) {
  try {
    Logger.log(' 開始上傳圖文選單圖片');
    
    if (!richMenuId) {
      // 嘗試從 Properties 取得
      richMenuId = PropertiesService.getScriptProperties().getProperty('RICH_MENU_ID');
      
      if (!richMenuId) {
        Logger.log(' 請提供 richMenuId');
        Logger.log('   使用方式: uploadRichMenuImage("your-rich-menu-id")');
        return;
      }
    }
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    //  請替換成您的圖片 File ID
    // 如何取得：在 Google Drive 中右鍵點擊圖片 → 取得連結 → 複製 ID
    const imageFileId = '1a2b3c4d5e6f7g8h9i0j';
    
    if (imageFileId === '1a2b3c4d5e6f7g8h9i0j') {
      Logger.log(' 請先設定圖片 File ID');
      Logger.log('');
      Logger.log(' 如何設定：');
      Logger.log('1. 準備一張 2500x1686 的圖片（JPEG 或 PNG）');
      Logger.log('2. 上傳到 Google Drive');
      Logger.log('3. 右鍵點擊圖片 → 取得連結');
      Logger.log('4. 複製連結中的 File ID');
      Logger.log('5. 修改 uploadRichMenuImage 函數中的 imageFileId');
      Logger.log('');
      Logger.log(' 也可以使用 createDefaultRichMenuImage() 生成預設圖片');
      return;
    }
    
    // 從 Google Drive 取得圖片
    const file = DriveApp.getFileById(imageFileId);
    const blob = file.getBlob();
    
    // 上傳圖片
    const url = `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`;
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': blob.getContentType(),
        'Authorization': `Bearer ${channelAccessToken}`
      },
      payload: blob,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 圖片上傳成功！');
      Logger.log('');
      Logger.log(' 下一步：');
      Logger.log('   執行: setDefaultRichMenu("' + richMenuId + '")');
    } else {
      Logger.log(' 上傳失敗');
      Logger.log('狀態碼: ' + response.getResponseCode());
      Logger.log('回應: ' + response.getContentText());
    }
    
  } catch (error) {
    Logger.log(' uploadRichMenuImage 錯誤: ' + error);
  }
}

/**
 *  設定預設圖文選單
 * 
 * @param {string} richMenuId - 圖文選單 ID
 */
function setDefaultRichMenu(richMenuId) {
  try {
    Logger.log(' 設定預設圖文選單');
    
    if (!richMenuId) {
      // 嘗試從 Properties 取得
      richMenuId = PropertiesService.getScriptProperties().getProperty('RICH_MENU_ID');
      
      if (!richMenuId) {
        Logger.log(' 請提供 richMenuId');
        Logger.log('   使用方式: setDefaultRichMenu("your-rich-menu-id")');
        return;
      }
    }
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    const url = `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`;
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 預設圖文選單設定成功！');
      Logger.log('');
      Logger.log(' 完成！所有用戶現在都可以看到圖文選單了');
      Logger.log('');
      Logger.log(' 測試方式：');
      Logger.log('1. 開啟 LINE 與您的 Bot 對話');
      Logger.log('2. 點擊輸入框左邊的選單按鈕');
      Logger.log('3. 應該會看到打卡選單');
    } else {
      Logger.log(' 設定失敗');
      Logger.log('狀態碼: ' + response.getResponseCode());
      Logger.log('回應: ' + response.getContentText());
    }
    
  } catch (error) {
    Logger.log(' setDefaultRichMenu 錯誤: ' + error);
  }
}

/**
 *  列出所有圖文選單
 */
function listAllRichMenus() {
  try {
    Logger.log(' 列出所有圖文選單');
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 圖文選單列表：');
      Logger.log('');
      
      if (result.richmenus && result.richmenus.length > 0) {
        result.richmenus.forEach((menu, index) => {
          Logger.log(`${index + 1}. ${menu.name}`);
          Logger.log(`   ID: ${menu.richMenuId}`);
          Logger.log(`   尺寸: ${menu.size.width}x${menu.size.height}`);
          Logger.log(`   選單文字: ${menu.chatBarText}`);
          Logger.log('');
        });
      } else {
        Logger.log('目前沒有圖文選單');
      }
    } else {
      Logger.log(' 取得失敗');
      Logger.log('回應: ' + response.getContentText());
    }
    
  } catch (error) {
    Logger.log(' listAllRichMenus 錯誤: ' + error);
  }
}

/**
 *  刪除圖文選單
 * 
 * @param {string} richMenuId - 要刪除的圖文選單 ID
 */
function deleteRichMenu(richMenuId) {
  try {
    Logger.log(' 刪除圖文選單');
    
    if (!richMenuId) {
      Logger.log(' 請提供 richMenuId');
      Logger.log('   使用方式: deleteRichMenu("your-rich-menu-id")');
      Logger.log('');
      Logger.log(' 可以先執行 listAllRichMenus() 查看所有選單');
      return;
    }
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    const url = `https://api.line.me/v2/bot/richmenu/${richMenuId}`;
    
    const options = {
      method: 'delete',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 圖文選單已刪除');
    } else {
      Logger.log(' 刪除失敗');
      Logger.log('狀態碼: ' + response.getResponseCode());
      Logger.log('回應: ' + response.getContentText());
    }
    
  } catch (error) {
    Logger.log(' deleteRichMenu 錯誤: ' + error);
  }
}

/**
 *  生成預設圖文選單圖片（簡易版）
 * 
 * 這個函數會在 Google Drive 中建立一個簡單的圖文選單圖片
 * 您也可以使用專業繪圖軟體（如 Canva、Photoshop）製作更美觀的圖片
 */
function createDefaultRichMenuImage() {
  Logger.log(' 生成預設圖文選單圖片');
  Logger.log('');
  Logger.log(' Apps Script 無法直接生成圖片');
  Logger.log('');
  Logger.log(' 請使用以下方式製作圖片：');
  Logger.log('');
  Logger.log('方式 1: 使用 Canva（推薦）');
  Logger.log('1. 前往 https://www.canva.com');
  Logger.log('2. 建立自訂尺寸：2500 x 1686 像素');
  Logger.log('3. 將畫面分為 4 等份（2x2）');
  Logger.log('   - 左上：上班打卡（綠色）');
  Logger.log('   - 右上：下班打卡（橘色）');
  Logger.log('   - 左下：查詢打卡（藍色）');
  Logger.log('   - 右下：使用說明（紫色）');
  Logger.log('4. 下載 PNG 格式');
  Logger.log('5. 上傳到 Google Drive');
  Logger.log('');
  Logger.log('方式 2: 使用線上工具');
  Logger.log('https://developers.line.biz/en/docs/messaging-api/using-rich-menus/#create-a-rich-menu-image');
  Logger.log('');
  Logger.log('方式 3: 使用我提供的範本');
  Logger.log('（請聯繫我取得）');
}

/**
 *  一鍵設定圖文選單（完整流程）
 * 
 * 注意：需要先準備好圖片並上傳到 Google Drive
 */
function quickSetupRichMenu() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 圖文選單快速設定');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // 步驟 1：建立圖文選單
  Logger.log('步驟 1/3: 建立圖文選單');
  const richMenuId = createPunchRichMenu();
  
  if (!richMenuId) {
    Logger.log(' 設定失敗');
    return;
  }
  
  Logger.log('');
  Logger.log('⏸ 請暫停！');
  Logger.log('');
  Logger.log(' 接下來請手動執行：');
  Logger.log('');
  Logger.log('1. 準備圖片（2500x1686）');
  Logger.log('2. 上傳到 Google Drive');
  Logger.log('3. 修改 uploadRichMenuImage 函數中的 imageFileId');
  Logger.log('4. 執行: uploadRichMenuImage("' + richMenuId + '")');
  Logger.log('5. 執行: setDefaultRichMenu("' + richMenuId + '")');
  Logger.log('');
  Logger.log(' 如需刪除，請執行: deleteRichMenu("' + richMenuId + '")');
}


/**
 *  自動生成並上傳圖文選單圖片
 * 
 * 使用方式：
 * autoGenerateAndUploadRichMenu("richmenu-3097bf50f670a1f2630806c1668e326d")
 */
function autoGenerateAndUploadRichMenu(richMenuId) {
  try {
    Logger.log(' 開始自動生成圖文選單圖片');
    
    if (!richMenuId) {
      richMenuId = PropertiesService.getScriptProperties().getProperty('RICH_MENU_ID');
      
      if (!richMenuId) {
        Logger.log(' 請提供 richMenuId');
        return;
      }
    }
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    // 步驟 1：使用 Google Slides 生成圖片
    Logger.log(' 步驟 1/3: 使用 Google Slides 生成圖片...');
    
    // 建立一個新的 Presentation
    const presentation = SlidesApp.create('圖文選單_臨時');
    const slide = presentation.getSlides()[0];
    
    // 設定投影片大小（2500x1686 像素 = 694.44x468.33 點）
    presentation.getPageWidth();
    presentation.getPageHeight();
    
    // 清空預設內容
    slide.getShapes().forEach(shape => shape.remove());
    
    // 左上：上班打卡（綠色）
    const shape1 = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 347.22, 234.17);
    shape1.getFill().setSolidFill('#4CAF50');
    const text1 = shape1.getText();
    text1.setText('上班打卡\n');
    text1.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    text1.getTextStyle().setFontSize(48).setBold(true).setForegroundColor('#FFFFFF');
    
    // 右上：下班打卡（橘色）
    const shape2 = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 347.22, 0, 347.22, 234.17);
    shape2.getFill().setSolidFill('#FF9800');
    const text2 = shape2.getText();
    text2.setText('下班打卡\n');
    text2.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    text2.getTextStyle().setFontSize(48).setBold(true).setForegroundColor('#FFFFFF');
    
    // 左下：查詢打卡（藍色）
    const shape3 = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 234.17, 347.22, 234.17);
    shape3.getFill().setSolidFill('#2196F3');
    const text3 = shape3.getText();
    text3.setText('查詢打卡\n');
    text3.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    text3.getTextStyle().setFontSize(48).setBold(true).setForegroundColor('#FFFFFF');
    
    // 右下：使用說明（紫色）
    const shape4 = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 347.22, 234.17, 347.22, 234.17);
    shape4.getFill().setSolidFill('#673AB7');
    const text4 = shape4.getText();
    text4.setText('使用說明\n');
    text4.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    text4.getTextStyle().setFontSize(48).setBold(true).setForegroundColor('#FFFFFF');
    
    Logger.log(' 圖片生成完成');
    
    // 步驟 2：匯出為圖片
    Logger.log(' 步驟 2/3: 匯出圖片...');
    
    // 取得投影片的縮圖（作為圖片）
    const slideId = slide.getObjectId();
    const presentationId = presentation.getId();
    
    // 使用 Slides API 匯出圖片
    const url = `https://slides.googleapis.com/v1/presentations/${presentationId}/pages/${slideId}/thumbnail?thumbnailProperties.thumbnailSize=LARGE`;
    
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
      },
      muteHttpExceptions: true
    });
    
    const thumbnailData = JSON.parse(response.getContentText());
    
    if (!thumbnailData.contentUrl) {
      Logger.log(' 無法取得圖片 URL');
      
      // 刪除臨時 Presentation
      DriveApp.getFileById(presentationId).setTrashed(true);
      return;
    }
    
    // 下載圖片
    const imageBlob = UrlFetchApp.fetch(thumbnailData.contentUrl).getBlob();
    
    Logger.log(' 圖片下載完成');
    
    // 步驟 3：上傳到 LINE
    Logger.log(' 步驟 3/3: 上傳到 LINE...');
    
    const uploadUrl = `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`;
    
    const uploadOptions = {
      method: 'post',
      headers: {
        'Content-Type': 'image/png',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      payload: imageBlob,
      muteHttpExceptions: true
    };
    
    const uploadResponse = UrlFetchApp.fetch(uploadUrl, uploadOptions);
    
    if (uploadResponse.getResponseCode() === 200) {
      Logger.log(' 圖片上傳成功！');
      Logger.log('');
      Logger.log(' 最後一步：');
      Logger.log('   執行: setDefaultRichMenu("' + richMenuId + '")');
    } else {
      Logger.log(' 上傳失敗');
      Logger.log('狀態碼: ' + uploadResponse.getResponseCode());
      Logger.log('回應: ' + uploadResponse.getContentText());
    }
    
    // 清理：刪除臨時 Presentation
    DriveApp.getFileById(presentationId).setTrashed(true);
    Logger.log(' 已清理臨時檔案');
    
  } catch (error) {
    Logger.log(' autoGenerateAndUploadRichMenu 錯誤: ' + error);
    Logger.log('錯誤堆疊: ' + error.stack);
  }
}

/**
 *  完整自動化流程
 * 
 * 一鍵完成所有步驟：
 * 1. 建立圖文選單
 * 2. 生成圖片
 * 3. 上傳圖片
 * 4. 設為預設選單
 */
function fullAutoSetupRichMenu() {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 圖文選單完整自動化設定');
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    // 步驟 1：建立圖文選單
    Logger.log(' 步驟 1/4: 建立圖文選單結構...');
    const richMenuId = createPunchRichMenu();
    
    if (!richMenuId) {
      Logger.log(' 建立失敗');
      return;
    }
    
    Logger.log(' 圖文選單建立成功');
    Logger.log('');
    
    // 等待 2 秒
    Utilities.sleep(2000);
    
    // 步驟 2-3：生成並上傳圖片
    Logger.log(' 步驟 2-3/4: 生成並上傳圖片...');
    autoGenerateAndUploadRichMenu(richMenuId);
    
    Logger.log('');
    
    // 等待 3 秒
    Utilities.sleep(3000);
    
    // 步驟 4：設為預設選單
    Logger.log(' 步驟 4/4: 設為預設選單...');
    setDefaultRichMenu(richMenuId);
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 完成！');
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    Logger.log(' 請到 LINE 測試：');
    Logger.log('1. 開啟與 Bot 的對話');
    Logger.log('2. 點擊輸入框左邊的選單按鈕');
    Logger.log('3. 應該會看到打卡選單');
    
  } catch (error) {
    Logger.log(' fullAutoSetupRichMenu 錯誤: ' + error);
    Logger.log('錯誤堆疊: ' + error.stack);
  }
}


/**
 * 這個方案直接從網路下載預先製作好的圖片
 */
function uploadRichMenuWithDefaultImage(richMenuId) {
  try {
    Logger.log(' 開始上傳預設圖文選單圖片');
    
    if (!richMenuId) {
      richMenuId = PropertiesService.getScriptProperties().getProperty('RICH_MENU_ID');
      
      if (!richMenuId) {
        Logger.log(' 請提供 richMenuId');
        return;
      }
    }
    
    const channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    // 使用 Base64 編碼的簡單圖片（2500x1686，四格設計）
    // 這是一個臨時的純色圖片，您之後可以替換成更精美的版本
    
    Logger.log(' 步驟 1/2: 生成圖片...');
    
    // 建立一個簡單的 PNG 圖片（使用 Canvas）
    const imageData = createSimpleRichMenuImage();
    
    if (!imageData) {
      Logger.log(' 圖片生成失敗');
      return;
    }
    
    Logger.log(' 圖片生成完成');
    Logger.log(' 步驟 2/2: 上傳到 LINE...');
    
    const url = `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`;
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'image/png',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      payload: imageData,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 圖片上傳成功！');
      Logger.log('');
      Logger.log(' 最後一步：');
      Logger.log('   執行: setDefaultRichMenu("' + richMenuId + '")');
      return true;
    } else {
      Logger.log(' 上傳失敗');
      Logger.log('狀態碼: ' + response.getResponseCode());
      Logger.log('回應: ' + response.getContentText());
      return false;
    }
    
  } catch (error) {
    Logger.log(' uploadRichMenuWithDefaultImage 錯誤: ' + error);
    return false;
  }
}

/**
 * 建立簡單的圖文選單圖片（PNG 格式）
 */
function createSimpleRichMenuImage() {
  try {
    // 使用 Data URI 建立一個簡單的 2500x1686 四格圖片
    // 這是一個純色版本，包含四個區塊
    
    // Base64 編碼的 PNG 圖片（2500x1686，四格設計）
    const base64Image = 
      'iVBORw0KGgoAAAANSUhEUgAACcQAAAamCAYAAAAxV0XIAAAAAXNSR0IArs4c6QAAAARnQU1BAACx' +
      'jwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABCGSURBVHhe7doxAQAgDMCwgX/P4QJEEFTVzJwB' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      // ... (這裡會是完整的 Base64 圖片資料，但太長了)
      '==';
    
    // 解碼 Base64 並轉換為 Blob
    const imageBytes = Utilities.base64Decode(base64Image);
    const blob = Utilities.newBlob(imageBytes, 'image/png');
    
    return blob.getBytes();
    
  } catch (error) {
    Logger.log(' createSimpleRichMenuImage 錯誤: ' + error);
    return null;
  }
}
/**
 *  快速修正指南
 */
function showQuickFix() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 快速修正指南');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  Logger.log('如果月份查詢沒有回應，請按照以下步驟：');
  Logger.log('');
  Logger.log('步驟 1: 檢查 handleLineMessage');
  Logger.log('   執行: inspectHandleLineMessage()');
  Logger.log('');
  Logger.log('步驟 2: 確認程式碼');
  Logger.log('   在 handleLineMessage 中加入：');
  Logger.log('');
  Logger.log("   else if (text.startsWith('查詢:')) {");
  Logger.log("     const yearMonth = text.replace('查詢:', '');");
  Logger.log("     sendMonthlyRecords(replyToken, userId, employee.name, yearMonth);");
  Logger.log('   }');
  Logger.log('');
  Logger.log('步驟 3: 確認函數存在');
  Logger.log('   確認 sendMonthlyRecords 函數在檔案中');
  Logger.log('   確認 getMonthlyPunchRecords 函數在檔案中');
  Logger.log('   確認 groupRecordsByDate 函數在檔案中');
  Logger.log('   確認 calculateMonthlyStats 函數在檔案中');
  Logger.log('');
  Logger.log('步驟 4: 重新部署');
  Logger.log('   1. 儲存所有修改');
  Logger.log('   2. 部署 → 管理部署');
  Logger.log('   3. 編輯 → 版本：新版本');
  Logger.log('   4. 部署');
  Logger.log('');
  Logger.log('步驟 5: 測試');
  Logger.log('   執行: testMonthlyQueryMessageFlow()');
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

function findUserMonths() {
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  const months = {};
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === userId) {
      const date = new Date(values[i][0]);
      const yearMonth = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM');
      months[yearMonth] = (months[yearMonth] || 0) + 1;
    }
  }
  
  Logger.log('打卡記錄統計:');
  Logger.log('');
  
  if (Object.keys(months).length === 0) {
    Logger.log(' 沒有任何打卡記錄');
    Logger.log('');
    Logger.log(' 請先在 LINE Bot 中打卡，或使用其他 userId 測試');
  } else {
    Object.keys(months).sort().forEach(m => {
      Logger.log(`${m}: ${months[m]} 筆`);
    });
  }
}


// DebugFebruary2026.gs - 專門診斷 2026-02 的問題

// CheckFlexMessage.gs - 檢查 Flex Message 大小和格式

// ==================== 加班申請功能 ====================

/**
 *  發送加班申請指引
 */
function sendOvertimeApplicationGuide(replyToken, userId, employeeName) {
  try {
    Logger.log(' 發送加班申請指引');
    Logger.log('   userId: ' + userId);
    
    const message = {
      type: 'flex',
      altText: '加班申請指引',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 加班申請',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            }
          ],
          backgroundColor: '#FF9800',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${employeeName}，您好！`,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 如何申請加班？',
                  weight: 'bold',
                  size: 'md',
                  color: '#FF9800'
                },
                {
                  type: 'text',
                  text: '目前需要到網頁版填寫表單',
                  size: 'sm',
                  color: '#666666',
                  margin: 'md',
                  wrap: true
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 申請步驟',
                  weight: 'bold',
                  size: 'md',
                  color: '#2196F3'
                },
                {
                  type: 'text',
                  text: '1. 點擊下方「開啟網頁版」按鈕',
                  size: 'sm',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '2. 登入系統',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '3. 前往「加班管理」頁面',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '4. 填寫加班日期、時間、原因',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '5. 送出申請，等候審核',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 注意事項',
                  weight: 'bold',
                  size: 'md',
                  color: '#FF6B6B'
                },
                {
                  type: 'text',
                  text: '• 需事先取得主管同意',
                  size: 'sm',
                  color: '#666666',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 申請後請等候審核通知',
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '• 加班時數需符合勞基法規定',
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: ' 相關指令',
                  weight: 'bold',
                  size: 'sm',
                  color: '#999999'
                },
                {
                  type: 'text',
                  text: '• 輸入「加班紀錄」查看申請狀態',
                  size: 'xs',
                  color: '#999999',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '• 輸入「本月工時」查看統計',
                  size: 'xs',
                  color: '#999999',
                  margin: 'xs'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'uri',
                label: ' 開啟網頁版',
                uri: 'https://eric693.github.io/KING_LONG_check_manager/'
              },
              color: '#FF9800'
            },
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'message',
                label: ' 查看我的加班紀錄',
                text: '加班紀錄'
              }
            }
          ],
          flex: 0
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 加班申請指引已發送');
    
  } catch (error) {
    Logger.log(' sendOvertimeApplicationGuide 錯誤: ' + error);
    replyMessage(replyToken, ' 系統錯誤，請稍後再試');
  }
}

/**
 *  發送我的加班紀錄
 */
function sendMyOvertimeRecords(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢加班紀錄');
    Logger.log('   userId: ' + userId);
    
    // 取得加班記錄
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_OVERTIME);
    
    if (!sheet) {
      replyMessage(replyToken, ' 找不到加班申請記錄');
      return;
    }
    
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      replyMessage(replyToken, `${employeeName}，您目前沒有加班申請記錄`);
      return;
    }
    
    // 篩選該用戶的記錄
    const records = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const recordUserId = row[1];
      
      if (recordUserId === userId) {
        records.push({
          requestId: row[0],
          overtimeDate: formatOvertimeDate(row[3]),
          startTime: formatOvertimeTime(row[4]),
          endTime: formatOvertimeTime(row[5]),
          hours: parseFloat(row[6]) || 0,
          reason: row[7] || '',
          applyDate: formatOvertimeDate(row[8]),
          status: String(row[9]).trim().toLowerCase(),
          reviewerName: row[11] || '',
          reviewComment: row[13] || '',
          compensatoryHours: parseFloat(row[14]) || 0
        });
      }
    }
    
    Logger.log(`   找到 ${records.length} 筆記錄`);
    
    if (records.length === 0) {
      replyMessage(replyToken, `${employeeName}，您目前沒有加班申請記錄`);
      return;
    }
    
    // 按申請日期排序（最新在前）
    records.sort((a, b) => new Date(b.applyDate) - new Date(a.applyDate));
    
    // 限制顯示最近 10 筆
    const displayRecords = records.slice(0, 10);
    
    // 統計
    const pendingCount = records.filter(r => r.status === 'pending').length;
    const approvedCount = records.filter(r => r.status === 'approved').length;
    const rejectedCount = records.filter(r => r.status === 'rejected').length;
    const totalApprovedHours = records
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + r.hours, 0);
    
    // 建立記錄內容
    const recordContents = [];
    
    displayRecords.forEach((record, index) => {
      // 狀態文字和顏色
      let statusText = '';
      let statusColor = '';
      
      if (record.status === 'pending') {
        statusText = '⏳ 待審核';
        statusColor = '#FF9800';
      } else if (record.status === 'approved') {
        statusText = ' 已核准';
        statusColor = '#4CAF50';
      } else if (record.status === 'rejected') {
        statusText = ' 已拒絕';
        statusColor = '#F44336';
      } else {
        statusText = record.status;
        statusColor = '#999999';
      }
      
      if (index > 0) {
        recordContents.push({
          type: 'separator',
          margin: 'lg'
        });
      }
      
      recordContents.push({
        type: 'box',
        layout: 'vertical',
        margin: index === 0 ? 'none' : 'lg',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: record.overtimeDate,
                weight: 'bold',
                size: 'md',
                flex: 0
              },
              {
                type: 'text',
                text: statusText,
                size: 'sm',
                color: statusColor,
                weight: 'bold',
                align: 'end'
              }
            ]
          },
          {
            type: 'text',
            text: `${record.startTime} - ${record.endTime} (${record.hours}h)`,
            size: 'sm',
            color: '#666666',
            margin: 'xs'
          },
          {
            type: 'text',
            text: `原因：${record.reason}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs',
            wrap: true
          }
        ]
      });
      
      // 補休時數
      if (record.compensatoryHours > 0) {
        recordContents.push({
          type: 'text',
          text: ` 補休時數：${record.compensatoryHours}h`,
          size: 'xs',
          color: '#2196F3',
          margin: 'xs'
        });
      }
      
      // 審核意見
      if (record.status === 'approved' || record.status === 'rejected') {
        if (record.reviewerName) {
          recordContents.push({
            type: 'text',
            text: `審核：${record.reviewerName}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs'
          });
        }
        if (record.reviewComment) {
          recordContents.push({
            type: 'text',
            text: ` ${record.reviewComment}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs',
            wrap: true
          });
        }
      }
    });
    
    const message = {
      type: 'flex',
      altText: '加班紀錄',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 加班紀錄',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            },
            {
              type: 'text',
              text: employeeName,
              size: 'sm',
              color: '#FFFFFF',
              margin: 'xs'
            }
          ],
          backgroundColor: '#FF9800',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // 統計資訊
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: ' 統計',
                  weight: 'bold',
                  size: 'md',
                  color: '#333333'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: `待審核\n${pendingCount} 筆`,
                      size: 'xs',
                      color: '#FF9800',
                      flex: 1,
                      align: 'center',
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `已核准\n${approvedCount} 筆`,
                      size: 'xs',
                      color: '#4CAF50',
                      flex: 1,
                      align: 'center',
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `已拒絕\n${rejectedCount} 筆`,
                      size: 'xs',
                      color: '#F44336',
                      flex: 1,
                      align: 'center',
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'text',
                  text: `已核准加班時數：${totalApprovedHours.toFixed(1)} 小時`,
                  size: 'xs',
                  color: '#666666',
                  margin: 'md',
                  align: 'center'
                }
              ],
              backgroundColor: '#F5F5F5',
              paddingAll: '12px',
              cornerRadius: '8px'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: `最近 ${displayRecords.length} 筆記錄`,
              size: 'xs',
              color: '#999999',
              margin: 'lg'
            },
            // 記錄列表
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: recordContents
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: ' 查看完整記錄',
                uri: 'https://eric693.github.io/KING_LONG_check_manager/'
              }
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 加班紀錄已發送');
    
  } catch (error) {
    Logger.log(' sendMyOvertimeRecords 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

/**
 * 格式化加班日期
 */
function formatOvertimeDate(dateValue) {
  if (!dateValue) return '';
  
  try {
    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    
    if (typeof dateValue === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue;
      }
      
      if (dateValue.includes('/')) {
        const parts = dateValue.split('/');
        if (parts.length >= 3) {
          const year = parts[0];
          const month = parts[1].padStart(2, '0');
          const day = parts[2].split(' ')[0].padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }
      
      if (dateValue.includes('T')) {
        return dateValue.split('T')[0];
      }
    }
    
    return String(dateValue);
    
  } catch (e) {
    Logger.log(' formatOvertimeDate 失敗: ' + dateValue);
    return String(dateValue);
  }
}

/**
 * 格式化加班時間
 */
function formatOvertimeTime(timeValue) {
  if (!timeValue) return '';
  
  try {
    if (timeValue instanceof Date) {
      return Utilities.formatDate(timeValue, 'Asia/Taipei', 'HH:mm');
    }
    
    if (typeof timeValue === 'string') {
      if (timeValue.includes('下午') || timeValue.includes('上午')) {
        const timePart = timeValue.split(' ')[2];
        return timePart ? timePart.substring(0, 5) : timeValue;
      }
      
      if (timeValue.includes('T')) {
        const timePart = timeValue.split('T')[1];
        return timePart ? timePart.substring(0, 5) : timeValue;
      }
      
      if (timeValue.includes(':')) {
        return timeValue.substring(0, 5);
      }
    }
    
    return String(timeValue);
    
  } catch (e) {
    Logger.log(' formatOvertimeTime 失敗: ' + timeValue);
    return String(timeValue);
  }
}


/**
 *  發送排班查詢選單
 */
function sendShiftQueryMenu(replyToken, userId, employeeName) {
  const message = {
    type: 'text',
    text: `${employeeName}，請選擇查詢範圍：`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: ' 今日排班', text: '今日排班' }
        },
        {
          type: 'action',
          action: { type: 'message', label: ' 本週排班', text: '本週排班' }
        },
        {
          type: 'action',
          action: { type: 'message', label: ' 本月排班', text: '本月排班' }
        }
      ]
    }
  };
  sendLineReply_(replyToken, [message]);
}

/**
 *  發送今日排班
 */
function sendTodayShift(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢今日排班');
    Logger.log('   userId: ' + userId);
    
    // 取得今日日期
    const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
    
    // 查詢排班
    const shiftResult = getEmployeeShiftForDate(userId, today);
    
    if (!shiftResult.success) {
      replyMessage(replyToken, ' 查詢失敗，請稍後再試');
      return;
    }
    
    if (!shiftResult.hasShift) {
      replyMessage(replyToken, `${employeeName}，您今天沒有排班\n\n 今天是休假日！`);
      return;
    }
    
    // 建立排班訊息
    const shift = shiftResult.data;
    
    const message = {
      type: 'flex',
      altText: '今日排班',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 今日排班',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            }
          ],
          backgroundColor: '#2196F3',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: employeeName,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: today,
              size: 'sm',
              color: '#666666',
              margin: 'xs'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '班別',
                      color: '#999999',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: shift.shiftType,
                      wrap: true,
                      color: '#2196F3',
                      size: 'md',
                      flex: 5,
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '上班',
                      color: '#999999',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: shift.startTime,
                      wrap: true,
                      color: '#4CAF50',
                      size: 'sm',
                      flex: 5,
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '下班',
                      color: '#999999',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: shift.endTime,
                      wrap: true,
                      color: '#FF9800',
                      size: 'sm',
                      flex: 5,
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '地點',
                      color: '#999999',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: shift.location || '無',
                      wrap: true,
                      color: '#333333',
                      size: 'sm',
                      flex: 5
                    }
                  ]
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: ' 提醒：請準時打卡',
              size: 'xs',
              color: '#999999',
              margin: 'lg',
              align: 'center'
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 今日排班已發送');
    
  } catch (error) {
    Logger.log(' sendTodayShift 錯誤: ' + error);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

/**
 *  發送本週排班
 */
function sendWeeklyShifts(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢本週排班');
    Logger.log('   userId: ' + userId);
    
    // 計算本週日期範圍
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // 週日
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // 週六
    
    const startDate = Utilities.formatDate(startOfWeek, 'Asia/Taipei', 'yyyy-MM-dd');
    const endDate = Utilities.formatDate(endOfWeek, 'Asia/Taipei', 'yyyy-MM-dd');
    
    // 查詢排班
    const shiftsResult = getShifts({
      employeeId: userId,
      startDate: startDate,
      endDate: endDate
    });
    
    if (!shiftsResult.success) {
      replyMessage(replyToken, ' 查詢失敗，請稍後再試');
      return;
    }
    
    if (shiftsResult.data.length === 0) {
      replyMessage(replyToken, `${employeeName}，您本週沒有排班\n\n 本週都是休假日！`);
      return;
    }
    
    // 建立排班列表
    const shiftContents = [];
    
    shiftsResult.data.forEach((shift, index) => {
      if (index > 0) {
        shiftContents.push({
          type: 'separator',
          margin: 'lg'
        });
      }
      
      // 格式化日期（顯示星期）
      const shiftDate = new Date(shift.date);
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const weekday = weekdays[shiftDate.getDay()];
      const dateLabel = `${shift.date} (${weekday})`;
      
      // 判斷是否為今天
      const isToday = shift.date === Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
      
      shiftContents.push({
        type: 'box',
        layout: 'vertical',
        margin: index === 0 ? 'none' : 'lg',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: dateLabel + (isToday ? ' ' : ''),
            weight: 'bold',
            size: 'md',
            color: isToday ? '#2196F3' : '#333333'
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: shift.shiftType,
                color: '#2196F3',
                size: 'sm',
                flex: 2,
                weight: 'bold'
              },
              {
                type: 'text',
                text: `${shift.startTime} - ${shift.endTime}`,
                size: 'sm',
                flex: 3,
                color: '#666666'
              }
            ]
          },
          {
            type: 'text',
            text: ` ${shift.location}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs'
          }
        ]
      });
    });
    
    const message = {
      type: 'flex',
      altText: '本週排班',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 本週排班',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            },
            {
              type: 'text',
              text: `${startDate} ~ ${endDate}`,
              size: 'xs',
              color: '#FFFFFF',
              margin: 'xs'
            }
          ],
          backgroundColor: '#2196F3',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: employeeName,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: `共 ${shiftsResult.data.length} 天排班`,
              size: 'sm',
              color: '#666666',
              margin: 'xs'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: shiftContents
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 本週排班已發送');
    
  } catch (error) {
    Logger.log(' sendWeeklyShifts 錯誤: ' + error);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

/**
 *  發送本月排班
 */
function sendMonthlyShifts(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢本月排班');
    Logger.log('   userId: ' + userId);
    
    // 計算本月日期範圍
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    
    const startDate = Utilities.formatDate(startOfMonth, 'Asia/Taipei', 'yyyy-MM-dd');
    const endDate = Utilities.formatDate(endOfMonth, 'Asia/Taipei', 'yyyy-MM-dd');
    
    // 查詢排班
    const shiftsResult = getShifts({
      employeeId: userId,
      startDate: startDate,
      endDate: endDate
    });
    
    if (!shiftsResult.success) {
      replyMessage(replyToken, ' 查詢失敗，請稍後再試');
      return;
    }
    
    if (shiftsResult.data.length === 0) {
      const monthLabel = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy年MM月');
      replyMessage(replyToken, `${employeeName}，您本月沒有排班\n\n ${monthLabel}都是休假日！`);
      return;
    }
    
    // 統計班別
    const shiftTypeStats = {};
    shiftsResult.data.forEach(shift => {
      shiftTypeStats[shift.shiftType] = (shiftTypeStats[shift.shiftType] || 0) + 1;
    });
    
    // 建立統計內容
    const statsContents = Object.keys(shiftTypeStats).map(shiftType => ({
      type: 'box',
      layout: 'baseline',
      contents: [
        {
          type: 'text',
          text: shiftType,
          size: 'sm',
          color: '#666666',
          flex: 2
        },
        {
          type: 'text',
          text: `${shiftTypeStats[shiftType]} 天`,
          size: 'sm',
          color: '#333333',
          flex: 1,
          align: 'end',
          weight: 'bold'
        }
      ]
    }));
    
    // 建立每日排班列表（只顯示最近10天）
    const recentShifts = shiftsResult.data.slice(0, 10);
    const shiftContents = [];
    
    recentShifts.forEach((shift, index) => {
      if (index > 0) {
        shiftContents.push({
          type: 'separator',
          margin: 'sm'
        });
      }
      
      const shiftDate = new Date(shift.date);
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const weekday = weekdays[shiftDate.getDay()];
      const dateLabel = `${shift.date.substring(5)} (${weekday})`;
      
      shiftContents.push({
        type: 'box',
        layout: 'baseline',
        spacing: 'sm',
        margin: index === 0 ? 'none' : 'sm',
        contents: [
          {
            type: 'text',
            text: dateLabel,
            size: 'xs',
            color: '#666666',
            flex: 3
          },
          {
            type: 'text',
            text: shift.shiftType,
            size: 'xs',
            color: '#2196F3',
            flex: 2,
            weight: 'bold'
          },
          {
            type: 'text',
            text: shift.startTime,
            size: 'xs',
            color: '#999999',
            flex: 2,
            align: 'end'
          }
        ]
      });
    });
    
    const monthLabel = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy年MM月');
    
    const message = {
      type: 'flex',
      altText: '本月排班',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ` ${monthLabel}排班`,
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            }
          ],
          backgroundColor: '#2196F3',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: employeeName,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            // 統計資訊
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: ' 班別統計',
                  weight: 'bold',
                  size: 'sm',
                  color: '#333333'
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'sm',
                  spacing: 'xs',
                  contents: statsContents
                },
                {
                  type: 'text',
                  text: `總計: ${shiftsResult.data.length} 天`,
                  size: 'xs',
                  color: '#2196F3',
                  margin: 'sm',
                  weight: 'bold',
                  align: 'end'
                }
              ],
              backgroundColor: '#F5F5F5',
              paddingAll: '12px',
              cornerRadius: '8px'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            // 近期排班
            {
              type: 'text',
              text: recentShifts.length === shiftsResult.data.length 
                ? ' 排班明細' 
                : ` 近期排班（前 ${recentShifts.length} 天）`,
              weight: 'bold',
              size: 'sm',
              color: '#333333',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              spacing: 'xs',
              contents: shiftContents
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: ' 查看完整排班',
                uri: 'https://eric693.github.io/KING_LONG_check_manager/'
              }
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 本月排班已發送');
    
  } catch (error) {
    Logger.log(' sendMonthlyShifts 錯誤: ' + error);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}




/**
 *  一鍵設定圖文選單（使用您的圖片）
 * 
 * 使用方式：
 * 1. 確保圖片已設定為「知道連結的任何人都可以查看」（已完成）
 * 2. 在 Apps Script 中執行這個函數
 * 3. 等待完成！
 */
function quickSetupWithYourImage() {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始設定圖文選單');
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    // 您的圖片 File ID
    const imageFileId = '1MKeVa205TM1yoWR72UfUXFmsl57qSoUD';
    // 步驟 1: 建立圖文選單
    Logger.log(' 步驟 1/3: 建立圖文選單結構...');
    const richMenuId = createPunchRichMenu();
    
    if (!richMenuId) {
      Logger.log(' 建立失敗');
      return;
    }
    
    Logger.log(' 圖文選單建立成功');
    Logger.log('   Rich Menu ID: ' + richMenuId);
    Logger.log('');
    
    // 等待 2 秒
    Utilities.sleep(2000);
    
    // 步驟 2: 上傳圖片
    Logger.log(' 步驟 2/3: 上傳圖片...');
    
    const channelAccessToken = PropertiesService.getScriptProperties()
      .getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      Logger.log('');
      Logger.log('請到專案設定 → Script Properties 設定：');
      Logger.log('   名稱: LINE_CHANNEL_ACCESS_TOKEN');
      Logger.log('   值: (您的 LINE Channel Access Token)');
      return;
    }
    
    // 從 Google Drive 取得圖片
    try {
      const file = DriveApp.getFileById(imageFileId);
      const blob = file.getBlob();
      
      Logger.log(' 圖片讀取成功');
      Logger.log('   檔案名稱: ' + file.getName());
      Logger.log('   檔案大小: ' + (blob.getBytes().length / 1024).toFixed(2) + ' KB');
      
      // 檢查圖片大小
      if (blob.getBytes().length > 1048576) {
        Logger.log(' 警告: 圖片超過 1MB，可能無法上傳');
      }
      
      Logger.log('');
      Logger.log(' 正在上傳到 LINE...');
      
      const url = `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`;
      
      const options = {
        method: 'post',
        headers: {
          'Content-Type': blob.getContentType(),
          'Authorization': `Bearer ${channelAccessToken}`
        },
        payload: blob,
        muteHttpExceptions: true
      };
      
      const response = UrlFetchApp.fetch(url, options);
      
      if (response.getResponseCode() === 200) {
        Logger.log(' 圖片上傳成功！');
        Logger.log('');
      } else {
        Logger.log(' 圖片上傳失敗');
        Logger.log('   狀態碼: ' + response.getResponseCode());
        Logger.log('   回應: ' + response.getContentText());
        Logger.log('');
        Logger.log(' 可能的原因：');
        Logger.log('   1. 圖片尺寸不是 2500x1686');
        Logger.log('   2. 圖片大小超過 1MB');
        Logger.log('   3. 圖片格式不正確');
        return;
      }
      
    } catch (driveError) {
      Logger.log(' 無法讀取 Google Drive 圖片');
      Logger.log('   錯誤: ' + driveError.message);
      Logger.log('');
      Logger.log(' 請確認：');
      Logger.log('   1. 圖片已設定為「知道連結的任何人都可以查看」');
      Logger.log('   2. File ID 正確: ' + imageFileId);
      Logger.log('   3. 執行此腳本的帳號有權限存取該檔案');
      return;
    }
    
    // 等待 2 秒
    Utilities.sleep(2000);
    
    // 步驟 3: 設為預設選單
    Logger.log(' 步驟 3/3: 設為預設選單...');
    
    const defaultUrl = `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`;
    
    const defaultOptions = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      muteHttpExceptions: true
    };
    
    const defaultResponse = UrlFetchApp.fetch(defaultUrl, defaultOptions);
    
    if (defaultResponse.getResponseCode() === 200) {
      Logger.log(' 預設圖文選單設定成功！');
      Logger.log('');
      Logger.log('═══════════════════════════════════════');
      Logger.log(' 完成！圖文選單已成功設定');
      Logger.log('═══════════════════════════════════════');
      Logger.log('');
      Logger.log(' 測試方式：');
      Logger.log('1. 開啟 LINE 應用程式');
      Logger.log('2. 找到您的 Bot');
      Logger.log('3. 點擊輸入框左邊的選單按鈕（≡）');
      Logger.log('4. 應該會看到圖文選單');
      Logger.log('');
      Logger.log(' Rich Menu ID: ' + richMenuId);
      Logger.log('（請保存此 ID，之後如需修改可用）');
      
    } else {
      Logger.log(' 設定預設選單失敗');
      Logger.log('   狀態碼: ' + defaultResponse.getResponseCode());
      Logger.log('   回應: ' + defaultResponse.getContentText());
    }
    
  } catch (error) {
    Logger.log(' 發生錯誤: ' + error.message);
    Logger.log('   堆疊: ' + error.stack);
  }
}

/**
 *  清除所有圖文選單（重新開始用）
 */
function deleteAllRichMenus() {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 清除所有圖文選單');
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    const channelAccessToken = PropertiesService.getScriptProperties()
      .getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    // 列出所有圖文選單
    const listUrl = 'https://api.line.me/v2/bot/richmenu/list';
    
    const listOptions = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      muteHttpExceptions: true
    };
    
    const listResponse = UrlFetchApp.fetch(listUrl, listOptions);
    const result = JSON.parse(listResponse.getContentText());
    
    if (result.richmenus && result.richmenus.length > 0) {
      Logger.log(`找到 ${result.richmenus.length} 個圖文選單`);
      Logger.log('');
      
      result.richmenus.forEach((menu, index) => {
        Logger.log(`刪除 ${index + 1}/${result.richmenus.length}: ${menu.name}`);
        
        const deleteUrl = `https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`;
        
        const deleteOptions = {
          method: 'delete',
          headers: {
            'Authorization': `Bearer ${channelAccessToken}`
          },
          muteHttpExceptions: true
        };
        
        const deleteResponse = UrlFetchApp.fetch(deleteUrl, deleteOptions);
        
        if (deleteResponse.getResponseCode() === 200) {
          Logger.log(`    已刪除`);
        } else {
          Logger.log(`    刪除失敗`);
        }
      });
      
      Logger.log('');
      Logger.log(' 清除完成！');
      
    } else {
      Logger.log('目前沒有圖文選單');
    }
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    
  } catch (error) {
    Logger.log(' 清除失敗: ' + error.message);
  }
}

/**
 * ========================================
 * LINE Bot 請假功能主模組
 * ========================================


// ==================== 請假申請選單 ====================

/**
 *  發送請假申請選單
 */
function sendLeaveApplicationMenu(replyToken, userId, employeeName) {
  try {
    Logger.log(' 發送請假申請選單');
    Logger.log('   userId: ' + userId);
    
    const message = {
      type: 'flex',
      altText: '請假申請',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 請假申請',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            }
          ],
          backgroundColor: '#FF9800',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${employeeName}，您好！`,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 如何申請請假？',
                  weight: 'bold',
                  size: 'md',
                  color: '#FF9800'
                },
                {
                  type: 'text',
                  text: '目前需要到網頁版填寫表單',
                  size: 'sm',
                  color: '#666666',
                  margin: 'md',
                  wrap: true
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 申請步驟',
                  weight: 'bold',
                  size: 'md',
                  color: '#2196F3'
                },
                {
                  type: 'text',
                  text: '1. 點擊下方「開啟網頁版」按鈕',
                  size: 'sm',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '2. 登入系統',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '3. 前往「請假管理」頁面',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '4. 選擇假別、填寫日期時間',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '5. 填寫請假原因並送出',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 注意事項',
                  weight: 'bold',
                  size: 'md',
                  color: '#FF6B6B'
                },
                {
                  type: 'text',
                  text: '• 請假需事先申請，不可事後補假',
                  size: 'sm',
                  color: '#666666',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 申請後請等候主管審核',
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '• 請確認假期餘額是否足夠',
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '• 支援 24 小時制（可跨時段申請）',
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: ' 相關指令',
                  weight: 'bold',
                  size: 'sm',
                  color: '#999999'
                },
                {
                  type: 'text',
                  text: '• 輸入「請假記錄」查看申請狀態',
                  size: 'xs',
                  color: '#999999',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '• 輸入「假期餘額」查看剩餘假期',
                  size: 'xs',
                  color: '#999999',
                  margin: 'xs'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'uri',
                label: ' 開啟網頁版申請',
                uri: 'https://eric693.github.io/KING_LONG_check_manager/'
              },
              color: '#FF9800'
            },
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'message',
                label: ' 查看我的請假記錄',
                text: '請假記錄'
              }
            },
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'message',
                label: '查看假期餘額',
                text: '假期餘額'
              }
            }
          ],
          flex: 0
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 請假申請選單已發送');
    
  } catch (error) {
    Logger.log(' sendLeaveApplicationMenu 錯誤: ' + error);
    replyMessage(replyToken, ' 系統錯誤，請稍後再試');
  }
}

// ==================== 請假記錄查詢 ====================

/**
 *  發送我的請假記錄
 */
function sendMyLeaveRecords(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢請假記錄');
    Logger.log('   userId: ' + userId);
    
    // 取得請假記錄
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('請假紀錄');
    
    if (!sheet) {
      replyMessage(replyToken, `${employeeName}，請假記錄表不存在\n\n請聯繫管理員設定`);
      return;
    }
    
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      replyMessage(replyToken, `${employeeName}，您目前沒有請假記錄`);
      return;
    }
    
    // 篩選該用戶的記錄
    const records = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const recordUserId = row[1];
      
      if (recordUserId === userId) {
        records.push({
          applyTime: formatLeaveDateTime(row[0]),
          leaveType: row[4],
          startDateTime: row[5],
          endDateTime: row[6],
          workHours: parseFloat(row[7]) || 0,
          days: parseFloat(row[8]) || 0,
          reason: row[9] || '',
          status: String(row[10]).trim(),
          reviewer: row[11] || '',
          reviewTime: row[12] ? formatLeaveDateTime(row[12]) : '',
          reviewComment: row[13] || ''
        });
      }
    }
    
    Logger.log(`   找到 ${records.length} 筆記錄`);
    
    if (records.length === 0) {
      replyMessage(replyToken, `${employeeName}，您目前沒有請假記錄`);
      return;
    }
    
    // 按申請日期排序（最新在前）
    records.sort((a, b) => new Date(b.applyTime) - new Date(a.applyTime));
    
    // 限制顯示最近 10 筆
    const displayRecords = records.slice(0, 10);
    
    // 統計
    const pendingCount = records.filter(r => r.status === 'PENDING').length;
    const approvedCount = records.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = records.filter(r => r.status === 'REJECTED').length;
    const totalApprovedHours = records
      .filter(r => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.workHours, 0);
    
    // 建立記錄內容
    const recordContents = [];
    
    displayRecords.forEach((record, index) => {
      // 狀態文字和顏色
      let statusText = '';
      let statusColor = '';
      
      if (record.status === 'PENDING') {
        statusText = '⏳ 待審核';
        statusColor = '#FF9800';
      } else if (record.status === 'APPROVED') {
        statusText = ' 已核准';
        statusColor = '#4CAF50';
      } else if (record.status === 'REJECTED') {
        statusText = ' 已拒絕';
        statusColor = '#F44336';
      } else {
        statusText = record.status;
        statusColor = '#999999';
      }
      
      // 假別中文名稱
      const leaveTypeName = getLeaveTypeName(record.leaveType);
      
      if (index > 0) {
        recordContents.push({
          type: 'separator',
          margin: 'lg'
        });
      }
      
      recordContents.push({
        type: 'box',
        layout: 'vertical',
        margin: index === 0 ? 'none' : 'lg',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: leaveTypeName,
                weight: 'bold',
                size: 'md',
                flex: 0,
                color: '#333333'
              },
              {
                type: 'text',
                text: statusText,
                size: 'sm',
                color: statusColor,
                weight: 'bold',
                align: 'end'
              }
            ]
          },
          {
            type: 'text',
            text: `${formatLeaveDate(record.startDateTime)} ~ ${formatLeaveDate(record.endDateTime)}`,
            size: 'sm',
            color: '#666666',
            margin: 'xs'
          },
          {
            type: 'text',
            text: `時數：${record.workHours}h (${record.days}天)`,
            size: 'xs',
            color: '#999999',
            margin: 'xs'
          },
          {
            type: 'text',
            text: `原因：${record.reason}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs',
            wrap: true
          }
        ]
      });
      
      // 審核意見
      if (record.status === 'APPROVED' || record.status === 'REJECTED') {
        if (record.reviewer) {
          recordContents.push({
            type: 'text',
            text: `審核：${record.reviewer}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs'
          });
        }
        if (record.reviewComment) {
          recordContents.push({
            type: 'text',
            text: ` ${record.reviewComment}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs',
            wrap: true
          });
        }
      }
    });
    
    const message = {
      type: 'flex',
      altText: '請假記錄',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 請假記錄',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            },
            {
              type: 'text',
              text: employeeName,
              size: 'sm',
              color: '#FFFFFF',
              margin: 'xs'
            }
          ],
          backgroundColor: '#FF9800',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // 統計資訊
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '統計',
                  weight: 'bold',
                  size: 'md',
                  color: '#333333'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: `待審核\n${pendingCount} 筆`,
                      size: 'xs',
                      color: '#FF9800',
                      flex: 1,
                      align: 'center',
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `已核准\n${approvedCount} 筆`,
                      size: 'xs',
                      color: '#4CAF50',
                      flex: 1,
                      align: 'center',
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `已拒絕\n${rejectedCount} 筆`,
                      size: 'xs',
                      color: '#F44336',
                      flex: 1,
                      align: 'center',
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'text',
                  text: `已核准請假時數：${totalApprovedHours.toFixed(1)} 小時`,
                  size: 'xs',
                  color: '#666666',
                  margin: 'md',
                  align: 'center'
                }
              ],
              backgroundColor: '#F5F5F5',
              paddingAll: '12px',
              cornerRadius: '8px'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: `最近 ${displayRecords.length} 筆記錄`,
              size: 'xs',
              color: '#999999',
              margin: 'lg'
            },
            // 記錄列表
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: recordContents
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: '查看完整記錄',
                uri: 'https://eric693.github.io/KING_LONG_check_manager/'
              }
            },
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'message',
                label: '查看假期餘額',
                text: '假期餘額'
              }
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 請假記錄已發送');
    
  } catch (error) {
    Logger.log(' sendMyLeaveRecords 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

// ==================== 假期餘額查詢 ====================

/**
 *  發送假期餘額
 */
function sendLeaveBalance(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢假期餘額');
    Logger.log('   userId: ' + userId);
    
    // 取得假期餘額
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('假期餘額');
    
    if (!sheet) {
      replyMessage(replyToken, `${employeeName}，假期餘額表不存在\n\n請聯繫管理員設定`);
      return;
    }
    
    const values = sheet.getDataRange().getValues();
    
    // 查找員工記錄
    let balance = null;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === userId) {
        balance = {
          annual: values[i][2] || 0,
          sick: values[i][3] || 0,
          personal: values[i][4] || 0,
          bereavement: values[i][5] || 0,
          marriage: values[i][6] || 0,
          maternity: values[i][7] || 0,
          paternity: values[i][8] || 0,
          hospitalization: values[i][9] || 0,
          menstrual: values[i][10] || 0,
          familyCare: values[i][11] || 0,
          official: values[i][12] || 0,
          workInjury: values[i][13] || 0,
          disaster: values[i][14] || 0,
          compTimeOff: values[i][15] || 0
        };
        break;
      }
    }
    
    if (!balance) {
      replyMessage(replyToken, `${employeeName}，找不到您的假期資料\n\n請聯繫管理員設定`);
      return;
    }
    
    // 建立餘額內容
    const balanceContents = [
      { name: '特休假', hours: balance.annual, color: '#4CAF50' },
      { name: '病假', hours: balance.sick, color: '#2196F3' },
      { name: '事假', hours: balance.personal, color: '#FF9800' },
      { name: '生理假', hours: balance.menstrual, color: '#E91E63' },
      { name: '家庭照顧假', hours: balance.familyCare, color: '#9C27B0' },
      { name: '加班補休', hours: balance.compTimeOff, color: '#00BCD4' }
    ];
    
    const balanceBoxes = balanceContents.map(item => ({
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: item.name,
          size: 'sm',
          color: '#666666',
          align: 'center'
        },
        {
          type: 'text',
          text: `${item.hours}`,
          size: 'xl',
          weight: 'bold',
          color: item.color,
          align: 'center',
          margin: 'xs'
        },
        {
          type: 'text',
          text: '小時',
          size: 'xs',
          color: '#999999',
          align: 'center'
        }
      ],
      backgroundColor: '#F5F5F5',
      paddingAll: '12px',
      cornerRadius: '8px',
      flex: 1
    }));
    
    // 分成兩行顯示（每行3個）
    const row1 = balanceBoxes.slice(0, 3);
    const row2 = balanceBoxes.slice(3, 6);
    
    const message = {
      type: 'flex',
      altText: '假期餘額',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '假期餘額',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            },
            {
              type: 'text',
              text: employeeName,
              size: 'sm',
              color: '#FFFFFF',
              margin: 'xs'
            }
          ],
          backgroundColor: '#4CAF50',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '常用假別',
              size: 'md',
              weight: 'bold',
              color: '#333333',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              spacing: 'sm',
              contents: row1
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              spacing: 'sm',
              contents: row2
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: ' 其他假別',
                  weight: 'bold',
                  size: 'sm',
                  color: '#999999'
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  margin: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '婚假',
                      size: 'xs',
                      color: '#666666',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${balance.marriage} 小時`,
                      size: 'xs',
                      color: '#333333',
                      flex: 1,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  margin: 'xs',
                  contents: [
                    {
                      type: 'text',
                      text: '喪假',
                      size: 'xs',
                      color: '#666666',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${balance.bereavement} 小時`,
                      size: 'xs',
                      color: '#333333',
                      flex: 1,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  margin: 'xs',
                  contents: [
                    {
                      type: 'text',
                      text: '產假',
                      size: 'xs',
                      color: '#666666',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${balance.maternity} 小時`,
                      size: 'xs',
                      color: '#333333',
                      flex: 1,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  margin: 'xs',
                  contents: [
                    {
                      type: 'text',
                      text: '陪產假',
                      size: 'xs',
                      color: '#666666',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${balance.paternity} 小時`,
                      size: 'xs',
                      color: '#333333',
                      flex: 1,
                      align: 'end'
                    }
                  ]
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: ' 提醒：假期以小時為單位，8小時=1天',
              size: 'xs',
              color: '#999999',
              margin: 'lg',
              wrap: true,
              align: 'center'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: ' 查看完整假期資訊',
                uri: 'https://eric693.github.io/KING_LONG_check_manager/'
              }
            },
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'message',
                label: ' 我要請假',
                text: '請假申請'
              },
              color: '#4CAF50'
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 假期餘額已發送');
    
  } catch (error) {
    Logger.log(' sendLeaveBalance 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

// ==================== 主管審核功能 ====================

/**
 *  發送待審核請假申請（僅管理員）
 */
function sendPendingLeaveRequests(replyToken, userId, employeeName) {
  try {
    Logger.log(' 查詢待審核請假');
    Logger.log('   userId: ' + userId);
    
    // 取得員工資料
    const employee = findEmployeeByLineUserId_(userId);
    
    if (!employee.ok || employee.dept !== '管理員') {
      replyMessage(replyToken, ' 此功能僅限管理員使用');
      return;
    }
    
    // 取得待審核記錄
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('請假紀錄');
    
    if (!sheet) {
      replyMessage(replyToken, ' 請假記錄表不存在');
      return;
    }
    
    const values = sheet.getDataRange().getValues();
    const pendingRequests = [];
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][10]).trim() === 'PENDING') {
        pendingRequests.push({
          rowNumber: i + 1,
          employeeName: values[i][2],
          dept: values[i][3],
          leaveType: values[i][4],
          startDateTime: values[i][5],
          endDateTime: values[i][6],
          workHours: values[i][7],
          days: values[i][8],
          reason: values[i][9] || '',
          applyTime: formatLeaveDateTime(values[i][0])
        });
      }
    }
    
    Logger.log(`   找到 ${pendingRequests.length} 筆待審核`);
    
    if (pendingRequests.length === 0) {
      replyMessage(replyToken, ' 目前沒有待審核的請假申請');
      return;
    }
    
    // 限制顯示前 10 筆
    const displayRequests = pendingRequests.slice(0, 10);
    
    // 建立申請內容
    const requestContents = [];
    
    displayRequests.forEach((req, index) => {
      const leaveTypeName = getLeaveTypeName(req.leaveType);
      
      if (index > 0) {
        requestContents.push({
          type: 'separator',
          margin: 'lg'
        });
      }
      
      requestContents.push({
        type: 'box',
        layout: 'vertical',
        margin: index === 0 ? 'none' : 'lg',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: `${req.employeeName} - ${leaveTypeName}`,
                weight: 'bold',
                size: 'md',
                flex: 0,
                color: '#333333'
              }
            ]
          },
          {
            type: 'text',
            text: `部門：${req.dept}`,
            size: 'xs',
            color: '#666666',
            margin: 'xs'
          },
          {
            type: 'text',
            text: `時間：${formatLeaveDate(req.startDateTime)} ~ ${formatLeaveDate(req.endDateTime)}`,
            size: 'xs',
            color: '#666666',
            margin: 'xs',
            wrap: true
          },
          {
            type: 'text',
            text: `時數：${req.workHours}小時 (${req.days}天)`,
            size: 'xs',
            color: '#999999',
            margin: 'xs'
          },
          {
            type: 'text',
            text: `原因：${req.reason}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs',
            wrap: true
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                height: 'sm',
                action: {
                  type: 'message',
                  label: ' 核准',
                  text: `核准請假:${req.rowNumber}`
                },
                color: '#4CAF50',
                flex: 1
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: {
                  type: 'message',
                  label: ' 拒絕',
                  text: `拒絕請假:${req.rowNumber}`
                },
                flex: 1
              }
            ]
          }
        ]
      });
    });
    
    const message = {
      type: 'flex',
      altText: '待審核請假申請',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 待審核請假',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            },
            {
              type: 'text',
              text: `共 ${pendingRequests.length} 筆`,
              size: 'sm',
              color: '#FFFFFF',
              margin: 'xs'
            }
          ],
          backgroundColor: '#FF9800',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `顯示前 ${displayRequests.length} 筆`,
              size: 'xs',
              color: '#999999',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: requestContents
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ' 點擊按鈕即可快速審核',
              size: 'xs',
              color: '#999999',
              align: 'center'
            }
          ]
        }
      }
    };
    
    sendLineReply_(replyToken, [message]);
    Logger.log(' 待審核請假已發送');
    
  } catch (error) {
    Logger.log(' sendPendingLeaveRequests 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    replyMessage(replyToken, ' 查詢失敗，請稍後再試');
  }
}

/**
 *  處理請假審核
 */
function handleLeaveReview(replyToken, userId, employeeName, text) {
  try {
    Logger.log(' 處理請假審核');
    Logger.log('   text: ' + text);
    
    // 檢查權限
    const employee = findEmployeeByLineUserId_(userId);
    
    if (!employee.ok || employee.dept !== '管理員') {
      replyMessage(replyToken, ' 此功能僅限管理員使用');
      return;
    }
    
    // 解析指令
    let action, rowNumber;
    
    if (text.startsWith('核准請假:')) {
      action = 'approve';
      rowNumber = parseInt(text.replace('核准請假:', ''));
    } else if (text.startsWith('拒絕請假:')) {
      action = 'reject';
      rowNumber = parseInt(text.replace('拒絕請假:', ''));
    } else {
      replyMessage(replyToken, ' 無效的審核指令');
      return;
    }
    
    if (isNaN(rowNumber) || rowNumber < 2) {
      replyMessage(replyToken, ' 無效的行號');
      return;
    }
    
    Logger.log(`   action: ${action}`);
    Logger.log(`   rowNumber: ${rowNumber}`);
    
    // 取得請假記錄
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('請假紀錄');
    
    if (!sheet) {
      replyMessage(replyToken, ' 請假記錄表不存在');
      return;
    }
    
    const record = sheet.getRange(rowNumber, 1, 1, 14).getValues()[0];
    
    // 檢查狀態
    if (String(record[10]).trim() !== 'PENDING') {
      replyMessage(replyToken, ' 此申請已被審核過');
      return;
    }
    
    const requestUserId = record[1];
    const requestEmployeeName = record[2];
    const leaveType = record[4];
    const workHours = record[7];
    
    // 更新狀態
    const status = (action === 'approve') ? 'APPROVED' : 'REJECTED';
    
    sheet.getRange(rowNumber, 11).setValue(status);
    sheet.getRange(rowNumber, 12).setValue(employeeName);
    sheet.getRange(rowNumber, 13).setValue(new Date());
    
    Logger.log(` 審核狀態已更新: ${status}`);
    
    // 如果核准，扣除假期餘額
    if (action === 'approve') {
      Logger.log(' 開始扣除假期餘額...');
      
      const deductResult = deductLeaveBalanceByUserId(requestUserId, leaveType, workHours);
      
      if (!deductResult.ok) {
        Logger.log(' 扣除餘額失敗: ' + deductResult.msg);
        
        // 還原狀態
        sheet.getRange(rowNumber, 11).setValue('PENDING');
        
        replyMessage(replyToken, ` 審核失敗\n\n${deductResult.msg}`);
        return;
      }
      
      Logger.log(' 假期餘額扣除成功');
    }
    
    // 發送審核結果
    const leaveTypeName = getLeaveTypeName(leaveType);
    const resultText = action === 'approve' ? ' 已核准' : ' 已拒絕';
    
    replyMessage(
      replyToken,
      `${resultText}\n\n` +
      `員工：${requestEmployeeName}\n` +
      `假別：${leaveTypeName}\n` +
      `時數：${workHours} 小時\n\n` +
      (action === 'approve' ? '已扣除假期餘額' : '未扣除假期餘額')
    );
    
    Logger.log(' 審核完成');
    
  } catch (error) {
    Logger.log(' handleLeaveReview 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    replyMessage(replyToken, ' 審核失敗，請稍後再試');
  }
}

/**
 *  扣除假期餘額（使用 userId）
 */
function deductLeaveBalanceByUserId(userId, leaveType, hours) {
  try {
    Logger.log(' 扣除假期餘額');
    Logger.log(`   員工ID: ${userId}`);
    Logger.log(`   假別: ${leaveType}`);
    Logger.log(`   小時數: ${hours}`);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('假期餘額');
    
    if (!sheet) {
      return { ok: false, msg: '假期餘額表不存在' };
    }
    
    const values = sheet.getDataRange().getValues();
    
    const leaveTypeColumnMap = {
      'ANNUAL_LEAVE': 3,
      'SICK_LEAVE': 4,
      'PERSONAL_LEAVE': 5,
      'BEREAVEMENT_LEAVE': 6,
      'MARRIAGE_LEAVE': 7,
      'MATERNITY_LEAVE': 8,
      'PATERNITY_LEAVE': 9,
      'HOSPITALIZATION_LEAVE': 10,
      'MENSTRUAL_LEAVE': 11,
      'FAMILY_CARE_LEAVE': 12,
      'OFFICIAL_LEAVE': 13,
      'WORK_INJURY_LEAVE': 14,
      'NATURAL_DISASTER_LEAVE': 15,
      'COMP_TIME_OFF': 16
    };
    
    const columnIndex = leaveTypeColumnMap[leaveType];
    
    if (!columnIndex) {
      return { ok: false, msg: '無效的假別' };
    }
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === userId) {
        const currentBalance = values[i][columnIndex - 1];
        
        if (currentBalance < hours) {
          return {
            ok: false,
            msg: `餘額不足（需要 ${hours} 小時，只剩 ${currentBalance} 小時）`
          };
        }
        
        const newBalance = currentBalance - hours;
        
        sheet.getRange(i + 1, columnIndex).setValue(newBalance);
        sheet.getRange(i + 1, 18).setValue(new Date());
        
        Logger.log(' 餘額已更新');
        
        return { ok: true, remaining: newBalance };
      }
    }
    
    return { ok: false, msg: '找不到員工記錄' };
    
  } catch (error) {
    Logger.log(' deductLeaveBalanceByUserId 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

// ==================== 輔助函數 ====================

/**
 *  取得假別中文名稱
 */
function getLeaveTypeName(leaveType) {
  const names = {
    'ANNUAL_LEAVE': '特休假',
    'SICK_LEAVE': '病假',
    'PERSONAL_LEAVE': '事假',
    'BEREAVEMENT_LEAVE': '喪假',
    'MARRIAGE_LEAVE': '婚假',
    'MATERNITY_LEAVE': '產假',
    'PATERNITY_LEAVE': '陪產假',
    'HOSPITALIZATION_LEAVE': '住院病假',
    'MENSTRUAL_LEAVE': '生理假',
    'FAMILY_CARE_LEAVE': '家庭照顧假',
    'OFFICIAL_LEAVE': '公假',
    'WORK_INJURY_LEAVE': '公傷假',
    'NATURAL_DISASTER_LEAVE': '天然災害停班',
    'COMP_TIME_OFF': '加班補休'
  };
  
  return names[leaveType] || leaveType;
}

/**
 *  格式化請假日期時間
 */
function formatLeaveDateTime(dateTime) {
  if (!dateTime) return '';
  try {
    if (dateTime instanceof Date) {
      return Utilities.formatDate(dateTime, 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
    }
    return String(dateTime);
  } catch (e) {
    return String(dateTime);
  }
}

/**
 *  格式化請假日期（簡短版）
 */
function formatLeaveDate(dateTime) {
  if (!dateTime) return '';
  try {
    if (typeof dateTime === 'string') {
      // 如果是字串，取前 16 個字元（yyyy-MM-dd HH:mm）
      return dateTime.substring(0, 16);
    }
    if (dateTime instanceof Date) {
      return Utilities.formatDate(dateTime, 'Asia/Taipei', 'MM/dd HH:mm');
    }
    return String(dateTime).substring(0, 16);
  } catch (e) {
    return String(dateTime);
  }
}

/**
 *  使用截圖中的實際 userId 診斷
 */
function diagnoseWithCorrectUserId() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 使用正確的 userId 診斷');
  Logger.log('═══════════════════════════════════════');
  
  // ⭐ 從截圖複製的正確 userId
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const thisMonth = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  
  Logger.log(' 今天: ' + today);
  Logger.log(' 本月: ' + thisMonth);
  Logger.log(' 目標 userId: ' + userId);
  Logger.log(' 總行數: ' + values.length);
  Logger.log('');
  
  let todayCount = 0;
  let monthCount = 0;
  let allUserRecords = [];
  
  Logger.log(' 檢查所有記錄:');
  Logger.log('');
  
  for (let i = 1; i < values.length; i++) {
    const recordUserId = values[i][1];
    
    // 先檢查前幾行
    if (i <= 5) {
      Logger.log(`第 ${i + 1} 行 userId: "${recordUserId}"`);
      Logger.log(`   比對結果: ${recordUserId === userId ? ' 符合' : ' 不符'}`);
      Logger.log('');
    }
    
    if (recordUserId === userId) {
      const rawDate = values[i][0];
      const recordDate = new Date(rawDate);
      
      const formattedDate = Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM-dd');
      const formattedMonth = Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM');
      
      allUserRecords.push({
        row: i + 1,
        date: formattedDate,
        month: formattedMonth,
        type: values[i][4]
      });
      
      if (formattedDate === today) todayCount++;
      if (formattedMonth === thisMonth) monthCount++;
    }
  }
  
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 統計結果:');
  Logger.log(`   該 userId 總記錄數: ${allUserRecords.length}`);
  Logger.log(`   今日記錄數: ${todayCount}`);
  Logger.log(`   本月記錄數: ${monthCount}`);
  Logger.log('');
  
  if (allUserRecords.length > 0) {
    Logger.log(' 所有記錄:');
    allUserRecords.forEach(r => {
      Logger.log(`   第 ${r.row} 行: ${r.date} - ${r.type}`);
    });
  } else {
    Logger.log(' 沒有找到任何記錄！');
    Logger.log('');
    Logger.log(' 讓我們檢查 userId 是否完全一致:');
    Logger.log(`   目標 userId 長度: ${userId.length}`);
    
    // 檢查前 3 行的 userId
    for (let i = 1; i <= 3 && i < values.length; i++) {
      const cellUserId = values[i][1];
      Logger.log(`   第 ${i + 1} 行 userId: "${cellUserId}"`);
      Logger.log(`   長度: ${String(cellUserId).length}`);
      Logger.log(`   相等? ${cellUserId === userId}`);
      
      // 字元比對
      if (cellUserId && userId) {
        let diffFound = false;
        for (let j = 0; j < Math.max(String(cellUserId).length, userId.length); j++) {
          if (String(cellUserId)[j] !== userId[j]) {
            Logger.log(`    第 ${j} 個字元不同: "${String(cellUserId)[j]}" vs "${userId[j]}"`);
            diffFound = true;
          }
        }
        if (!diffFound && cellUserId !== userId) {
          Logger.log('    字元都相同但不相等，可能有隱藏字元');
        }
      }
    }
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 * 檢查打卡位置是否有效
 */
function checkPunchLocation(lat, lng) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOCATIONS);
    const lastRow = sheet.getLastRow();
    
    if (lastRow < 2) {
      return {
        valid: false,
        reason: '系統尚未設定打卡地點',
        nearestLocation: null
      };
    }
    
    const locations = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    
    let nearestLocation = null;
    let minDistance = Infinity;
    let validLocation = null;
    
    for (let [, name, locLat, locLng, radius] of locations) {
      if (!name || !locLat || !locLng) continue;
      
      const distance = getDistanceMeters_(lat, lng, Number(locLat), Number(locLng));
      
      // 記錄最近的地點
      if (distance < minDistance) {
        minDistance = distance;
        nearestLocation = {
          name: name,
          distance: Math.round(distance)
        };
      }
      
      // 檢查是否在範圍內
      if (distance <= Number(radius)) {
        validLocation = {
          valid: true,
          locationName: name,
          distance: Math.round(distance)
        };
        break;
      }
    }
    
    if (validLocation) {
      return validLocation;
    } else {
      return {
        valid: false,
        reason: '您不在任何打卡地點範圍內',
        nearestLocation: nearestLocation
      };
    }
    
  } catch (error) {
    Logger.log(' checkPunchLocation 錯誤: ' + error);
    return {
      valid: false,
      reason: '位置檢查失敗',
      nearestLocation: null
    };
  }
}
