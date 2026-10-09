// WorklogOperations.gs - 工作日誌核心功能

// ==================== 常數定義 ====================
const SHEET_WORKLOG = '工作日誌';

const WORKLOG_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

// ==================== 工作表初始化 ====================

/**
 * 取得工作日誌工作表
 */
function getWorklogSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_WORKLOG);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_WORKLOG);
    
    // 設定標題列
    const headers = [
      '日誌ID',        // A (0)
      '員工ID',        // B (1)
      '員工姓名',      // C (2)
      '部門',          // D (3)
      '工作日期',      // E (4)
      '工作時數',      // F (5)
      '工作內容',      // G (6)
      '狀態',          // H (7)
      '提交時間',      // I (8)
      '審核人',        // J (9)
      '審核時間',      // K (10)
      '審核意見'       // L (11)
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 格式化標題列
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4')
               .setFontColor('#ffffff')
               .setFontWeight('bold')
               .setHorizontalAlignment('center');
    
    // 凍結標題列
    sheet.setFrozenRows(1);
    
    Logger.log(' 工作日誌工作表已建立');
  }
  
  return sheet;
}

// ==================== 新增工作日誌 ====================

/**
 *  提交工作日誌
 */
function submitWorklog(userId, userName, department, date, hours, content) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始提交工作日誌');
    Logger.log('   員工: ' + userName);
    Logger.log('   日期: ' + date);
    Logger.log('   時數: ' + hours);
    Logger.log('═══════════════════════════════════════');
    
    // 驗證必填欄位
    if (!userId || !date || !hours || !content) {
      Logger.log(' 缺少必填欄位');
      return { success: false, message: '缺少必填欄位' };
    }
    
    // 驗證工作時數
    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      Logger.log(' 工作時數無效');
      return { success: false, message: '工作時數必須在 0.5 ~ 24 小時之間' };
    }
    
    // 驗證工作內容長度
    if (content.trim().length < 10) {
      Logger.log(' 工作內容太短');
      return { success: false, message: '工作內容至少需要 10 個字' };
    }
    
    // 檢查是否已有相同日期的待審核日誌
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === userId && 
          data[i][4] === date && 
          data[i][7] === WORKLOG_STATUS.PENDING) {
        Logger.log(' 該日期已有待審核的工作日誌');
        return { success: false, message: '該日期已有待審核的工作日誌，請先撤回或等待審核' };
      }
    }
    
    // 生成日誌ID
    const worklogId = 'WL_' + Date.now();
    const submittedAt = new Date().toISOString();
    
    // 新增工作日誌
    const newRow = [
      worklogId,                    // A: 日誌ID
      userId,                       // B: 員工ID
      userName,                     // C: 員工姓名
      department,                   // D: 部門
      date,                         // E: 工作日期
      hoursNum,                     // F: 工作時數
      content.trim(),               // G: 工作內容
      WORKLOG_STATUS.PENDING,       // H: 狀態
      submittedAt,                  // I: 提交時間
      '',                           // J: 審核人
      '',                           // K: 審核時間
      ''                            // L: 審核意見
    ];
    
    sheet.appendRow(newRow);
    
    Logger.log(' 工作日誌提交成功');
    Logger.log('   日誌ID: ' + worklogId);
    Logger.log('═══════════════════════════════════════');
    
    return {
      success: true,
      message: '工作日誌提交成功',
      worklogId: worklogId
    };
    
  } catch (error) {
    Logger.log(' submitWorklog 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}

// ==================== 查詢工作日誌 ====================

/**
 *  取得員工的工作日誌列表
 */
function getWorklogs(userId, limit = 30) {
  try {
    Logger.log(' 查詢工作日誌: ' + userId);
    
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    const worklogs = [];
    
    // 跳過標題列，從第 2 列開始
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === userId) {
        worklogs.push({
          id: data[i][0],
          userId: data[i][1],
          userName: data[i][2],
          department: data[i][3],
          date: data[i][4],
          hours: data[i][5],
          content: data[i][6],
          status: data[i][7],
          submittedAt: data[i][8],
          reviewedBy: data[i][9],
          reviewedAt: data[i][10],
          reviewComment: data[i][11]
        });
      }
    }
    
    // 按提交時間降序排列
    worklogs.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
    // 限制回傳筆數
    const limitedWorklogs = worklogs.slice(0, limit);
    
    Logger.log(' 找到 ' + worklogs.length + ' 筆工作日誌');
    
    return {
      success: true,
      worklogs: limitedWorklogs,
      total: worklogs.length
    };
    
  } catch (error) {
    Logger.log(' getWorklogs 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}

/**
 *  取得單筆工作日誌詳情
 */
function getWorklogDetail(worklogId) {
  try {
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === worklogId) {
        return {
          success: true,
          worklog: {
            id: data[i][0],
            userId: data[i][1],
            userName: data[i][2],
            department: data[i][3],
            date: data[i][4],
            hours: data[i][5],
            content: data[i][6],
            status: data[i][7],
            submittedAt: data[i][8],
            reviewedBy: data[i][9],
            reviewedAt: data[i][10],
            reviewComment: data[i][11]
          }
        };
      }
    }
    
    return { success: false, message: '找不到工作日誌' };
    
  } catch (error) {
    Logger.log(' getWorklogDetail 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}

// ==================== 管理員功能 ====================

/**
 *  取得所有待審核的工作日誌
 */
function getPendingWorklogs() {
  try {
    Logger.log(' 查詢待審核工作日誌');
    
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    const pendingWorklogs = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][7] === WORKLOG_STATUS.PENDING) {
        pendingWorklogs.push({
          rowNumber: i + 1,
          id: data[i][0],
          userId: data[i][1],
          userName: data[i][2],
          department: data[i][3],
          date: data[i][4],
          hours: data[i][5],
          content: data[i][6],
          status: data[i][7],
          submittedAt: data[i][8]
        });
      }
    }
    
    // 按提交時間升序排列（最早的在前）
    pendingWorklogs.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    
    Logger.log(' 找到 ' + pendingWorklogs.length + ' 筆待審核工作日誌');
    
    return {
      success: true,
      worklogs: pendingWorklogs,
      total: pendingWorklogs.length
    };
    
  } catch (error) {
    Logger.log(' getPendingWorklogs 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}

/**
 *  審核工作日誌（核准/拒絕）
 */
function reviewWorklog(worklogId, action, reviewerId, reviewerName, comment) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 審核工作日誌');
    Logger.log('   日誌ID: ' + worklogId);
    Logger.log('   動作: ' + action);
    Logger.log('   審核人: ' + reviewerName);
    Logger.log('═══════════════════════════════════════');
    
    if (action !== 'approve' && action !== 'reject') {
      Logger.log(' 無效的審核動作');
      return { success: false, message: '無效的審核動作' };
    }
    
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    
    // 找到對應的工作日誌
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === worklogId) {
        
        // 檢查狀態
        if (data[i][7] !== WORKLOG_STATUS.PENDING) {
          Logger.log(' 該工作日誌已審核');
          return { success: false, message: '該工作日誌已審核，無法重複審核' };
        }
        
        const newStatus = action === 'approve' ? WORKLOG_STATUS.APPROVED : WORKLOG_STATUS.REJECTED;
        const reviewedAt = new Date().toISOString();
        
        // 更新審核結果
        sheet.getRange(i + 1, 8).setValue(newStatus);           // H: 狀態
        sheet.getRange(i + 1, 10).setValue(reviewerName);       // J: 審核人
        sheet.getRange(i + 1, 11).setValue(reviewedAt);         // K: 審核時間
        sheet.getRange(i + 1, 12).setValue(comment || '');      // L: 審核意見
        
        Logger.log(' 工作日誌審核完成');
        Logger.log('   新狀態: ' + newStatus);
        Logger.log('═══════════════════════════════════════');
        
        return {
          success: true,
          message: action === 'approve' ? '工作日誌已核准' : '工作日誌已拒絕'
        };
      }
    }
    
    Logger.log(' 找不到工作日誌');
    return { success: false, message: '找不到工作日誌' };
    
  } catch (error) {
    Logger.log(' reviewWorklog 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}

/**
 *  核准工作日誌（便捷函數）
 */
function approveWorklog(worklogId, reviewerId, reviewerName, comment) {
  return reviewWorklog(worklogId, 'approve', reviewerId, reviewerName, comment);
}

/**
 *  拒絕工作日誌（便捷函數）
 */
function rejectWorklog(worklogId, reviewerId, reviewerName, comment) {
  return reviewWorklog(worklogId, 'reject', reviewerId, reviewerName, comment);
}

// ==================== 報表功能 ====================

/**
 *  完全修正版：取得員工指定月份的工作日誌報表
 * 修正：正確處理日期物件格式
 */
function getWorklogReport(employeeId, yearMonth) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 查詢工作日誌報表');
    Logger.log('   員工ID: "' + employeeId + '"');
    Logger.log('   年月: "' + yearMonth + '"');
    Logger.log('═══════════════════════════════════════');
    
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    const worklogs = [];
    let totalHours = 0;
    let approvedHours = 0;
    
    // 解析目標年月
    const [targetYear, targetMonth] = yearMonth.split('-').map(Number);
    
    Logger.log('\n 開始搜尋資料...');
    Logger.log('   目標年份: ' + targetYear);
    Logger.log('   目標月份: ' + targetMonth);
    Logger.log('   總行數（含標題）: ' + data.length);
    
    for (let i = 1; i < data.length; i++) {
      // ⭐ 處理員工ID
      const rowUserId = String(data[i][1]).trim();
      
      // ⭐ 關鍵修正：處理日期物件
      const worklogDateRaw = data[i][4];
      let worklogYear, worklogMonth, worklogDay;
      let formattedDate;
      
      if (worklogDateRaw instanceof Date) {
        // 如果是日期物件
        worklogYear = worklogDateRaw.getFullYear();
        worklogMonth = worklogDateRaw.getMonth() + 1;  // getMonth() 回傳 0-11
        worklogDay = worklogDateRaw.getDate();
        formattedDate = worklogYear + '-' + 
                       String(worklogMonth).padStart(2, '0') + '-' + 
                       String(worklogDay).padStart(2, '0');
      } else if (typeof worklogDateRaw === 'string') {
        // 如果是字串，嘗試解析
        try {
          const dateObj = new Date(worklogDateRaw);
          worklogYear = dateObj.getFullYear();
          worklogMonth = dateObj.getMonth() + 1;
          worklogDay = dateObj.getDate();
          formattedDate = worklogYear + '-' + 
                         String(worklogMonth).padStart(2, '0') + '-' + 
                         String(worklogDay).padStart(2, '0');
        } catch (e) {
          Logger.log(' 無法解析日期: ' + worklogDateRaw);
          continue;
        }
      } else {
        Logger.log(' 未知的日期格式');
        continue;
      }
      
      // 檢查員工ID是否匹配
      const employeeMatch = (rowUserId === employeeId);
      
      // 檢查年月是否匹配
      const monthMatch = (worklogYear === targetYear && worklogMonth === targetMonth);
      
      // 除錯輸出（只輸出前幾筆）
      if (i <= 3) {
        Logger.log(`\n   列 ${i}:`);
        Logger.log(`     原始日期: ${worklogDateRaw}`);
        Logger.log(`     格式化: ${formattedDate}`);
        Logger.log(`     年月: ${worklogYear}-${worklogMonth}`);
        Logger.log(`     員工ID: "${rowUserId}" ${employeeMatch ? '匹配' : '不匹配'}`);
        Logger.log(`     月份: ${monthMatch ? '匹配' : '不匹配'}`);
      }
      
      // 如果員工ID和月份都匹配，加入結果
      if (employeeMatch && monthMatch) {
        const worklog = {
          id: data[i][0],
          date: formattedDate,  // ⭐ 使用格式化後的日期
          hours: parseFloat(data[i][5]) || 0,
          content: data[i][6],
          status: data[i][7],
          submittedAt: data[i][8],
          reviewedBy: data[i][9],
          reviewedAt: data[i][10],
          reviewComment: data[i][11]
        };
        
        worklogs.push(worklog);
        totalHours += worklog.hours;
        
        if (worklog.status === 'APPROVED') {
          approvedHours += worklog.hours;
        }
        
        Logger.log(`    找到匹配: ${formattedDate} (${worklog.hours}小時)`);
      }
    }
    
    // 按日期排序
    worklogs.sort((a, b) => a.date.localeCompare(b.date));
    
    Logger.log('\n 查詢結果:');
    Logger.log('   找到工作日誌: ' + worklogs.length + ' 筆');
    Logger.log('   總工時: ' + totalHours + ' 小時');
    Logger.log('   已核准工時: ' + approvedHours + ' 小時');
    Logger.log('═══════════════════════════════════════');
    
    return {
      success: true,
      worklogs: worklogs,
      summary: {
        total: worklogs.length,
        totalHours: totalHours,
        approvedHours: approvedHours,
        pendingHours: totalHours - approvedHours
      }
    };
    
  } catch (error) {
    Logger.log(' getWorklogReport 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    return { success: false, message: error.message };
  }
}
// ==================== 測試函數 ====================

/**
 *  取得所有員工指定月份的工作日誌報表
 */
function getAllWorklogReport(yearMonth) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 查詢全部員工工作日誌報表');
    Logger.log('   年月: "' + yearMonth + '"');
    Logger.log('═══════════════════════════════════════');
    
    const sheet = getWorklogSheet();
    const data = sheet.getDataRange().getValues();
    const worklogs = [];
    
    // 解析目標年月
    const [targetYear, targetMonth] = yearMonth.split('-').map(Number);
    
    Logger.log('\n 開始搜尋資料...');
    Logger.log('   目標年份: ' + targetYear);
    Logger.log('   目標月份: ' + targetMonth);
    
    for (let i = 1; i < data.length; i++) {
      // 處理日期
      const worklogDateRaw = data[i][4];
      let worklogYear, worklogMonth, worklogDay;
      let formattedDate;
      
      if (worklogDateRaw instanceof Date) {
        worklogYear = worklogDateRaw.getFullYear();
        worklogMonth = worklogDateRaw.getMonth() + 1;
        worklogDay = worklogDateRaw.getDate();
        formattedDate = worklogYear + '-' + 
                       String(worklogMonth).padStart(2, '0') + '-' + 
                       String(worklogDay).padStart(2, '0');
      } else if (typeof worklogDateRaw === 'string') {
        try {
          const dateObj = new Date(worklogDateRaw);
          worklogYear = dateObj.getFullYear();
          worklogMonth = dateObj.getMonth() + 1;
          worklogDay = dateObj.getDate();
          formattedDate = worklogYear + '-' + 
                         String(worklogMonth).padStart(2, '0') + '-' + 
                         String(worklogDay).padStart(2, '0');
        } catch (e) {
          continue;
        }
      } else {
        continue;
      }
      
      // 檢查年月是否匹配
      if (worklogYear === targetYear && worklogMonth === targetMonth) {
        worklogs.push({
          id: data[i][0],
          userId: data[i][1],
          userName: data[i][2],
          department: data[i][3],
          date: formattedDate,
          hours: parseFloat(data[i][5]) || 0,
          content: data[i][6],
          status: data[i][7],
          submittedAt: data[i][8],
          reviewedBy: data[i][9],
          reviewedAt: data[i][10],
          reviewComment: data[i][11]
        });
      }
    }
    
    // 按員工姓名和日期排序
    worklogs.sort((a, b) => {
      if (a.userName !== b.userName) {
        return a.userName.localeCompare(b.userName);
      }
      return a.date.localeCompare(b.date);
    });
    
    Logger.log('\n 查詢結果:');
    Logger.log('   找到工作日誌: ' + worklogs.length + ' 筆');
    Logger.log('═══════════════════════════════════════');
    
    return {
      success: true,
      worklogs: worklogs,
      total: worklogs.length
    };
    
  } catch (error) {
    Logger.log(' getAllWorklogReport 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}
// ==================== 修改與刪除工作日誌 ====================
//
// 前端一直有「編輯」與「刪除」按鈕，但後端缺這兩支，呼叫 updateWorklog /
// deleteWorklog 會落到 doGet 的預設分支。這裡補上。
//
// 規則：只有本人能改自己的日誌，而且必須還在待審核狀態；已核准或已退回的
// 要改就得走審核流程，不能自己偷偷蓋掉。

/**
 * 找出某筆工作日誌所在的列，回傳 { rowIndex, row }，找不到回傳 null
 */
function findWorklogRow_(sheet, worklogId) {
  const data = sheet.getDataRange().getValues();
  const targetId = String(worklogId || '').trim();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === targetId) {
      return { rowIndex: i + 1, row: data[i] };
    }
  }

  return null;
}

/**
 *  更新工作日誌（限本人、限待審核）
 */
function updateWorklog(worklogId, userId, date, hours, content) {
  try {
    Logger.log(` 更新工作日誌: ${worklogId}`);

    const hoursNum = parseFloat(hours);
    if (!date || isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      return { success: false, message: '工作日期或時數不正確' };
    }
    if (!content || String(content).trim().length < 10) {
      return { success: false, message: '工作內容請至少填寫 10 個字' };
    }

    const sheet = getWorklogSheet();
    const found = findWorklogRow_(sheet, worklogId);

    if (!found) {
      return { success: false, message: '找不到這筆工作日誌' };
    }
    if (String(found.row[1]).trim() !== String(userId).trim()) {
      return { success: false, message: '只能修改自己的工作日誌' };
    }
    if (found.row[7] !== WORKLOG_STATUS.PENDING) {
      return { success: false, message: '已審核的工作日誌不能修改' };
    }

    // 只動日期、時數、內容，審核欄位維持原狀
    sheet.getRange(found.rowIndex, 5).setValue(date);
    sheet.getRange(found.rowIndex, 6).setValue(hoursNum);
    sheet.getRange(found.rowIndex, 7).setValue(String(content).trim());

    Logger.log(' 工作日誌已更新');

    return { success: true, message: '工作日誌更新成功' };

  } catch (error) {
    Logger.log(' updateWorklog 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}

/**
 *  刪除工作日誌（限本人、限待審核；管理員不受限制）
 */
function deleteWorklog(worklogId, userId, isAdmin) {
  try {
    Logger.log(` 刪除工作日誌: ${worklogId}`);

    const sheet = getWorklogSheet();
    const found = findWorklogRow_(sheet, worklogId);

    if (!found) {
      return { success: false, message: '找不到這筆工作日誌' };
    }

    if (!isAdmin) {
      if (String(found.row[1]).trim() !== String(userId).trim()) {
        return { success: false, message: '只能刪除自己的工作日誌' };
      }
      if (found.row[7] !== WORKLOG_STATUS.PENDING) {
        return { success: false, message: '已審核的工作日誌不能刪除' };
      }
    }

    sheet.deleteRow(found.rowIndex);

    Logger.log(' 工作日誌已刪除');

    return { success: true, message: '工作日誌已刪除' };

  } catch (error) {
    Logger.log(' deleteWorklog 錯誤: ' + error);
    return { success: false, message: error.message };
  }
}
