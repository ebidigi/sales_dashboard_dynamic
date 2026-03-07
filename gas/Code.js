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
        data = getMonthlyViewData();
        break;
      case 'rawdata':
        data = getRawData(e.parameter);
        break;
      case 'pipeline_v2':
        data = getPipelineDataV2();
        break;
      case 'sales_targets':
        data = getSalesTargetSettings();
        break;
      case 'sales_targets_save':
        data = saveSalesTargetSettings(JSON.parse(e.parameter.data || '{}'));
        break;
      case 'deal_upsert':
        data = upsertDeal(JSON.parse(e.parameter.data || '{}'));
        break;
      case 'deal_delete':
        data = deleteDeal(e.parameter.id);
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

    if (type === 'deal_upsert') {
      const result = upsertDeal(requestBody.data);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (type === 'deal_delete') {
      const result = deleteDeal(requestBody.id);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (type === 'sales_targets_save') {
      const result = saveSalesTargetSettings(requestBody.data);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (type === 'target_upsert') {
      const result = upsertTarget(requestBody.data);
      return ContentService
        .createTextOutput(JSON.stringify(result))
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

// スプレッドシートID（月次同期機能で引き続き使用）
const SPREADSHEET_ID = '1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM';

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
 * 稼働日数を計算する（土日 + 祝日を除外）
 * GoogleカレンダーAPIで日本の祝日を取得
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {{ totalDays: number, elapsedDays: number, standardProgress: number }}
 */
function calculateBusinessDays_(year, month) {
  var monthStart = new Date(year, month - 1, 1);
  var monthEnd = new Date(year, month, 0); // 月末日

  // 日本の祝日カレンダーから祝日を取得
  var holidays = {};
  try {
    var cal = CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
    if (cal) {
      var events = cal.getEvents(monthStart, new Date(year, month, 1)); // 翌月1日まで
      events.forEach(function(ev) {
        var d = ev.getStartTime();
        var key = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
        holidays[key] = true;
      });
    }
  } catch (e) {
    // カレンダーAPIが利用できない場合は祝日なしで計算
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
    standardProgress: standardProgress
  };
}

/**
 * 稼働日数をキャッシュ付きで取得（24時間キャッシュ）
 */
function getBusinessDaysCached_(year, month) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'bizdays_' + year + '_' + month;
  var cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  var result = calculateBusinessDays_(year, month);
  cache.put(cacheKey, JSON.stringify(result), 86400); // 24時間
  return result;
}

// ========================================
// 月次ビューデータ取得（Turso版）
// ========================================

/**
 * 月次ビューのデータを取得（Turso DB から）
 * レスポンス構造は旧スプレッドシート版と完全互換
 */
function getMonthlyViewData() {
  // キャッシュチェック（2分間）
  var cache = CacheService.getScriptCache();
  var cached = cache.get('monthlyViewData');
  if (cached) {
    return JSON.parse(cached);
  }

  var now = new Date();
  var year = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
  var month = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'MM'));
  var currentMonth = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
  var monthStartDate = currentMonth + '-01';
  var nextMonthStart = year + '-' + String(month < 12 ? month + 1 : 1).padStart(2, '0') + '-01';
  if (month === 12) {
    nextMonthStart = (year + 1) + '-01-01';
  }

  // 3クエリを1回のHTTPリクエストで並列実行
  var results = tursoExecute_([
    // (A) 当月の目標取得
    {
      sql: "SELECT member_name, project_name, target_calls, target_appointments, target_work_hours, calls_per_hour_target, call_to_appo_target, sales_target FROM targets WHERE target_month = ?",
      args: [{ type: 'text', value: currentMonth }]
    },
    // (B) 当月の実績集計（member_name_aliasesでJOIN、正規化名でGROUP BY）
    {
      sql: "SELECT COALESCE(a.member_name, REPLACE(SUBSTR(p.member_name, 1, CASE WHEN INSTR(p.member_name, '/') > 0 THEN INSTR(p.member_name, '/') - 1 ELSE LENGTH(p.member_name) END), '@', '')) AS name, p.project_name, SUM(p.call_count) AS calls, SUM(p.pr_count) AS pr, SUM(p.appointment_count) AS appo, SUM(p.call_hours) AS call_hours FROM performance_rawdata p LEFT JOIN member_name_aliases a ON p.member_name = a.raw_name WHERE p.input_date >= ? AND p.input_date < ? GROUP BY name, p.project_name",
      args: [{ type: 'text', value: monthStartDate }, { type: 'text', value: nextMonthStart }]
    },
    // (C) 当月の受注売上合計
    {
      sql: "SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS revenue FROM deals WHERE phase = '受注' AND strftime('%Y-%m', expected_start_date) = ?",
      args: [{ type: 'text', value: currentMonth }]
    },
    // (D) 当月の売上目標（settingsテーブルから）
    {
      sql: "SELECT value FROM settings WHERE key = ?",
      args: [{ type: 'text', value: 'sales_target_' + currentMonth }]
    }
  ]);

  var targets = parseResultRows_(results[0]);
  var actuals = parseResultRows_(results[1]);
  var revenueRow = parseResultRows_(results[2]);
  var salesTargetRows = parseResultRows_(results[3]);

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

  var totalSalesFromDeals = Number(revenueRow[0].revenue) || 0;
  var salesTarget = salesTargetRows.length > 0 ? Number(salesTargetRows[0].value) || 0 : 0;

  var response = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      sheetName: '月次ビュー',
      standardProgress: bizDays.standardProgress,
      elapsedDays: bizDays.elapsedDays,
      totalDays: bizDays.totalDays,
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
  cache.put('monthlyViewData', JSON.stringify(response), 120);

  return response;
}

// ========================================
// 実績rawdataからの集計（Turso版）
// ========================================

/**
 * 実績rawdataを取得・集計（Turso DB から）
 * レスポンス構造は旧スプレッドシート版と完全互換
 */
function getRawData(params) {
  // 日付範囲を決定
  var now = new Date();
  var year = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
  var month = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'MM'));

  var startDate, endDate;
  if (params && params.startDate) {
    startDate = params.startDate; // 'yyyy-MM-dd'
  } else {
    startDate = year + '-' + String(month).padStart(2, '0') + '-01';
  }
  if (params && params.endDate) {
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
function getPipelineDataV2() {
  // deals取得
  var dealsResult = tursoQuery(
    "SELECT * FROM deals WHERE phase NOT IN ('失注') ORDER BY CASE phase WHEN '提案済み' THEN 0 WHEN '見積もり提出済み' THEN 1 WHEN '提案前' THEN 2 WHEN '受注' THEN 3 WHEN '保留' THEN 4 ELSE 5 END, expected_start_date"
  );

  // 月別パイプライン集計（未受注）
  var pipelineResult = tursoQuery(
    "SELECT strftime('%Y-%m', expected_start_date) AS month, " +
    "COUNT(*) AS pl_count, " +
    "SUM(amount) AS pl_total, " +
    "SUM(CAST(amount AS REAL) * probability) AS weighted " +
    "FROM deals WHERE phase IN ('提案前', '提案済み', '見積もり提出済み') " +
    "GROUP BY month ORDER BY month"
  );

  // 月別売上（受注済み）
  var revenueResult = tursoQuery(
    "SELECT strftime('%Y-%m', expected_start_date) AS month, " +
    "SUM(amount) AS revenue " +
    "FROM deals WHERE phase = '受注' GROUP BY month ORDER BY month"
  );

  // 売上目標（settingsテーブルから）
  var targetsResult = tursoQuery(
    "SELECT key, value FROM settings WHERE key LIKE 'sales_target_%' ORDER BY key"
  );
  var salesTargets = (targetsResult.rows || []).map(function(r) {
    return {
      target_month: r.key.replace('sales_target_', ''),
      total_sales_target: Number(r.value || 0)
    };
  });

  return {
    deals: dealsResult.rows,
    pipeline: pipelineResult.rows,
    revenue: revenueResult.rows,
    salesTargets: salesTargets,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 月別売上目標の取得（settingsテーブルから）
 */
function getSalesTargetSettings() {
  var result = tursoQuery("SELECT key, value FROM settings WHERE key LIKE 'sales_target_%' ORDER BY key");
  var targets = {};
  (result.rows || []).forEach(function(r) {
    var monthKey = r.key.replace('sales_target_', '');
    targets[monthKey] = Number(r.value || 0);
  });
  return { targets: targets };
}

/**
 * 月別売上目標の保存（settingsテーブルへ）
 */
function saveSalesTargetSettings(data) {
  var statements = [];
  Object.keys(data).forEach(function(month) {
    var key = 'sales_target_' + month;
    var value = String(data[month] || 0);
    statements.push({
      sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')",
      args: [
        { type: 'text', value: key },
        { type: 'text', value: value },
        { type: 'text', value: value }
      ]
    });
  });
  if (statements.length > 0) {
    tursoExecute_(statements);
  }
  return { success: true };
}

/**
 * deal登録・更新
 */
function upsertDeal(data) {
  if (!data.deal_name || !data.owner) {
    throw new Error('deal_name と owner は必須です');
  }

  if (data.id) {
    var setClauses = [];
    var args = [];
    var fields = ['deal_name', 'company_name', 'owner', 'project_name', 'phase', 'deal_type',
                   'amount', 'probability', 'expected_start_date',
                   'next_action', 'action_deadline', 'memo'];
    fields.forEach(function(f) {
      if (data[f] !== undefined) {
        setClauses.push(f + ' = ?');
        args.push({ type: 'text', value: String(data[f]) });
      }
    });
    setClauses.push("updated_at = datetime('now')");
    args.push({ type: 'text', value: data.id });

    tursoExecute_([{
      sql: 'UPDATE deals SET ' + setClauses.join(', ') + ' WHERE id = ?',
      args: args
    }]);
    return { success: true, action: 'updated', id: data.id };
  } else {
    tursoExecute_([{
      sql: 'INSERT INTO deals (deal_name, company_name, owner, project_name, phase, deal_type, amount, probability, expected_start_date, next_action, action_deadline, memo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        { type: 'text', value: data.deal_name || '' },
        { type: 'text', value: data.company_name || '' },
        { type: 'text', value: data.owner || '' },
        { type: 'text', value: data.project_name || '' },
        { type: 'text', value: data.phase || '提案前' },
        { type: 'text', value: data.deal_type || '新規' },
        { type: 'text', value: String(data.amount || 0) },
        { type: 'text', value: String(data.probability || 0) },
        { type: 'text', value: data.expected_start_date || '' },
        { type: 'text', value: data.next_action || '' },
        { type: 'text', value: data.action_deadline || '' },
        { type: 'text', value: data.memo || '' },
      ]
    }]);
    return { success: true, action: 'created' };
  }
}

/**
 * deal削除
 */
function deleteDeal(id) {
  if (!id) throw new Error('id は必須です');
  tursoExecute_([{
    sql: 'DELETE FROM deals WHERE id = ?',
    args: [{ type: 'text', value: id }]
  }]);
  return { success: true, action: 'deleted', id: id };
}

/**
 * target登録・更新（UPSERT）
 */
function upsertTarget(data) {
  if (!data.member_name || !data.project_name || !data.target_month) {
    throw new Error('member_name, project_name, target_month は必須です');
  }

  tursoExecute_([{
    sql: "INSERT INTO targets (member_name, project_name, target_month, target_calls, target_appointments, target_work_hours, calls_per_hour_target, call_to_appo_target, sales_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(member_name, project_name, target_month) DO UPDATE SET target_calls = ?, target_appointments = ?, target_work_hours = ?, calls_per_hour_target = ?, call_to_appo_target = ?, sales_target = ?, updated_at = datetime('now')",
    args: [
      { type: 'text', value: data.member_name },
      { type: 'text', value: data.project_name },
      { type: 'text', value: data.target_month },
      { type: 'text', value: String(data.target_calls || 0) },
      { type: 'text', value: String(data.target_appointments || 0) },
      { type: 'text', value: String(data.target_work_hours || 0) },
      { type: 'text', value: String(data.calls_per_hour_target || '') },
      { type: 'text', value: String(data.call_to_appo_target || '') },
      { type: 'text', value: String(data.sales_target || 0) },
      { type: 'text', value: String(data.target_calls || 0) },
      { type: 'text', value: String(data.target_appointments || 0) },
      { type: 'text', value: String(data.target_work_hours || 0) },
      { type: 'text', value: String(data.calls_per_hour_target || '') },
      { type: 'text', value: String(data.call_to_appo_target || '') },
      { type: 'text', value: String(data.sales_target || 0) },
    ]
  }]);
  return { success: true, action: 'upserted' };
}

function testTursoConnection() {
  var result = tursoQuery('SELECT COUNT(*) as cnt FROM deals');
  Logger.log('Turso deals count: ' + result.rows[0].cnt);
}

function testGetPipelineDataV2() {
  var result = getPipelineDataV2();
  Logger.log(JSON.stringify(result, null, 2));
}
