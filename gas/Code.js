/**
 * Google Apps Script - 営業KPIダッシュボードAPI
 * スプレッドシート読み取りをTurso DBに移行済み（高速化）
 */

// メイン関数: GETリクエストを処理
function doGet(e) {
  try {
    const type = e && e.parameter && e.parameter.type ? e.parameter.type : 'monthly';
    let data;

    switch (type) {
      case 'monthly':
        data = getMonthlyViewData(e.parameter.month);
        break;
      case 'rawdata':
        data = getRawData(e.parameter);
        break;
      case 'debug_holidays':
        var dy = Number(e.parameter.year || new Date().getFullYear());
        var dm = Number(e.parameter.month || (new Date().getMonth() + 1));
        data = calculateBusinessDays_(dy, dm);
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
    const type = requestBody.type;

    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unknown type: ' + type }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// スプレッドシートID
const SPREADSHEET_ID = '1kOAmuUSpY_2rV2EpIbhRtBsoxeehGuz9GYLTFn0xpdQ';
const OLD_SPREADSHEET_ID = '1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM';

// ========================================
// ヘルパー関数
// ========================================

/**
 * tursoExecute_() の結果1件を行オブジェクト配列に変換する
 */
function parseResultRows_(result) {
  if (result.type === 'error') {
    throw new Error(result.error.message);
  }
  const response = result.response.result;
  const cols = response.cols.map(function(c) { return c.name; });
  return response.rows.map(function(row) {
    var obj = {};
    for (var i = 0; i < cols.length; i++) {
      obj[cols[i]] = row[i].value;
    }
    return obj;
  });
}

/**
 * 日本の国民の祝日（ハードコード版）
 * カレンダーAPIが利用できない場合のフォールバック。
 * 春分・秋分は年ごとに変動するので年別に定義。
 */
var JP_HOLIDAYS_HARDCODED_ = {
  2025: [
    '2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24',
    '2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
    '2025-07-21','2025-08-11','2025-09-15','2025-09-23','2025-10-13',
    '2025-11-03','2025-11-23','2025-11-24'
  ],
  2026: [
    '2026-01-01','2026-01-12','2026-02-11','2026-02-23',
    '2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
    '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12',
    '2026-11-03','2026-11-23'
  ],
  2027: [
    '2027-01-01','2027-01-11','2027-02-11','2027-02-23',
    '2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05',
    '2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11',
    '2027-11-03','2027-11-23'
  ]
};

/**
 * 稼働日数を計算する（土日 + 祝日を除外）
 * GoogleカレンダーAPIで日本の祝日を取得、失敗時はハードコード版にフォールバック
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {{ totalDays: number, elapsedDays: number, standardProgress: number }}
 */
function calculateBusinessDays_(year, month) {
  var monthStart = new Date(year, month - 1, 1);
  var monthEnd = new Date(year, month, 0); // 月末日

  // 日本の祝日カレンダーから国民の祝日のみ取得（ひな祭り等の年中行事を除外）
  var NATIONAL_HOLIDAYS = [
    '元日', '成人の日', '建国記念の日', '天皇誕生日', '春分の日',
    '昭和の日', '憲法記念日', 'みどりの日', 'こどもの日', '海の日',
    '山の日', '敬老の日', '秋分の日', 'スポーツの日', '文化の日',
    '勤労感謝の日', '振替休日', '国民の休日'
  ];
  var holidays = {};
  var calendarOk = false;
  try {
    var cal = CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
    if (cal) {
      var events = cal.getEvents(monthStart, new Date(year, month, 1)); // 翌月1日まで
      events.forEach(function(ev) {
        var title = ev.getTitle();
        if (NATIONAL_HOLIDAYS.indexOf(title) === -1) return; // 国民の祝日以外はスキップ
        var d = ev.getStartTime();
        var key = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
        holidays[key] = true;
      });
      calendarOk = true;
    }
  } catch (e) {
    // カレンダーAPIが利用できない場合はハードコード版を使う
  }

  // カレンダーAPIで取得できなかった場合はハードコード版にフォールバック
  if (!calendarOk || Object.keys(holidays).length === 0) {
    var hardcoded = JP_HOLIDAYS_HARDCODED_[year] || [];
    var monthPrefix = year + '-' + String(month).padStart(2, '0') + '-';
    hardcoded.forEach(function(dateStr) {
      if (dateStr.indexOf(monthPrefix) === 0) {
        holidays[dateStr] = true;
      }
    });
  }

  var totalDays = 0;
  var elapsedDays = 0;
  var now = new Date();
  // 今日の日本時間での日付
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var todayDate = new Date(todayStr + 'T00:00:00+09:00');

  for (var d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    var dayOfWeek = d.getDay(); // 0=日, 6=土
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    var dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    if (holidays[dateStr]) continue;

    totalDays++;

    // 経過日数: 今日以前の営業日数
    if (dateStr <= todayStr) {
      elapsedDays++;
    }
  }

  var standardProgress = totalDays > 0 ? Math.round(elapsedDays / totalDays * 10000) / 100 : 0;

  return {
    totalDays: totalDays,
    elapsedDays: elapsedDays,
    standardProgress: standardProgress,
    holidays: Object.keys(holidays)
  };
}

/**
 * 稼働日数をキャッシュ付きで取得
 * 当月は1時間、過去月は最大6時間（CacheService上限）キャッシュ
 */
function getBusinessDaysCached_(year, month) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'bizdays_v3_' + year + '_' + month;
  var cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  var result = calculateBusinessDays_(year, month);
  var now = new Date();
  var currentYM = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy') + '-' + Utilities.formatDate(now, 'Asia/Tokyo', 'MM');
  var isCurrentMonth = (year + '-' + String(month).padStart(2, '0')) === currentYM;
  var ttl = isCurrentMonth ? 3600 : 21600; // 当月1時間、過去月6時間
  cache.put(cacheKey, JSON.stringify(result), ttl);
  return result;
}

// ========================================
// 月次ビューデータ取得（Turso版）
// ========================================

/**
 * 月次ビューのデータを取得（Turso DB から）
 * レスポンス構造は旧スプレッドシート版と完全互換
 */
function getMonthlyViewData(targetMonth) {
  // targetMonth: 'yyyy-MM' 形式（省略時は当月）
  var now = new Date();
  var year, month, currentMonth;
  if (targetMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    var parts = targetMonth.split('-');
    year = parseInt(parts[0]);
    month = parseInt(parts[1]);
    currentMonth = targetMonth;
  } else {
    year = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
    month = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'MM'));
    currentMonth = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
  }

  // キャッシュチェック（2分間）
  var cache = CacheService.getScriptCache();
  var cacheKey = 'monthlyViewData_v2_' + currentMonth;
  var cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  var monthStartDate = currentMonth + '-01';
  var nextMonthStart = year + '-' + String(month < 12 ? month + 1 : 1).padStart(2, '0') + '-01';
  if (month === 12) {
    nextMonthStart = (year + 1) + '-01-01';
  }

  // (A) 担当者別目標をスプレッドシート「目論見入力」から取得
  var targets = getTargetsFromSheet_(month);

  // (B) 実績データはTursoから取得（performance_rawdata）
  var tursoResults = tursoExecute_([
    {
      sql: "SELECT COALESCE(a.member_name, REPLACE(SUBSTR(p.member_name, 1, CASE WHEN INSTR(p.member_name, '/') > 0 THEN INSTR(p.member_name, '/') - 1 ELSE LENGTH(p.member_name) END), '@', '')) AS name, p.project_name, SUM(p.call_count) AS calls, SUM(p.pr_count) AS pr, SUM(p.appointment_count) AS appo, SUM(p.call_hours) AS call_hours FROM performance_rawdata p LEFT JOIN member_name_aliases a ON p.member_name = a.raw_name WHERE p.input_date >= ? AND p.input_date < ? GROUP BY name, p.project_name",
      args: [{ type: 'text', value: monthStartDate }, { type: 'text', value: nextMonthStart }]
    }
  ]);
  var actuals = parseResultRows_(tursoResults[0]);

  // (C)(D) 売上目標・確定をスプレッドシート「稼働報酬Team」から取得
  var salesData = getTeamSalesFromSheet_(month);

  // 稼働日数計算
  var bizDays = getBusinessDaysCached_(year, month);

  // 実績をマップに変換（name + project → actuals）
  var actualMap = {};
  actuals.forEach(function(a) {
    var key = a.name + '___' + a.project_name;
    actualMap[key] = {
      calls: Number(a.calls) || 0,
      pr: Number(a.pr) || 0,
      appo: Number(a.appo) || 0,
      callHours: Number(a.call_hours) || 0
    };
  });

  // 担当者別データを構築
  var members = [];
  var totalSales = 0, totalCalls = 0, totalAppointments = 0, sumTargetCalls = 0, sumTargetAppointments = 0;

  // 標準進捗率（0-1の比率）
  var progressRate = bizDays.standardProgress / 100;

  targets.forEach(function(t) {
    var memberName = t.member_name;
    var project = t.project_name;
    var key = memberName + '___' + project;

    var tCalls = Number(t.target_calls) || 0;
    var tAppo = Number(t.target_appointments) || 0;
    var tHours = Number(t.target_work_hours) || 0;
    var tCallsPerHour = t.calls_per_hour_target != null ? Number(t.calls_per_hour_target) : 0;
    var tCallToAppo = t.call_to_appo_target != null ? Number(t.call_to_appo_target) : 0;
    var tSales = Number(t.sales_target) || 0;

    var actual = actualMap[key] || { calls: 0, pr: 0, appo: 0, callHours: 0 };

    var callProgress = tCalls > 0 ? Math.round(actual.calls / tCalls * 10000) / 100 : 0;
    var appoProgress = tAppo > 0 ? Math.round(actual.appo / tAppo * 10000) / 100 : 0;

    // ペース = 実績 / (目標 × 標準進捗率)
    var callPace = (tCalls > 0 && progressRate > 0) ? Math.round(actual.calls / (tCalls * progressRate) * 10000) / 100 : 0;
    var appoPace = (tAppo > 0 && progressRate > 0) ? Math.round(actual.appo / (tAppo * progressRate) * 10000) / 100 : 0;

    var callsPerHourActual = actual.callHours > 0 ? Math.round(actual.calls / actual.callHours * 10) / 10 : 0;
    var callToAppoActual = actual.calls > 0 ? Math.round(actual.appo / actual.calls * 10000) / 100 : 0;
    var callToAnswer = actual.calls > 0 ? Math.round(actual.pr / actual.calls * 10000) / 100 : 0;
    var answerToAppo = actual.pr > 0 ? Math.round(actual.appo / actual.pr * 10000) / 100 : 0;

    members.push({
      name: memberName,
      fullName: memberName,
      project: project,
      callPace: callPace,
      appointmentPace: appoPace,
      sales: tSales,
      targetCalls: tCalls,
      actualCalls: actual.calls,
      callProgress: callProgress,
      targetAppointments: tAppo,
      actualAppointments: actual.appo,
      appointmentProgress: appoProgress,
      actualPR: actual.pr,
      callsPerHourTarget: tCallsPerHour,
      callsPerHourActual: callsPerHourActual,
      callToAppointmentTarget: tCallToAppo > 0 ? Math.round(tCallToAppo * 10000) / 100 : 0,
      callToAppointmentActual: callToAppoActual,
      callToAnswer: callToAnswer,
      answerToAppointment: answerToAppo,
      workHoursTarget: tHours,
      workHoursActual: actual.callHours
    });

    totalSales += tSales;
    totalCalls += actual.calls;
    totalAppointments += actual.appo;
    sumTargetCalls += tCalls;
    sumTargetAppointments += tAppo;
  });

  var totalSalesFromDeals = salesData.confirmedSales;
  var salesTarget = salesData.salesTarget;

  var response = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      sheetName: '月次ビュー',
      standardProgress: bizDays.standardProgress,
      elapsedDays: bizDays.elapsedDays,
      totalDays: bizDays.totalDays,
      targetMonth: currentMonth,
      backTarget: 0
    },
    summary: {
      totalSales: totalSalesFromDeals,
      extendedTotalSales: totalSalesFromDeals,
      totalCalls: totalCalls,
      targetCalls: sumTargetCalls,
      totalAppointments: totalAppointments,
      targetAppointments: sumTargetAppointments,
      callProgressRate: sumTargetCalls > 0 ? Math.round(totalCalls / sumTargetCalls * 10000) / 100 : 0,
      appointmentProgressRate: sumTargetAppointments > 0 ? Math.round(totalAppointments / sumTargetAppointments * 10000) / 100 : 0,
      salesTarget: salesTarget
    },
    members: members
  };

  // 2分間キャッシュ
  cache.put(cacheKey, JSON.stringify(response), 120);

  return response;
}

// ========================================
// 実績rawdataからの集計（Turso版）
// ========================================

// ========================================
// スプレッドシート読み取りヘルパー
// ========================================

/**
 * 「稼働報酬Team」シートから売上目標・確定金額を取得
 * @param {number} monthNum - 月（1-12）
 */
function getTeamSalesFromSheet_(monthNum) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('稼働報酬Team');

  // 行3ヘッダーから月→列のマッピング（D列=4から）
  var headers = sheet.getRange('D3:H3').getValues()[0]; // ["3月","4月","5月","6月","合計"]
  var colIndex = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).replace('月', '') == String(monthNum)) {
      colIndex = i + 4; // D=4, E=5, F=6, G=7
      break;
    }
  }

  if (colIndex < 0) return { salesTarget: 0, confirmedSales: 0 };

  var salesTarget = parseCurrency_(sheet.getRange(4, colIndex).getValue());
  var confirmedSales = parseCurrency_(sheet.getRange(25, colIndex).getValue());

  return { salesTarget: salesTarget, confirmedSales: confirmedSales };
}

/**
 * 「目論見入力」シートから担当者別目標を取得
 * @param {number} monthNum - 月（1-12）
 * @returns {Array} targets配列（Turso版と同じ構造）
 */
function getTargetsFromSheet_(monthNum) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('稼働報酬_目論見入力');
  var data = sheet.getDataRange().getValues();
  var targets = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowMonth = parseInt(row[2]);
    if (rowMonth !== monthNum) continue;

    // 担当者名を正規化（@名前/英語 → 名前 部分を抽出）
    var rawName = String(row[0]);
    var memberName = rawName.replace(/^@/, '').replace(/\s*\/.*$/, '').replace(/\s+/g, '');

    targets.push({
      member_name: memberName,
      project_name: String(row[1]),
      target_calls: Number(row[3]) || 0,
      target_appointments: Number(row[5]) || 0,
      target_work_hours: Number(row[8]) || 0,
      calls_per_hour_target: Number(row[6]) || 0,
      call_to_appo_target: parsePercent_(row[7]),
      sales_target: parseCurrency_(row[10])
    });
  }

  return targets;
}

/**
 * 通貨文字列をパース（¥12,340,000 → 12340000）
 */
function parseCurrency_(val) {
  if (typeof val === 'number') return val;
  return Number(String(val).replace(/[¥￥,]/g, '')) || 0;
}

/**
 * パーセント文字列をパース（"6.00%" → 0.06）
 */
function parsePercent_(val) {
  if (typeof val === 'number') return val;
  var s = String(val).replace('%', '');
  var n = Number(s);
  return isNaN(n) ? 0 : n / 100;
}

/**
 * 実績rawdataを取得・集計（Turso DB から）
 */
function getRawData(params) {
  // 日付範囲を決定
  var now = new Date();
  var year = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
  var month = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'MM'));

  var datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var startDate, endDate;
  if (params && params.startDate && datePattern.test(params.startDate)) {
    startDate = params.startDate;
  } else {
    startDate = year + '-' + String(month).padStart(2, '0') + '-01';
  }
  if (params && params.endDate && datePattern.test(params.endDate)) {
    endDate = params.endDate;
  } else {
    var lastDay = new Date(year, month, 0).getDate();
    endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
  }

  // キャッシュチェック（2分間、日付パラメータ含む）
  var cache = CacheService.getScriptCache();
  var cacheKey = 'rawdata_' + startDate + '_' + endDate;
  var cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 前月の日付範囲を計算
  var startParts = startDate.split('-');
  var sYear = parseInt(startParts[0]);
  var sMonth = parseInt(startParts[1]);
  var prevMonth = sMonth - 1;
  var prevYear = sYear;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  var prevStartDate = prevYear + '-' + String(prevMonth).padStart(2, '0') + '-01';
  var prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  var prevEndDate = prevYear + '-' + String(prevMonth).padStart(2, '0') + '-' + String(prevLastDay).padStart(2, '0');

  // 3クエリを1回のHTTPリクエストで実行
  var results = tursoExecute_([
    // (A) 当期間のレコード
    {
      sql: "SELECT COALESCE(a.member_name, REPLACE(SUBSTR(p.member_name, 1, CASE WHEN INSTR(p.member_name, '/') > 0 THEN INSTR(p.member_name, '/') - 1 ELSE LENGTH(p.member_name) END), '@', '')) AS name, p.project_name, p.input_date, p.call_hours, p.call_count, p.pr_count, p.appointment_count FROM performance_rawdata p LEFT JOIN member_name_aliases a ON p.member_name = a.raw_name WHERE p.input_date >= ? AND p.input_date <= ? ORDER BY p.input_date",
      args: [{ type: 'text', value: startDate }, { type: 'text', value: endDate }]
    },
    // (B) 前月のレコード（先月比計算用）
    {
      sql: "SELECT COALESCE(a.member_name, REPLACE(SUBSTR(p.member_name, 1, CASE WHEN INSTR(p.member_name, '/') > 0 THEN INSTR(p.member_name, '/') - 1 ELSE LENGTH(p.member_name) END), '@', '')) AS name, p.project_name, p.input_date, p.call_hours, p.call_count, p.pr_count, p.appointment_count FROM performance_rawdata p LEFT JOIN member_name_aliases a ON p.member_name = a.raw_name WHERE p.input_date >= ? AND p.input_date <= ? ORDER BY p.input_date",
      args: [{ type: 'text', value: prevStartDate }, { type: 'text', value: prevEndDate }]
    },
    // (C) 全期間の集計（通算比計算用）
    {
      sql: "SELECT SUM(call_count) AS calls, SUM(pr_count) AS pr, SUM(appointment_count) AS appo, SUM(call_hours) AS call_hours FROM performance_rawdata",
      args: []
    }
  ]);

  var currentRows = parseResultRows_(results[0]);
  var prevMonthRows = parseResultRows_(results[1]);
  var allTimeTotals = parseResultRows_(results[2])[0];

  // 当期間のレコードを整形
  var records = [];
  var projectSet = {};
  var memberSet = {};

  currentRows.forEach(function(r) {
    var name = r.name || '';
    var project = r.project_name || '';
    var callTime = Number(r.call_hours) || 0;
    var calls = Number(r.call_count) || 0;
    var pr = Number(r.pr_count) || 0;
    var appo = Number(r.appointment_count) || 0;

    projectSet[project] = true;
    memberSet[name] = true;

    records.push({
      name: name,
      project: project,
      date: r.input_date || null,
      callTime: callTime,
      calls: calls,
      pr: pr,
      appo: appo
    });
  });

  // 集計データを計算
  var aggregated = aggregateData(records);

  // 先月データの整形
  var lastMonthRecords = prevMonthRows.map(function(r) {
    return {
      name: r.name || '',
      project: r.project_name || '',
      date: r.input_date || null,
      callTime: Number(r.call_hours) || 0,
      calls: Number(r.call_count) || 0,
      pr: Number(r.pr_count) || 0,
      appo: Number(r.appointment_count) || 0
    };
  });
  var lastMonthAgg = aggregateData(lastMonthRecords);

  // 全期間の率を計算
  var atCalls = Number(allTimeTotals.calls) || 0;
  var atPR = Number(allTimeTotals.pr) || 0;
  var atAppo = Number(allTimeTotals.appo) || 0;
  var allTimeRates = {
    callToPR: atCalls > 0 ? Math.round(atPR / atCalls * 10000) / 100 : 0,
    prToAppo: atPR > 0 ? Math.round(atAppo / atPR * 10000) / 100 : 0,
    callToAppo: atCalls > 0 ? Math.round(atAppo / atCalls * 10000) / 100 : 0
  };

  var current = aggregated.totals;

  // 比較データ
  var comparisons = {
    lastMonth: {
      callToPR: roundDiff(current.callToPR - lastMonthAgg.totals.callToPR),
      prToAppo: roundDiff(current.prToAppo - lastMonthAgg.totals.prToAppo),
      callToAppo: roundDiff(current.callToAppo - lastMonthAgg.totals.callToAppo)
    },
    allTime: {
      callToPR: roundDiff(current.callToPR - allTimeRates.callToPR),
      prToAppo: roundDiff(current.prToAppo - allTimeRates.prToAppo),
      callToAppo: roundDiff(current.callToAppo - allTimeRates.callToAppo)
    }
  };

  // 前月の日別データ（月次比較用）
  var prevDailyMap = {};
  lastMonthRecords.forEach(function(r) {
    if (!r.date) return;
    var day = parseInt(r.date.split('-')[2]);
    if (!prevDailyMap[day]) {
      prevDailyMap[day] = { calls: 0, pr: 0, appo: 0, callTime: 0 };
    }
    prevDailyMap[day].calls += r.calls;
    prevDailyMap[day].pr += r.pr;
    prevDailyMap[day].appo += r.appo;
    prevDailyMap[day].callTime += r.callTime;
  });

  var prevDaily = [];
  for (var day = 1; day <= 31; day++) {
    var d = prevDailyMap[day] || { calls: 0, pr: 0, appo: 0, callTime: 0 };
    prevDaily.push({
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

  var previousMonthDaily = {
    month: prevYear + '-' + String(prevMonth).padStart(2, '0'),
    daily: prevDaily
  };

  var response = {
    records: records,
    aggregated: aggregated,
    comparisons: comparisons,
    previousMonthDaily: previousMonthDaily,
    filters: {
      projects: Object.keys(projectSet).sort(),
      members: Object.keys(memberSet).sort()
    }
  };

  // 2分間キャッシュ
  cache.put(cacheKey, JSON.stringify(response), 120);

  return response;
}

// ========================================
// 集計関数（共通）
// ========================================

// データを集計
function aggregateData(records) {
  var totalCalls = 0, totalPR = 0, totalAppo = 0, totalCallTime = 0;

  // 日別集計
  var dailyMap = {};
  // 案件別集計
  var projectMap = {};
  // 担当者別集計
  var memberMap = {};

  records.forEach(function(r) {
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
  var callToPR = totalCalls > 0 ? Math.round(totalPR / totalCalls * 10000) / 100 : 0;
  var prToAppo = totalPR > 0 ? Math.round(totalAppo / totalPR * 10000) / 100 : 0;
  var callToAppo = totalCalls > 0 ? Math.round(totalAppo / totalCalls * 10000) / 100 : 0;
  var callsPerHour = totalCallTime > 0 ? Math.round(totalCalls / totalCallTime * 10) / 10 : 0;

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
    daily: Object.keys(dailyMap).sort().map(function(date) {
      var dd = dailyMap[date];
      return {
        date: date,
        calls: dd.calls,
        pr: dd.pr,
        appo: dd.appo,
        callTime: dd.callTime,
        callToPR: dd.calls > 0 ? Math.round(dd.pr / dd.calls * 10000) / 100 : 0,
        prToAppo: dd.pr > 0 ? Math.round(dd.appo / dd.pr * 10000) / 100 : 0,
        callToAppo: dd.calls > 0 ? Math.round(dd.appo / dd.calls * 10000) / 100 : 0,
        callsPerHour: dd.callTime > 0 ? Math.round(dd.calls / dd.callTime * 10) / 10 : 0
      };
    }),
    byProject: Object.keys(projectMap).map(function(project) {
      var pp = projectMap[project];
      return {
        project: project,
        calls: pp.calls,
        pr: pp.pr,
        appo: pp.appo,
        callTime: pp.callTime,
        callToPR: pp.calls > 0 ? Math.round(pp.pr / pp.calls * 10000) / 100 : 0,
        prToAppo: pp.pr > 0 ? Math.round(pp.appo / pp.pr * 10000) / 100 : 0,
        callToAppo: pp.calls > 0 ? Math.round(pp.appo / pp.calls * 10000) / 100 : 0,
        callsPerHour: pp.callTime > 0 ? Math.round(pp.calls / pp.callTime * 10) / 10 : 0
      };
    }),
    byMember: Object.keys(memberMap).map(function(name) {
      var mm = memberMap[name];
      return {
        name: name,
        calls: mm.calls,
        pr: mm.pr,
        appo: mm.appo,
        callTime: mm.callTime,
        callToPR: mm.calls > 0 ? Math.round(mm.pr / mm.calls * 10000) / 100 : 0,
        prToAppo: mm.pr > 0 ? Math.round(mm.appo / mm.pr * 10000) / 100 : 0,
        callToAppo: mm.calls > 0 ? Math.round(mm.appo / mm.calls * 10000) / 100 : 0,
        callsPerHour: mm.callTime > 0 ? Math.round(mm.calls / mm.callTime * 10) / 10 : 0
      };
    })
  };
}

function roundDiff(value) {
  return Math.round(value * 100) / 100;
}

// ========================================
// テスト用関数
// ========================================

function testGetData() {
  var result = getMonthlyViewData();
  Logger.log(JSON.stringify(result, null, 2));
}

function testGetRawData() {
  var result = getRawData({});
  Logger.log(JSON.stringify(result, null, 2));
}

function testBusinessDays() {
  var result = calculateBusinessDays_(2026, 3);
  Logger.log('totalDays: ' + result.totalDays + ', elapsedDays: ' + result.elapsedDays + ', standardProgress: ' + result.standardProgress + '%');
}

// ========================================
// 月次同期機能（スプレッドシート操作 - 変更なし）
// ========================================

// スプレッドシートを開いた時にカスタムメニューを追加
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('月次管理')
    .addItem('月次ビューを同期', 'showSyncDialog')
    .addToUi();
}

// 同期ダイアログを表示
function showSyncDialog() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    '月次ビュー同期',
    '対象月を数字で入力してください（例: 3）',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  var targetMonth = parseInt(result.getResponseText());
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
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var inputSheet = ss.getSheetByName('目論見入力');
  var monthlySheet = ss.getSheetByName('月次ビュー');
  var masterSheet = ss.getSheetByName('マスタ');

  // 1. 目論見入力から対象月の行を取得（行番号はシート上の行番号=1始まり）
  var inputData = inputSheet.getDataRange().getValues();
  var targetRows = []; // { sheetRow: シート行番号 }
  for (var i = 1; i < inputData.length; i++) {
    var monthVal = parseInt(inputData[i][2]);
    if (monthVal === targetMonth) {
      targetRows.push({ sheetRow: i + 1 }); // シート行番号（1始まり、ヘッダーが1行目）
    }
  }

  if (targetRows.length === 0) {
    throw new Error('目論見入力に ' + targetMonth + '月のデータが見つかりません');
  }

  // 2. マスタシートの月初・月末を更新
  var today = new Date();
  var yr = today.getFullYear();
  var monthStart = new Date(yr, targetMonth - 1, 1);
  var monthEnd = new Date(yr, targetMonth, 0); // 月末日
  masterSheet.getRange('E3').setValue(monthStart); // 月初
  masterSheet.getRange('E4').setValue(monthEnd);    // 月末

  // 3. 月次ビューのデータ行を再生成
  var dataStartRow = 5; // 月次ビューのデータ開始行
  var memberCount = targetRows.length;

  // 既存のデータ行と合計行をクリア（ヘッダー4行は維持）
  var lastRow = monthlySheet.getLastRow();
  if (lastRow >= dataStartRow) {
    monthlySheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, 23).clear();
  }

  // 各担当者×案件の行を生成
  for (var j = 0; j < memberCount; j++) {
    var viewRow = dataStartRow + j;
    var inputRow = targetRows[j].sheetRow;

    var formulas = buildRowFormulas(viewRow, inputRow);
    for (var col = 0; col < formulas.length; col++) {
      if (formulas[col] !== '') {
        monthlySheet.getRange(viewRow, col + 1).setFormula(formulas[col]);
      }
    }
  }

  // 4. 空行 + 合計行を追加
  var totalRow = dataStartRow + memberCount + 1;
  var lastDataRow = dataStartRow + memberCount - 1;

  monthlySheet.getRange(totalRow, 2).setValue('計');
  monthlySheet.getRange(totalRow, 4).setFormula('=H' + totalRow + '/G' + totalRow);
  monthlySheet.getRange(totalRow, 5).setFormula('=K' + totalRow + '/J' + totalRow);
  monthlySheet.getRange(totalRow, 6).setFormula('=SUM(F' + dataStartRow + ':F' + lastDataRow + ')');
  monthlySheet.getRange(totalRow, 7).setFormula('=SUM(G' + dataStartRow + ':G' + lastDataRow + ')');
  monthlySheet.getRange(totalRow, 8).setFormula('=SUM(H' + dataStartRow + ':H' + lastDataRow + ')');
  monthlySheet.getRange(totalRow, 10).setFormula('=SUM(J' + dataStartRow + ':J' + lastDataRow + ')');
  monthlySheet.getRange(totalRow, 11).setFormula('=SUM(K' + dataStartRow + ':K' + lastDataRow + ')');

  // 拡張合計行
  var extTotalRow = totalRow + 1;
  monthlySheet.getRange(extTotalRow, 2).setValue('計（エステック、アズビル、日経AI）');
  monthlySheet.getRange(extTotalRow, 6).setFormula('=F' + totalRow + '+2100000');

  SpreadsheetApp.flush();
}

/**
 * 月次ビューの1行分の数式配列を生成
 */
function buildRowFormulas(viewRow, inputRow) {
  var r = viewRow;
  var ir = inputRow;

  var paceFormula = function(numCol, denomCol) {
    return '=IF(' + denomCol + r + '="","",IFERROR(' + numCol + r + '/(' + denomCol + r + '*IF($B' + r + '="@原田幸輝",\'マスタ\'!$E$17,IF($B' + r + '="@三浦 宏成/ Miura Hironari",\'マスタ\'!$E$22,IF($B' + r + '="@笹田 怜央/sasada reo",\'マスタ\'!$E$27,\'マスタ\'!$E$8)))),""))';
  };

  var sumifs = function(dataCol) {
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
// Turso DB 連携
// ========================================

var TURSO_URL = 'https://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io';

function getTursoToken_() {
  return PropertiesService.getScriptProperties().getProperty('TURSO_AUTH_TOKEN');
}

/**
 * Turso HTTP API でSQLを実行する汎用関数
 */
function tursoExecute_(statements) {
  var token = getTursoToken_();
  if (!token) throw new Error('TURSO_AUTH_TOKEN が ScriptProperties に未設定です');

  var payload = {
    requests: statements.map(function(stmt) {
      return {
        type: 'execute',
        stmt: typeof stmt === 'string' ? { sql: stmt } : stmt
      };
    }),
    type: 'pipeline'
  };

  var response = UrlFetchApp.fetch(TURSO_URL + '/v3/pipeline', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = JSON.parse(response.getContentText());

  if (status !== 200) {
    throw new Error('Turso API error: ' + JSON.stringify(body));
  }

  return body.results;
}

/**
 * SELECT文を実行して行データを返す
 */
function tursoQuery(sql, args) {
  var stmt = args ? { sql: sql, args: args.map(function(a) { return { type: 'text', value: String(a) }; }) } : sql;
  var results = tursoExecute_([stmt]);
  var rows = parseResultRows_(results[0]);
  return { rows: rows, count: rows.length };
}

// ========================================
// パイプラインデータ取得
// ========================================

/**
 * パイプラインデータをTursoから取得（v2）
 */
function testTursoConnection() {
  var result = tursoQuery('SELECT COUNT(*) as cnt FROM performance_rawdata');
  Logger.log('Turso performance_rawdata count: ' + result.rows[0].cnt);
}

// ========================================
// Slack パイプライン期限リマインド通知
// ========================================

// Slack Webhook URLはGAS ScriptPropertiesに SLACK_WEBHOOK_URL として設定すること
function getSlackWebhookUrl_() {
  return PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
}

/**
 * 毎朝8時にトリガーで実行。action_deadlineが本日 or 超過の案件をSlack通知。
 * GASエディタ → トリガー → sendPipelineReminder → 日付ベース → 午前8時〜9時
 */
function sendPipelineReminder() {
  var now = new Date();
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var dayOfWeek = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'u')); // 1=月〜7=日
  // 土日はスキップ（6=土, 7=日）
  if (dayOfWeek === 6 || dayOfWeek === 7) return;

  var result = tursoQuery(
    "SELECT id, deal_name, company_name, owner, phase, deal_type, amount, probability, expected_start_date, next_action, action_deadline, memo FROM deals WHERE phase NOT IN ('受注','失注') AND action_deadline IS NOT NULL AND action_deadline != '' AND action_deadline <= ? ORDER BY action_deadline ASC",
    [todayStr]
  );

  var deals = result.rows;
  if (deals.length === 0) return; // 通知対象なし

  var overdue = [];
  var today = [];

  deals.forEach(function(d) {
    if (d.action_deadline === todayStr) {
      today.push(d);
    } else if (d.action_deadline < todayStr) {
      overdue.push(d);
    }
  });

  if (overdue.length === 0 && today.length === 0) return;

  // 曜日名（u: 1=月〜7=日）
  var dayNamesU = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日' };
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  var todayDay = dayNamesU[dayOfWeek];

  var lines = [];
  lines.push('🔔 *次アクション期限リマインド*　' + todayStr.replace(/-/g, '/') + '（' + todayDay + '）');
  lines.push('');

  if (overdue.length > 0) {
    lines.push('──────────────────────');
    lines.push('🔴 *期限超過（' + overdue.length + '件）*');
    lines.push('──────────────────────');
    lines.push('');
    overdue.forEach(function(d) {
      var diffDays = Math.floor((new Date(todayStr) - new Date(d.action_deadline)) / 86400000);
      var dlDate = d.action_deadline.substring(5).replace('-', '/');
      var dlDow = dayNames[new Date(d.action_deadline + 'T00:00:00+09:00').getDay()];
      var amt = formatYen_(d.amount);
      lines.push('*' + d.deal_name + '*　⚠️ `' + diffDays + '日超過`');
      lines.push('┣ 👤 *' + (d.owner || '-') + '*　┃　' + (d.phase || '-') + '　┃　💰 *' + amt + '*');
      lines.push('┗ 📌 ' + (d.next_action || '-'));
      lines.push('');
    });
  }

  if (today.length > 0) {
    lines.push('──────────────────────');
    lines.push('🟡 *本日期限（' + today.length + '件）*');
    lines.push('──────────────────────');
    lines.push('');
    today.forEach(function(d) {
      var amt = formatYen_(d.amount);
      lines.push('*' + d.deal_name + '*　📅 `本日`');
      lines.push('┣ 👤 *' + (d.owner || '-') + '*　┃　' + (d.phase || '-') + '　┃　💰 *' + amt + '*');
      lines.push('┗ 📌 ' + (d.next_action || '-'));
      lines.push('');
    });
  }

  lines.push('──────────────────────');
  lines.push('📎 <https://ebidigi.github.io/sales_dashboard_dynamic/?tab=pipeline|ダッシュボードで確認・編集する>');

  var payload = { text: lines.join('\n') };
  var webhookUrl = getSlackWebhookUrl_();
  if (!webhookUrl) { Logger.log('SLACK_WEBHOOK_URL not set'); return; }
  var res = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  Logger.log('Slack response: ' + res.getResponseCode() + ' ' + res.getContentText());
}

function formatYen_(amount) {
  var n = Number(amount || 0);
  var prefix = n < 0 ? '-¥' : '¥';
  var abs = Math.abs(n);
  var s = String(abs);
  var result = '';
  for (var i = s.length - 1, c = 0; i >= 0; i--, c++) {
    if (c > 0 && c % 3 === 0) result = ',' + result;
    result = s[i] + result;
  }
  return prefix + result;
}
