/**
 * Google Apps Script - 営業KPIダッシュボードAPI
 */

// メイン関数: GETリクエストを処理
function doGet(e) {
  try {
    const type = e && e.parameter && e.parameter.type ? e.parameter.type : 'monthly';
    let data;

    switch (type) {
      case 'monthly':
        data = getMonthlyViewData();
        break;
      case 'rawdata':
        data = getRawData(e.parameter);
        break;
      case 'settings':
        data = getSettings();
        break;
      case 'pipeline':
        data = getPipelineData();
        break;
      default:
        data = getMonthlyViewData();
    }

    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// POSTリクエストを処理（設定保存用）
function doPost(e) {
  try {
    const requestBody = JSON.parse(e.postData.contents);
    const type = requestBody.type || 'settings';

    if (type === 'settings') {
      saveSettings(requestBody.data);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unknown type' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// スプレッドシートID
const SPREADSHEET_ID = '1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM';

// 月次ビューのデータを取得
function getMonthlyViewData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('月次ビュー');
  const data = sheet.getDataRange().getValues();

  // ヘッダー情報（2行目）を取得
  const headerRow = data[1];
  const standardProgress = parsePercentage(headerRow[3]);
  const elapsedDays = extractNumber(headerRow[4]);
  const totalDays = extractTotalDays(headerRow[4]);
  const backTarget = parsePercentage(headerRow[15]);

  // 担当者別のデータ（5行目から）
  const members = [];

  for (let i = 4; i < data.length; i++) {
    const row = data[i];

    // 空行または合計行をスキップ
    if (!row[1] || row[1] === '' || row[1] === '計' || String(row[1]).includes('計（')) {
      continue;
    }

    // 担当者名からメンション記号を除去
    const rawName = row[1];
    const name = String(rawName).replace(/@/g, '').split('/')[0].trim();

    members.push({
      name: name,
      fullName: rawName,
      project: row[2] || '',
      callPace: parsePercentage(row[3]),
      appointmentPace: parsePercentage(row[4]),
      sales: parseCurrency(row[5]),
      targetCalls: parseNumber(row[6]),
      actualCalls: parseNumber(row[7]),
      callProgress: parsePercentage(row[8]),
      targetAppointments: parseNumber(row[9]),
      actualAppointments: parseNumber(row[10]),
      appointmentProgress: parsePercentage(row[11]),
      actualPR: parseNumber(row[12]),
      callsPerHourTarget: parseNumber(row[13]),
      callsPerHourActual: parseNumber(row[14]),
      callToAppointmentTarget: parsePercentage(row[15]),
      callToAppointmentActual: parsePercentage(row[16]),
      callToAnswer: parsePercentage(row[17]),
      answerToAppointment: parsePercentage(row[18]),
      workHoursTarget: parseNumber(row[19]),
      workHoursActual: parseNumber(row[20])
    });
  }

  // 合計データを取得
  let totalSales = 0, totalCalls = 0, totalAppointments = 0, targetCalls = 0, targetAppointments = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i][1] === '計') {
      totalSales = parseCurrency(data[i][5]);
      targetCalls = parseNumber(data[i][6]);
      totalCalls = parseNumber(data[i][7]);
      targetAppointments = parseNumber(data[i][9]);
      totalAppointments = parseNumber(data[i][10]);
      break;
    }
  }

  // 拡張合計
  let extendedTotalSales = totalSales;
  for (let i = 0; i < data.length; i++) {
    if (data[i][1] && String(data[i][1]).includes('計（')) {
      extendedTotalSales = parseCurrency(data[i][5]);
      break;
    }
  }

  return {
    metadata: {
      lastUpdated: new Date().toISOString(),
      sheetName: '月次ビュー',
      standardProgress: standardProgress,
      elapsedDays: elapsedDays,
      totalDays: totalDays,
      backTarget: backTarget
    },
    summary: {
      totalSales: totalSales,
      extendedTotalSales: extendedTotalSales,
      totalCalls: totalCalls,
      targetCalls: targetCalls,
      totalAppointments: totalAppointments,
      targetAppointments: targetAppointments,
      callProgressRate: targetCalls > 0 ? Math.round(totalCalls / targetCalls * 10000) / 100 : 0,
      appointmentProgressRate: targetAppointments > 0 ? Math.round(totalAppointments / targetAppointments * 10000) / 100 : 0
    },
    members: members
  };
}

// ユーティリティ関数
function parsePercentage(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Math.round(value * 10000) / 100;
  const str = String(value).replace('%', '').trim();
  return parseFloat(str) || 0;
}

function parseCurrency(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[¥,]/g, '').trim();
  return parseInt(str) || 0;
}

function parseNumber(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  return parseFloat(str) || 0;
}

function extractNumber(text) {
  if (!text) return 0;
  const match = String(text).match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function extractTotalDays(text) {
  if (!text) return 0;
  const match = String(text).match(/全(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// テスト用関数
function testGetData() {
  const result = getMonthlyViewData();
  Logger.log(JSON.stringify(result, null, 2));
}

// ========================================
// 実績rawdataからの集計
// ========================================

function getRawData(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('実績rawdata');
  const data = sheet.getDataRange().getValues();

  // ヘッダーをスキップ（1行目）
  const rows = data.slice(1);

  // 日付フィルター
  const startDate = params && params.startDate ? new Date(params.startDate) : null;
  const endDate = params && params.endDate ? new Date(params.endDate) : null;

  // データを処理
  const records = [];
  const projectSet = new Set();
  const memberSet = new Set();

  rows.forEach(row => {
    if (!row[0]) return; // 空行スキップ

    const rawName = String(row[0]).replace(/@/g, '').split('/')[0].trim();
    const project = row[1] || '';
    const dateValue = row[2];
    const callTime = parseNumber(row[3]) || 0;
    const calls = parseNumber(row[4]) || 0;
    const pr = parseNumber(row[5]) || 0;
    const appo = parseNumber(row[6]) || 0;

    // 日付パース
    let recordDate = null;
    if (dateValue instanceof Date) {
      recordDate = dateValue;
    } else if (dateValue) {
      recordDate = new Date(dateValue);
    }

    // 日付フィルタリング
    if (startDate && recordDate && recordDate < startDate) return;
    if (endDate && recordDate && recordDate > endDate) return;

    projectSet.add(project);
    memberSet.add(rawName);

    records.push({
      name: rawName,
      project: project,
      date: recordDate ? Utilities.formatDate(recordDate, 'Asia/Tokyo', 'yyyy-MM-dd') : null,
      callTime: callTime,
      calls: calls,
      pr: pr,
      appo: appo
    });
  });

  // 集計データを計算
  const aggregated = aggregateData(records);

  // 先月比・通算比を計算
  const allRecords = getAllRawRecords();
  const comparisons = calculateComparisons(aggregated, allRecords, startDate, endDate);

  // 前月の日別データを取得（月次比較用）
  const previousMonthDaily = getPreviousMonthDaily(allRecords, startDate, endDate);

  return {
    records: records,
    aggregated: aggregated,
    comparisons: comparisons,
    previousMonthDaily: previousMonthDaily,
    filters: {
      projects: Array.from(projectSet).sort(),
      members: Array.from(memberSet).sort()
    }
  };
}

// 前月の日別データを取得
function getPreviousMonthDaily(allRecords, startDate, endDate) {
  // 当月の範囲を決定
  let currentStart, currentEnd;

  if (startDate && endDate) {
    currentStart = new Date(startDate);
    currentEnd = new Date(endDate);
  } else {
    // デフォルトは今月
    const now = new Date();
    currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  // 前月の範囲を計算
  const prevStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
  const prevEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0);

  // 前月のレコードをフィルタ
  const prevRecords = allRecords.filter(r => {
    if (!r.date) return false;
    return r.date >= prevStart && r.date <= prevEnd;
  });

  // 日別集計
  const dailyMap = {};
  prevRecords.forEach(r => {
    const day = r.date.getDate(); // 日のみ（1-31）
    if (!dailyMap[day]) {
      dailyMap[day] = { calls: 0, pr: 0, appo: 0, callTime: 0 };
    }
    dailyMap[day].calls += r.calls;
    dailyMap[day].pr += r.pr;
    dailyMap[day].appo += r.appo;
    dailyMap[day].callTime += r.callTime;
  });

  // 1日〜31日の配列に変換
  const result = [];
  for (let day = 1; day <= 31; day++) {
    const d = dailyMap[day] || { calls: 0, pr: 0, appo: 0, callTime: 0 };
    result.push({
      day: day,
      calls: d.calls,
      pr: d.pr,
      appo: d.appo,
      callTime: d.callTime,
      callToPR: d.calls > 0 ? Math.round(d.pr / d.calls * 10000) / 100 : 0,
      prToAppo: d.pr > 0 ? Math.round(d.appo / d.pr * 10000) / 100 : 0,
      callToAppo: d.calls > 0 ? Math.round(d.appo / d.calls * 10000) / 100 : 0,
      callsPerHour: d.callTime > 0 ? Math.round(d.calls / d.callTime * 10) / 10 : 0
    });
  }

  return {
    month: Utilities.formatDate(prevStart, 'Asia/Tokyo', 'yyyy-MM'),
    daily: result
  };
}

// 全rawdataレコードを取得（比較計算用）
function getAllRawRecords() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('実績rawdata');
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1);

  const records = [];
  rows.forEach(row => {
    if (!row[0]) return;

    const rawName = String(row[0]).replace(/@/g, '').split('/')[0].trim();
    const dateValue = row[2];
    let recordDate = null;
    if (dateValue instanceof Date) {
      recordDate = dateValue;
    } else if (dateValue) {
      recordDate = new Date(dateValue);
    }

    records.push({
      name: rawName,
      project: row[1] || '',
      date: recordDate,
      callTime: parseNumber(row[3]) || 0,
      calls: parseNumber(row[4]) || 0,
      pr: parseNumber(row[5]) || 0,
      appo: parseNumber(row[6]) || 0
    });
  });

  return records;
}

// データを集計
function aggregateData(records) {
  let totalCalls = 0, totalPR = 0, totalAppo = 0, totalCallTime = 0;

  // 日別集計
  const dailyMap = {};
  // 案件別集計
  const projectMap = {};
  // 担当者別集計
  const memberMap = {};

  records.forEach(r => {
    totalCalls += r.calls;
    totalPR += r.pr;
    totalAppo += r.appo;
    totalCallTime += r.callTime;

    // 日別
    if (r.date) {
      if (!dailyMap[r.date]) {
        dailyMap[r.date] = { calls: 0, pr: 0, appo: 0, callTime: 0 };
      }
      dailyMap[r.date].calls += r.calls;
      dailyMap[r.date].pr += r.pr;
      dailyMap[r.date].appo += r.appo;
      dailyMap[r.date].callTime += r.callTime;
    }

    // 案件別
    if (r.project) {
      if (!projectMap[r.project]) {
        projectMap[r.project] = { calls: 0, pr: 0, appo: 0, callTime: 0 };
      }
      projectMap[r.project].calls += r.calls;
      projectMap[r.project].pr += r.pr;
      projectMap[r.project].appo += r.appo;
      projectMap[r.project].callTime += r.callTime;
    }

    // 担当者別
    if (r.name) {
      if (!memberMap[r.name]) {
        memberMap[r.name] = { calls: 0, pr: 0, appo: 0, callTime: 0 };
      }
      memberMap[r.name].calls += r.calls;
      memberMap[r.name].pr += r.pr;
      memberMap[r.name].appo += r.appo;
      memberMap[r.name].callTime += r.callTime;
    }
  });

  // 率を計算
  const callToPR = totalCalls > 0 ? Math.round(totalPR / totalCalls * 10000) / 100 : 0;
  const prToAppo = totalPR > 0 ? Math.round(totalAppo / totalPR * 10000) / 100 : 0;
  const callToAppo = totalCalls > 0 ? Math.round(totalAppo / totalCalls * 10000) / 100 : 0;
  const callsPerHour = totalCallTime > 0 ? Math.round(totalCalls / totalCallTime * 10) / 10 : 0;

  return {
    totals: {
      calls: totalCalls,
      pr: totalPR,
      appo: totalAppo,
      callTime: totalCallTime,
      callToPR: callToPR,
      prToAppo: prToAppo,
      callToAppo: callToAppo,
      callsPerHour: callsPerHour
    },
    daily: Object.keys(dailyMap).sort().map(date => ({
      date: date,
      ...dailyMap[date],
      callToPR: dailyMap[date].calls > 0 ? Math.round(dailyMap[date].pr / dailyMap[date].calls * 10000) / 100 : 0,
      prToAppo: dailyMap[date].pr > 0 ? Math.round(dailyMap[date].appo / dailyMap[date].pr * 10000) / 100 : 0,
      callToAppo: dailyMap[date].calls > 0 ? Math.round(dailyMap[date].appo / dailyMap[date].calls * 10000) / 100 : 0,
      callsPerHour: dailyMap[date].callTime > 0 ? Math.round(dailyMap[date].calls / dailyMap[date].callTime * 10) / 10 : 0
    })),
    byProject: Object.keys(projectMap).map(project => ({
      project: project,
      ...projectMap[project],
      callToPR: projectMap[project].calls > 0 ? Math.round(projectMap[project].pr / projectMap[project].calls * 10000) / 100 : 0,
      prToAppo: projectMap[project].pr > 0 ? Math.round(projectMap[project].appo / projectMap[project].pr * 10000) / 100 : 0,
      callToAppo: projectMap[project].calls > 0 ? Math.round(projectMap[project].appo / projectMap[project].calls * 10000) / 100 : 0,
      callsPerHour: projectMap[project].callTime > 0 ? Math.round(projectMap[project].calls / projectMap[project].callTime * 10) / 10 : 0
    })),
    byMember: Object.keys(memberMap).map(name => ({
      name: name,
      ...memberMap[name],
      callToPR: memberMap[name].calls > 0 ? Math.round(memberMap[name].pr / memberMap[name].calls * 10000) / 100 : 0,
      prToAppo: memberMap[name].pr > 0 ? Math.round(memberMap[name].appo / memberMap[name].pr * 10000) / 100 : 0,
      callToAppo: memberMap[name].calls > 0 ? Math.round(memberMap[name].appo / memberMap[name].calls * 10000) / 100 : 0,
      callsPerHour: memberMap[name].callTime > 0 ? Math.round(memberMap[name].calls / memberMap[name].callTime * 10) / 10 : 0
    }))
  };
}

// 先月比・通算比を計算
function calculateComparisons(currentAggregated, allRecords, startDate, endDate) {
  // 選択期間の日数を計算
  let periodDays = 0;
  if (startDate && endDate) {
    periodDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  }

  // 先月の同期間を計算
  let lastMonthStart = null, lastMonthEnd = null;
  if (startDate && endDate) {
    lastMonthStart = new Date(startDate);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthEnd = new Date(endDate);
    lastMonthEnd.setMonth(lastMonthEnd.getMonth() - 1);
  }

  // 先月データをフィルタリング
  const lastMonthRecords = allRecords.filter(r => {
    if (!r.date || !lastMonthStart || !lastMonthEnd) return false;
    return r.date >= lastMonthStart && r.date <= lastMonthEnd;
  });

  // 先月の集計
  const lastMonthAgg = aggregateData(lastMonthRecords.map(r => ({
    ...r,
    date: r.date ? Utilities.formatDate(r.date, 'Asia/Tokyo', 'yyyy-MM-dd') : null
  })));

  // 全期間の集計
  const allTimeAgg = aggregateData(allRecords.map(r => ({
    ...r,
    date: r.date ? Utilities.formatDate(r.date, 'Asia/Tokyo', 'yyyy-MM-dd') : null
  })));

  const current = currentAggregated.totals;
  const lastMonth = lastMonthAgg.totals;
  const allTime = allTimeAgg.totals;

  return {
    lastMonth: {
      callToPR: roundDiff(current.callToPR - lastMonth.callToPR),
      prToAppo: roundDiff(current.prToAppo - lastMonth.prToAppo),
      callToAppo: roundDiff(current.callToAppo - lastMonth.callToAppo)
    },
    allTime: {
      callToPR: roundDiff(current.callToPR - allTime.callToPR),
      prToAppo: roundDiff(current.prToAppo - allTime.prToAppo),
      callToAppo: roundDiff(current.callToAppo - allTime.callToAppo)
    }
  };
}

function roundDiff(value) {
  return Math.round(value * 100) / 100;
}

// ========================================
// 設定データの取得・保存
// ========================================

function getSettings() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('設定');

  // シートがなければ作成
  if (!sheet) {
    sheet = ss.insertSheet('設定');
    // ヘッダーを追加
    sheet.getRange('A1:E1').setValues([[
      '案件名', '架電→PR率目標(%)', 'PR→アポ率目標(%)', '架電→アポ率目標(%)', '架電数/H目標'
    ]]);
  }

  const data = sheet.getDataRange().getValues();
  const settings = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;

    settings.push({
      project: row[0],
      callToPRTarget: parseNumber(row[1]),
      prToAppoTarget: parseNumber(row[2]),
      callToAppoTarget: parseNumber(row[3]),
      callsPerHourTarget: parseNumber(row[4])
    });
  }

  // 案件一覧を取得
  const monthlySheet = ss.getSheetByName('月次ビュー');
  const monthlyData = monthlySheet.getDataRange().getValues();
  const projectsSet = new Set();

  for (let i = 4; i < monthlyData.length; i++) {
    const project = monthlyData[i][2];
    if (project && project !== '' && !String(project).includes('計')) {
      projectsSet.add(project);
    }
  }

  return {
    settings: settings,
    availableProjects: Array.from(projectsSet).sort()
  };
}

function saveSettings(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('設定');

  if (!sheet) {
    sheet = ss.insertSheet('設定');
  }

  // 既存データをクリア
  sheet.clear();

  // ヘッダーを追加
  sheet.getRange('A1:E1').setValues([[
    '案件名', '架電→PR率目標(%)', 'PR→アポ率目標(%)', '架電→アポ率目標(%)', '架電数/H目標'
  ]]);

  // データを書き込み
  if (data && data.length > 0) {
    const values = data.map(d => [
      d.project,
      d.callToPRTarget,
      d.prToAppoTarget,
      d.callToAppoTarget,
      d.callsPerHourTarget
    ]);
    sheet.getRange(2, 1, values.length, 5).setValues(values);
  }
}

// テスト用
function testGetRawData() {
  const result = getRawData({});
  Logger.log(JSON.stringify(result, null, 2));
}

function testGetSettings() {
  const result = getSettings();
  Logger.log(JSON.stringify(result, null, 2));
}

// ========================================
// 月次同期機能
// ========================================

// スプレッドシートを開いた時にカスタムメニューを追加
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('月次管理')
    .addItem('月次ビューを同期', 'showSyncDialog')
    .addToUi();
}

// 同期ダイアログを表示
function showSyncDialog() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    '月次ビュー同期',
    '対象月を数字で入力してください（例: 3）',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  const targetMonth = parseInt(result.getResponseText());
  if (isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    ui.alert('1〜12の数字を入力してください');
    return;
  }

  syncMonthlyView(targetMonth);
  ui.alert('月次ビューを ' + targetMonth + '月に同期しました');
}

/**
 * 目論見入力シートの対象月データを元に月次ビューを再生成する
 * @param {number} targetMonth - 対象月（1-12）
 */
function syncMonthlyView(targetMonth) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const inputSheet = ss.getSheetByName('目論見入力');
  const monthlySheet = ss.getSheetByName('月次ビュー');
  const masterSheet = ss.getSheetByName('マスタ');

  // 1. 目論見入力から対象月の行を取得（行番号はシート上の行番号=1始まり）
  const inputData = inputSheet.getDataRange().getValues();
  const targetRows = []; // { sheetRow: シート行番号 }
  for (let i = 1; i < inputData.length; i++) {
    const month = parseInt(inputData[i][2]);
    if (month === targetMonth) {
      targetRows.push({ sheetRow: i + 1 }); // シート行番号（1始まり、ヘッダーが1行目）
    }
  }

  if (targetRows.length === 0) {
    throw new Error('目論見入力に ' + targetMonth + '月のデータが見つかりません');
  }

  // 2. マスタシートの月初・月末を更新
  const today = new Date();
  const year = today.getFullYear();
  // 対象月が現在月より大きい場合は今年、小さい場合も今年（年度跨ぎは別途対応）
  const monthStart = new Date(year, targetMonth - 1, 1);
  const monthEnd = new Date(year, targetMonth, 0); // 月末日
  masterSheet.getRange('E3').setValue(monthStart); // 月初
  masterSheet.getRange('E4').setValue(monthEnd);    // 月末

  // 3. 月次ビューのデータ行を再生成
  const dataStartRow = 5; // 月次ビューのデータ開始行
  const memberCount = targetRows.length;

  // 既存のデータ行と合計行をクリア（ヘッダー4行は維持）
  const lastRow = monthlySheet.getLastRow();
  if (lastRow >= dataStartRow) {
    monthlySheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, 23).clear();
  }

  // 各担当者×案件の行を生成
  for (let i = 0; i < memberCount; i++) {
    const viewRow = dataStartRow + i; // 月次ビュー上の行番号
    const inputRow = targetRows[i].sheetRow; // 目論見入力のシート行番号

    const formulas = buildRowFormulas(viewRow, inputRow);
    // 数式がある列のみセット（空文字列の列はスキップ）
    for (let col = 0; col < formulas.length; col++) {
      if (formulas[col] !== '') {
        monthlySheet.getRange(viewRow, col + 1).setFormula(formulas[col]);
      }
    }
  }

  // 4. 空行 + 合計行を追加
  const totalRow = dataStartRow + memberCount + 1; // 1行空けて合計
  const lastDataRow = dataStartRow + memberCount - 1;

  // 合計行: テキストを先に書き込み
  monthlySheet.getRange(totalRow, 2).setValue('計');

  // 合計行: 数式を個別にセット
  monthlySheet.getRange(totalRow, 4).setFormula('=H' + totalRow + '/G' + totalRow);  // ペース(架電)
  monthlySheet.getRange(totalRow, 5).setFormula('=K' + totalRow + '/J' + totalRow);  // ペース(アポ)
  monthlySheet.getRange(totalRow, 6).setFormula('=SUM(F' + dataStartRow + ':F' + lastDataRow + ')');  // 売上合計
  monthlySheet.getRange(totalRow, 7).setFormula('=SUM(G' + dataStartRow + ':G' + lastDataRow + ')');  // 目標架電合計
  monthlySheet.getRange(totalRow, 8).setFormula('=SUM(H' + dataStartRow + ':H' + lastDataRow + ')');  // 実績架電合計
  monthlySheet.getRange(totalRow, 10).setFormula('=SUM(J' + dataStartRow + ':J' + lastDataRow + ')'); // 目標アポ合計
  monthlySheet.getRange(totalRow, 11).setFormula('=SUM(K' + dataStartRow + ':K' + lastDataRow + ')'); // 実績アポ合計

  // 拡張合計行
  const extTotalRow = totalRow + 1;
  monthlySheet.getRange(extTotalRow, 2).setValue('計（エステック、アズビル、日経AI）');
  monthlySheet.getRange(extTotalRow, 6).setFormula('=F' + totalRow + '+2100000');

  SpreadsheetApp.flush();
}

/**
 * 月次ビューの1行分の数式配列を生成
 * @param {number} viewRow - 月次ビューの行番号
 * @param {number} inputRow - 目論見入力の行番号
 * @returns {string[]} 23列分の数式配列
 */
function buildRowFormulas(viewRow, inputRow) {
  const r = viewRow; // 月次ビューの行番号（数式内で使用）
  const ir = inputRow; // 目論見入力の行番号

  // ペース計算の分母（担当者ごとの経過率を参照）
  const paceFormula = function(numCol, denomCol) {
    return '=IF(' + denomCol + r + '="","",IFERROR(' + numCol + r + '/(' + denomCol + r + '*IF($B' + r + '="@原田幸輝",\'マスタ\'!$E$17,IF($B' + r + '="@三浦 宏成/ Miura Hironari",\'マスタ\'!$E$22,IF($B' + r + '="@笹田 怜央/sasada reo",\'マスタ\'!$E$27,\'マスタ\'!$E$8)))),""))';
  };

  // SUMIFS: 実績rawdataからの集計
  const sumifs = function(dataCol) {
    return '=SUMIFS(\'実績rawdata\'!' + dataCol + ':' + dataCol + ',\'実績rawdata\'!A:A,$B' + r + ',\'実績rawdata\'!B:B,$C' + r + ',\'実績rawdata\'!C:C,">="&\'マスタ\'!$E$3,\'実績rawdata\'!C:C,"<="&\'マスタ\'!$E$4)';
  };

  return [
    '',                                              // A: 空
    '=\'目論見入力\'!A' + ir,                         // B: 担当者
    '=\'目論見入力\'!B' + ir,                         // C: 案件
    paceFormula('H', 'G'),                           // D: ペース(架電)
    paceFormula('K', 'J'),                           // E: ペース(アポ)
    '=\'目論見入力\'!K' + ir,                         // F: 売上
    '=\'目論見入力\'!D' + ir,                         // G: 目標架電数
    sumifs('E'),                                     // H: 実績架電数
    '=IFERROR(H' + r + '/G' + r + ',"")',            // I: 架電進捗率
    '=\'目論見入力\'!F' + ir,                         // J: 目標アポ数
    sumifs('G'),                                     // K: 実績アポ数
    '=IFERROR(K' + r + '/J' + r + ',"")',            // L: アポ進捗率
    sumifs('F'),                                     // M: 実績PR数
    '=\'目論見入力\'!G' + ir,                         // N: 架電数/H目標
    '=IFERROR(H' + r + '/U' + r + ',0)',             // O: 架電数/H実績
    '=\'目論見入力\'!H' + ir,                         // P: 架電toアポ目標
    '=IFERROR(K' + r + '/H' + r + ',"")',            // Q: 架電toアポ実績
    '=IFERROR(M' + r + '/H' + r + ')',               // R: 架電to着電
    '=IFERROR(K' + r + '/M' + r + ')',               // S: 着電toアポ
    '=\'目論見入力\'!I' + ir,                         // T: 稼働H目標
    sumifs('D'),                                     // U: 稼働H実績
    '=G' + r + '*$P$2',                              // V: 対裏目標架電数
    '=J' + r + '*$P$2'                               // W: 対裏目標アポ数
  ];
}

// テスト用: 3月に同期
function testSync3() {
  syncMonthlyView(3);
}

// ========================================
// パイプラインデータ取得
// ========================================

const PIPELINE_SPREADSHEET_ID = '1NXxjF81tvMHywaTzQfmuC_1-FqgOFhoyZIHsUZHIobE';

function getPipelineData() {
  const ss = SpreadsheetApp.openById(PIPELINE_SPREADSHEET_ID);

  // 案件管理DB
  const dbSheet = ss.getSheetByName('案件管理DB');
  const dbData = dbSheet.getDataRange().getValues();
  const dbHeaders = dbData[0];
  const deals = [];

  for (let i = 1; i < dbData.length; i++) {
    const row = dbData[i];
    if (!row[0] && !row[1]) continue; // 空行スキップ

    deals.push({
      owner: row[0] || '',
      dealName: row[1] || '',
      phase: row[2] || '',
      type: row[3] || '',
      amountMax: row[4] || '',
      amountMin: row[5] || '',
      startDate: row[6] ? Utilities.formatDate(new Date(row[6]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      taskName: row[7] || '',
      deadline: row[8] ? Utilities.formatDate(new Date(row[8]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      startMonth: row[12] || '',
      probability: row[13] || '',
      expectedMax: row[14] || '',
      expectedMin: row[15] || '',
      memo: row[11] || ''
    });
  }

  // 月別サマリー
  const summarySheet = ss.getSheetByName('月別サマリー');
  const summaryData = summarySheet.getDataRange().getValues();

  // ヘッダー行（月名）
  const months = [];
  for (let col = 1; col < summaryData[0].length; col++) {
    if (summaryData[0][col]) {
      months.push(String(summaryData[0][col]));
    }
  }

  // 各行のデータをオブジェクトに変換
  const summary = {};
  for (let i = 1; i < summaryData.length; i++) {
    const label = summaryData[i][0];
    if (!label) continue;
    const values = [];
    for (let col = 1; col <= months.length; col++) {
      values.push(summaryData[i][col] !== undefined ? summaryData[i][col] : '');
    }
    summary[label] = values;
  }

  return {
    deals: deals,
    months: months,
    summary: summary,
    lastUpdated: new Date().toISOString()
  };
}

function testGetPipelineData() {
  const result = getPipelineData();
  Logger.log(JSON.stringify(result, null, 2));
}
