/**
 * Google Apps Script - 月次ビューデータ取得API
 */

// メイン関数: GETリクエストを処理
function doGet(e) {
  try {
    const data = getMonthlyViewData();
    return ContentService
      .createTextOutput(JSON.stringify(data))
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
